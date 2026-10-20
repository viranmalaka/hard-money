"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  XCircle,
  AlertCircle,
  Inbox,
  Send,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface BankSmsItem {
  id: string;
  userId: string;
  sender: string;
  rawMessage: string;
  receivedAt: string;
  status: string;
  parseMethod: string | null;
  parsedPayload: any | null;
  reviewReason: string | null;
  failureReason: string | null;
  attempts: number;
}

interface AccountItem {
  id: string;
  name: string;
  type: string;
  currency: string;
  accountNumberLast4: string | null;
}

interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
}

export default function SmsReviewInboxPage() {
  const [items, setItems] = useState<BankSmsItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Form states per item
  const [formValues, setFormValues] = useState<
    Record<
      string,
      {
        accountId: string;
        amount: string;
        categoryId: string;
        note: string;
      }
    >
  >({});

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchInbox = async () => {
    try {
      const res = await fetch("/api/sms/inbox", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list: BankSmsItem[] = data.items || [];
        setItems(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].id);
        }

        // Initialize form values
        setFormValues((prev) => {
          const next = { ...prev };
          for (const item of list) {
            if (!next[item.id]) {
              const payload = item.parsedPayload || {};
              next[item.id] = {
                accountId: "",
                amount: payload.amountText || "",
                categoryId: "",
                note: payload.merchantOrEntity || item.sender,
              };
            }
          }
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountsAndCategories = async () => {
    try {
      const [accRes, catRes] = await Promise.all([
        fetch("/api/user/accounts", { cache: "no-store" }),
        fetch("/api/user/categories", { cache: "no-store" }),
      ]);

      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData.accounts || []);
      }
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchInbox();
    fetchAccountsAndCategories();
  }, []);

  const handleFieldChange = (
    itemId: string,
    field: "accountId" | "amount" | "categoryId" | "note",
    value: string
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { accountId: "", amount: "", categoryId: "", note: "" }),
        [field]: value,
      },
    }));
  };

  const handlePost = async (itemId: string) => {
    setSubmitting(itemId);
    setErrorMessage(null);

    const values = formValues[itemId] || {
      accountId: "",
      amount: "",
      categoryId: "",
      note: "",
    };

    if (!values.accountId) {
      setErrorMessage("Please select an account");
      setSubmitting(null);
      return;
    }

    try {
      const res = await fetch(`/api/sms/inbox/${itemId}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: values.accountId,
          amount: values.amount ? values.amount : undefined,
          categoryId: values.categoryId || undefined,
          note: values.note || undefined,
        }),
      });

      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== itemId));
        if (selectedId === itemId) {
          const remaining = items.filter((it) => it.id !== itemId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Failed to post transaction");
      }
    } catch {
      setErrorMessage("Network error posting transaction");
    } finally {
      setSubmitting(null);
    }
  };

  const handleIgnore = async (itemId: string) => {
    setSubmitting(itemId);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/sms/inbox/${itemId}/ignore`, {
        method: "POST",
      });

      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== itemId));
        if (selectedId === itemId) {
          const remaining = items.filter((it) => it.id !== itemId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch {
      setErrorMessage("Failed to ignore SMS");
    } finally {
      setSubmitting(null);
    }
  };

  const handleRetry = async (itemId: string) => {
    setSubmitting(itemId);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/sms/inbox/${itemId}/retry`, {
        method: "POST",
      });

      if (res.ok) {
        await fetchInbox();
      }
    } catch {
      setErrorMessage("Failed to retry SMS");
    } finally {
      setSubmitting(null);
    }
  };

  const formatReviewReason = (reason: string | null) => {
    switch (reason) {
      case "NO_GEMINI_KEY":
        return "No Gemini key";
      case "LOW_CONFIDENCE":
        return "Low confidence";
      case "VALIDATION_FAILED":
        return "Validation failed";
      case "ACCOUNT_UNMATCHED":
        return "Account unmatched";
      case "ALWAYS_REVIEW":
        return "Always review";
      case "POSSIBLE_DUPLICATE":
        return "Possible duplicate";
      default:
        return reason || "Needs Review";
    }
  };

  const selectedItem = items.find((it) => it.id === selectedId) || items[0] || null;

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Link
            href="/more" transitionTypes={["nav-back"]}
            className="p-1 rounded hover:bg-surface text-[var(--text-muted)] transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
              SMS Review Inbox
            </h1>
            {items.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--accent)] text-white">
                {items.length}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={fetchInbox}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-hairline font-medium hover:bg-surface text-[var(--text)] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 rounded bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs font-medium text-[var(--expense)] flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && !loading && (
        <div data-testid="inbox-empty">
          <EmptyState
            title="Inbox is clear"
            description="No bank SMS alerts currently require manual review or account matching."
          />
        </div>
      )}

      {/* Mobile View: Full-screen vertical list with actions */}
      <div className="block md:hidden space-y-3">
        {items.map((item) => {
          const form = formValues[item.id] || {
            accountId: "",
            amount: "",
            categoryId: "",
            note: "",
          };

          return (
            <div
              key={item.id}
              data-testid="inbox-item"
              id={`inbox-item-${item.id}`}
              className="flat-card p-4 space-y-3 border-l-4 border-l-[var(--accent)]"
            >
              <div className="flex items-center justify-between">
                <span
                  data-testid="inbox-item-sender"
                  className="font-bold text-xs text-[var(--text)]"
                >
                  {item.sender}
                </span>
                <span
                  data-testid="inbox-review-reason"
                  data-reason={item.reviewReason}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20"
                >
                  {formatReviewReason(item.reviewReason)}
                </span>
              </div>

              <div
                data-testid="inbox-item-raw"
                className="p-2.5 rounded bg-[var(--bg)] border border-hairline font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed select-all"
              >
                {item.rawMessage}
              </div>

              {item.failureReason && (
                <div
                  data-testid="inbox-failure-info"
                  className="text-[11px] text-[var(--expense)] flex items-center gap-1.5"
                >
                  <ShieldAlert size={13} />
                  <span>{item.failureReason}</span>
                </div>
              )}

              {/* Edit Controls */}
              <div className="space-y-2 pt-2 border-t border-hairline">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">
                      Account *
                    </label>
                    <select
                      data-testid="inbox-account-select"
                      value={form.accountId}
                      onChange={(e) => handleFieldChange(item.id, "accountId", e.target.value)}
                      className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">-- Select Account --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">
                      Amount (LKR) *
                    </label>
                    <input
                      data-testid="inbox-amount-input"
                      type="text"
                      value={form.amount}
                      onChange={(e) => handleFieldChange(item.id, "amount", e.target.value)}
                      placeholder="e.g. 1500.00"
                      className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">
                      Category
                    </label>
                    <select
                      data-testid="inbox-category-select"
                      value={form.categoryId}
                      onChange={(e) => handleFieldChange(item.id, "categoryId", e.target.value)}
                      className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">-- Optional Category --</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon || "📁"} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">
                      Note / Entity
                    </label>
                    <input
                      data-testid="inbox-note-input"
                      type="text"
                      value={form.note}
                      onChange={(e) => handleFieldChange(item.id, "note", e.target.value)}
                      className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    data-testid="inbox-post-btn"
                    disabled={submitting === item.id}
                    onClick={() => handlePost(item.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    <span>Post</span>
                  </button>

                  <button
                    type="button"
                    data-testid="inbox-ignore-btn"
                    disabled={submitting === item.id}
                    onClick={() => handleIgnore(item.id)}
                    className="flex items-center justify-center gap-1 h-8 px-3 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"
                  >
                    <XCircle size={14} />
                    <span>Ignore</span>
                  </button>

                  <button
                    type="button"
                    data-testid="inbox-retry-btn"
                    disabled={submitting === item.id}
                    onClick={() => handleRetry(item.id)}
                    className="flex items-center justify-center gap-1 h-8 px-3 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"
                  >
                    <RefreshCw size={13} className={submitting === item.id ? "animate-spin" : ""} />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop View: Side panel / Master-Detail layout */}
      {items.length > 0 && (
        <div className="hidden md:grid md:grid-cols-12 gap-4 items-start">
          {/* Master List */}
          <div className="col-span-5 flat-card divide-y divide-hairline overflow-hidden">
            <div className="p-3 bg-[var(--surface-hover)] border-b border-hairline flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text)]">Pending Review</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>

            <div className="max-h-[600px] overflow-y-auto divide-y divide-hairline">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    data-testid="inbox-item"
                    onClick={() => setSelectedId(item.id)}
                    className={`p-3 cursor-pointer transition-colors space-y-1.5 ${
                      isSelected
                        ? "bg-[var(--accent)]/10 border-l-4 border-l-[var(--accent)]"
                        : "hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        data-testid="inbox-item-sender"
                        className="font-semibold text-xs text-[var(--text)]"
                      >
                        {item.sender}
                      </span>
                      <span
                        data-testid="inbox-review-reason"
                        data-reason={item.reviewReason}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      >
                        {formatReviewReason(item.reviewReason)}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-muted)] line-clamp-2 font-mono">
                      {item.rawMessage}
                    </p>

                    <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between pt-1">
                      <span>{new Date(item.receivedAt).toLocaleTimeString()}</span>
                      {item.attempts > 1 && (
                        <span>Attempts: {item.attempts}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail / Action Side Panel */}
          {selectedItem && (
            <div className="col-span-7 flat-card p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    Review & Post
                  </h3>
                  <span className="text-xs text-[var(--text-muted)]">
                    From {selectedItem.sender} • Received{" "}
                    {new Date(selectedItem.receivedAt).toLocaleString()}
                  </span>
                </div>

                <span
                  data-testid="inbox-review-reason"
                  data-reason={selectedItem.reviewReason}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20"
                >
                  {formatReviewReason(selectedItem.reviewReason)}
                </span>
              </div>

              {/* Raw message */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Raw SMS Content
                </span>
                <div
                  data-testid="inbox-item-raw"
                  className="p-3 rounded bg-[var(--bg)] border border-hairline font-mono text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed select-all"
                >
                  {selectedItem.rawMessage}
                </div>
              </div>

              {selectedItem.failureReason && (
                <div
                  data-testid="inbox-failure-info"
                  className="p-2.5 rounded bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs font-medium text-[var(--expense)] flex items-center gap-2"
                >
                  <ShieldAlert size={14} className="flex-shrink-0" />
                  <span>{selectedItem.failureReason}</span>
                </div>
              )}

              {/* Edit Controls */}
              {(() => {
                const form = formValues[selectedItem.id] || {
                  accountId: "",
                  amount: "",
                  categoryId: "",
                  note: "",
                };

                return (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--text-muted)]">
                          Account *
                        </label>
                        <select
                          data-testid="inbox-account-select"
                          value={form.accountId}
                          onChange={(e) =>
                            handleFieldChange(selectedItem.id, "accountId", e.target.value)
                          }
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">-- Select Account --</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--text-muted)]">
                          Amount (LKR) *
                        </label>
                        <input
                          data-testid="inbox-amount-input"
                          type="text"
                          value={form.amount}
                          onChange={(e) =>
                            handleFieldChange(selectedItem.id, "amount", e.target.value)
                          }
                          placeholder="e.g. 1500.00"
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--text-muted)]">
                          Category
                        </label>
                        <select
                          data-testid="inbox-category-select"
                          value={form.categoryId}
                          onChange={(e) =>
                            handleFieldChange(selectedItem.id, "categoryId", e.target.value)
                          }
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">-- Optional Category --</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.icon || "📁"} {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--text-muted)]">
                          Note / Merchant
                        </label>
                        <input
                          data-testid="inbox-note-input"
                          type="text"
                          value={form.note}
                          onChange={(e) =>
                            handleFieldChange(selectedItem.id, "note", e.target.value)
                          }
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex items-center justify-between pt-3 border-t border-hairline">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid="inbox-ignore-btn"
                          disabled={submitting === selectedItem.id}
                          onClick={() => handleIgnore(selectedItem.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"
                        >
                          <XCircle size={14} />
                          <span>Ignore</span>
                        </button>

                        <button
                          type="button"
                          data-testid="inbox-retry-btn"
                          disabled={submitting === selectedItem.id}
                          onClick={() => handleRetry(selectedItem.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"
                        >
                          <RefreshCw
                            size={13}
                            className={submitting === selectedItem.id ? "animate-spin" : ""}
                          />
                          <span>Retry Parser</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        data-testid="inbox-post-btn"
                        disabled={submitting === selectedItem.id}
                        onClick={() => handlePost(selectedItem.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        <span>Post Transaction</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  XCircle,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { queryKeys } from "@/lib/api/query-keys";
import { getAccounts, getCategories } from "@/services/user-service";
import {
  ignoreInboxItem,
  listInbox,
  mergeTransferInboxItem,
  postInboxItem,
  retryInboxItem,
} from "@/services/inbox-service";
import {
  InboxAccount,
  InboxCategory,
  InboxFormValues,
  MobileInboxItem,
  InboxMasterItem,
} from "@/components/inbox/inbox-items";

const EMPTY_FORM: InboxFormValues = {
  accountId: "",
  amount: "",
  categoryId: "",
  note: "",
  toAccountId: "",
  destinationAmount: "",
  exchangeRate: "",
};

export default function SmsReviewInboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, InboxFormValues>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const inboxQuery = useQuery({ queryKey: queryKeys.inbox.all(), queryFn: listInbox });
  const accountsQuery = useQuery({ queryKey: queryKeys.accounts.all(), queryFn: getAccounts });
  const categoriesQuery = useQuery({ queryKey: queryKeys.categories.all(), queryFn: getCategories });
  const items = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const accounts: InboxAccount[] = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories: InboxCategory[] = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const loading = inboxQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading;

  useEffect(() => {
    queueMicrotask(() => {
      if (items.length > 0 && !selectedId) setSelectedId(items[0].id);
      setFormValues((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!next[item.id]) {
            const payload = (item.parsedPayload as Record<string, unknown> | null) || {};
            const suggestedTransfer = payload.suggestedTransfer as
              | { fromAccountId?: string; toAccountId?: string }
              | undefined;
            const isSettlement = item.reviewReason === "CREDIT_CARD_SETTLEMENT";
            const accountLast4 = typeof payload.accountLast4 === "string" ? payload.accountLast4 : null;
            const creditCardAccountId =
              typeof payload.creditCardAccountId === "string"
                ? payload.creditCardAccountId
                : undefined;
            const defaultCreditCardId =
              creditCardAccountId ||
              suggestedTransfer?.toAccountId ||
              (accounts.find(
                (a) =>
                  a.type === "CREDIT_CARD" &&
                  accountLast4 &&
                  a.name.includes(accountLast4)
              )?.id ?? "");

            next[item.id] = {
              accountId: isSettlement ? suggestedTransfer?.fromAccountId || "" : "",
              amount: typeof payload.amountText === "string" ? payload.amountText : "",
              categoryId: "",
              note:
                typeof payload.merchantOrEntity === "string"
                  ? payload.merchantOrEntity
                  : isSettlement
                    ? "Credit Card Settlement"
                    : item.sender,
              toAccountId: isSettlement
                ? defaultCreditCardId
                : suggestedTransfer?.toAccountId || "",
              destinationAmount: "",
              exchangeRate: "",
            };
          }
        }
        return next;
      });
    });
  }, [items, selectedId, accounts]);

  const removeOptimistically = (itemId: string) => {
    const previous = queryClient.getQueryData(queryKeys.inbox.all());
    queryClient.setQueryData(
      queryKeys.inbox.all(),
      items.filter((item) => item.id !== itemId)
    );
    return previous;
  };
  const postMutation = useMutation({
    mutationFn: ({
      itemId,
      input,
    }: {
      itemId: string;
      input: {
        accountId: string;
        amount?: string;
        categoryId?: string;
        note?: string;
        toAccountId?: string;
        destinationAmount?: string;
        exchangeRate?: string;
      };
    }) => postInboxItem(itemId, input),
    onMutate: ({ itemId }) => removeOptimistically(itemId),
    onError: (_error, _variables, previous) =>
      queryClient.setQueryData(queryKeys.inbox.all(), previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
  });
  const ignoreMutation = useMutation({
    mutationFn: ignoreInboxItem,
    onMutate: removeOptimistically,
    onError: (_error, _itemId, previous) =>
      queryClient.setQueryData(queryKeys.inbox.all(), previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
  });
  const retryMutation = useMutation({
    mutationFn: retryInboxItem,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
  });
  const mergeTransferMutation = useMutation({
    mutationFn: (itemId: string) => mergeTransferInboxItem(itemId),
    onMutate: removeOptimistically,
    onError: (_error, _itemId, previous) =>
      queryClient.setQueryData(queryKeys.inbox.all(), previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
  });

  const handleFieldChange = useCallback(
    (
      itemId: string,
      field:
        | "accountId"
        | "amount"
        | "categoryId"
        | "note"
        | "toAccountId"
        | "destinationAmount"
        | "exchangeRate",
      value: string
    ) => {
      setFormValues((prev) => ({
        ...prev,
        [itemId]: {
          ...(prev[itemId] || EMPTY_FORM),
          [field]: value,
        },
      }));
    },
    []
  );

  const handlePost = useCallback(
    async (itemId: string) => {
      setSubmitting(itemId);
      setErrorMessage(null);

      const values = formValues[itemId] || EMPTY_FORM;

      if (!values.accountId) {
        setErrorMessage("Please select an account");
        setSubmitting(null);
        return;
      }

      try {
        await postMutation.mutateAsync({
          itemId,
          input: {
            accountId: values.accountId,
            amount: values.amount ? values.amount : undefined,
            categoryId: values.categoryId || undefined,
            note: values.note || undefined,
            toAccountId: values.toAccountId || undefined,
            destinationAmount: values.destinationAmount || undefined,
            exchangeRate: values.exchangeRate || undefined,
          },
        });
        if (selectedId === itemId) {
          const remaining = items.filter((it) => it.id !== itemId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
      } catch {
        setErrorMessage("Network error posting transaction");
      } finally {
        setSubmitting(null);
      }
    },
    [formValues, items, postMutation, selectedId]
  );

  const handleIgnore = useCallback(
    async (itemId: string) => {
      setSubmitting(itemId);
      setErrorMessage(null);

      try {
        await ignoreMutation.mutateAsync(itemId);
        if (selectedId === itemId) {
          const remaining = items.filter((it) => it.id !== itemId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
      } catch {
        setErrorMessage("Failed to ignore SMS");
      } finally {
        setSubmitting(null);
      }
    },
    [ignoreMutation, items, selectedId]
  );

  const handleRetry = useCallback(
    async (itemId: string) => {
      setSubmitting(itemId);
      setErrorMessage(null);

      try {
        await retryMutation.mutateAsync(itemId);
      } catch {
        setErrorMessage("Failed to retry SMS");
      } finally {
        setSubmitting(null);
      }
    },
    [retryMutation]
  );

  const handleMergeTransfer = useCallback(
    async (itemId: string) => {
      setSubmitting(itemId);
      setErrorMessage(null);

      try {
        await mergeTransferMutation.mutateAsync(itemId);
        if (selectedId === itemId) {
          const remaining = items.filter((it) => it.id !== itemId);
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
      } catch {
        setErrorMessage("Failed to merge transfer");
      } finally {
        setSubmitting(null);
      }
    },
    [items, mergeTransferMutation, selectedId]
  );

  const itemActions = useMemo(
    () => ({
      onPost: (id: string) => void handlePost(id),
      onIgnore: (id: string) => void handleIgnore(id),
      onRetry: (id: string) => void handleRetry(id),
      onMergeTransfer: (id: string) => void handleMergeTransfer(id),
      onFieldChange: handleFieldChange,
    }),
    [handleFieldChange, handleIgnore, handleMergeTransfer, handlePost, handleRetry]
  );

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
      case "POSSIBLE_TRANSFER":
        return "Possible transfer";
      case "CREDIT_CARD_SETTLEMENT":
        return "Card Settlement Review";
      default:
        return reason || "Needs Review";
    }
  };

  const selectedItem = items.find((it) => it.id === selectedId) || items[0] || null;

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="SMS Review Inbox"
        subtitle={items.length > 0 ? `${items.length} Pending Review` : "Automated Alert Matching"}
        backHref="/more"
        backLabel="Back to More"
        rightSlot={
          <button
            type="button"
            onClick={() => void inboxQuery.refetch()}
            className="h-10 px-4 inline-flex items-center gap-1.5 text-xs rounded-2xl border border-[var(--border)] bg-[var(--surface)] font-semibold hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs font-semibold text-[var(--expense)] flex items-center gap-2.5">
          <AlertCircle size={16} />
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

      {/* Mobile View */}
      <div className="block md:hidden space-y-4">
        {items.map((item) => (
          <MobileInboxItem
            key={item.id}
            item={item}
            form={formValues[item.id] || EMPTY_FORM}
            accounts={accounts}
            categories={categories}
            submitting={submitting === item.id}
            actions={itemActions}
          />
        ))}
      </div>

      {/* Desktop View: Master-Detail layout */}
      {items.length > 0 && (
        <div className="hidden md:grid md:grid-cols-12 gap-5 items-start">
          {/* Master List */}
          <div className="col-span-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs">
            <div className="p-4 bg-[var(--bg)] border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)]">Pending Review</span>
              <span className="text-xs text-[var(--text-muted)]">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>

            <div className="max-h-[620px] overflow-y-auto divide-y divide-[var(--border)]">
              {items.map((item) => (
                <InboxMasterItem
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>

          {/* Detail / Action Side Panel */}
          {selectedItem && (
            <div className="col-span-7 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--text)]">Review & Post</h3>
                  <span className="text-xs text-[var(--text-muted)] block mt-0.5">
                    From {selectedItem.sender} • Received{" "}
                    {new Date(selectedItem.receivedAt).toLocaleString()}
                  </span>
                </div>

                <span
                  data-testid="inbox-review-reason"
                  data-reason={selectedItem.reviewReason}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0"
                >
                  {formatReviewReason(selectedItem.reviewReason)}
                </span>
              </div>

              {/* Raw message */}
              <div className="space-y-1.5">
                <span className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                  Raw SMS Content
                </span>
                <div
                  data-testid="inbox-item-raw"
                  className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] font-mono text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed select-all"
                >
                  {selectedItem.rawMessage}
                </div>
              </div>

              {selectedItem.failureReason && (
                <div
                  data-testid="inbox-failure-info"
                  className="p-3.5 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs font-semibold text-[var(--expense)] flex items-center gap-2.5"
                >
                  <ShieldAlert size={15} className="shrink-0" />
                  <span>{selectedItem.failureReason}</span>
                </div>
              )}

              {(selectedItem.reviewReason === "POSSIBLE_TRANSFER" ||
                selectedItem.reviewReason === "CREDIT_CARD_SETTLEMENT") &&
                Boolean(
                  (selectedItem.parsedPayload as Record<string, unknown> | null)?.suggestedTransfer
                ) && (
                  <div className="p-4 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)]">
                      <ArrowRightLeft size={16} />
                      <span>
                        {selectedItem.reviewReason === "CREDIT_CARD_SETTLEMENT"
                          ? "Matching Settlement Debit Found"
                          : "Possible Inter-Account Transfer Detected"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      {selectedItem.reviewReason === "CREDIT_CARD_SETTLEMENT"
                        ? "This payment matches a recent debit transaction on another account. You can merge both into a single verified Credit Card Settlement transfer, or customize below."
                        : "This SMS matches a recent counterpart transaction on another account. You can merge both into a single verified Transfer, or edit and post as a separate transaction below."}
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        data-testid="inbox-merge-transfer-btn"
                        disabled={submitting === selectedItem.id}
                        onClick={() => handleMergeTransfer(selectedItem.id)}
                        className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <ArrowRightLeft size={14} />
                        <span>Merge as Transfer</span>
                      </button>
                    </div>
                  </div>
                )}

              {selectedItem.reviewReason === "CREDIT_CARD_SETTLEMENT" &&
                !Boolean(
                  (selectedItem.parsedPayload as Record<string, unknown> | null)?.suggestedTransfer
                ) && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-1">
                    <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                      <CreditCard size={15} />
                      <span>Credit Card Settlement Review</span>
                    </div>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                      This inward payment is flagged for settlement handling. Please select the
                      funding source account and destination credit card below to post as a verified
                      settlement transfer.
                    </p>
                  </div>
                )}

              {/* Edit Controls */}
              {(() => {
                const form = formValues[selectedItem.id] || EMPTY_FORM;
                const isSettlement = selectedItem.reviewReason === "CREDIT_CARD_SETTLEMENT";

                return (
                  <div className="space-y-4 pt-2">
                    {isSettlement ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Funding Account (From) *
                            </label>
                            <select
                              data-testid="inbox-account-select"
                              value={form.accountId}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "accountId", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="">-- Select Source Account --</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} ({acc.type})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Credit Card (To) *
                            </label>
                            <select
                              data-testid="inbox-to-account-select"
                              value={form.toAccountId}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "toAccountId", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="">-- Select Credit Card --</option>
                              {accounts
                                .filter((acc) => acc.type === "CREDIT_CARD")
                                .map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Settlement Amount (LKR) *
                            </label>
                            <input
                              data-testid="inbox-amount-input"
                              type="text"
                              value={form.amount}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "amount", e.target.value)
                              }
                              placeholder="e.g. 1500.00"
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Settlement Note
                            </label>
                            <input
                              data-testid="inbox-note-input"
                              type="text"
                              value={form.note}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "note", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Account *
                            </label>
                            <select
                              data-testid="inbox-account-select"
                              value={form.accountId}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "accountId", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="">-- Select Account --</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} ({acc.type})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
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
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Category
                            </label>
                            <select
                              data-testid="inbox-category-select"
                              value={form.categoryId}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "categoryId", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="">-- Optional Category --</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-[var(--text-muted)] block">
                              Note / Merchant
                            </label>
                            <input
                              data-testid="inbox-note-input"
                              type="text"
                              value={form.note}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.id, "note", e.target.value)
                              }
                              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Actions Toolbar */}
                    <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          data-testid="inbox-ignore-btn"
                          disabled={submitting === selectedItem.id}
                          onClick={() => handleIgnore(selectedItem.id)}
                          className="h-11 px-4 inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-xs font-semibold text-[var(--text-muted)] transition-colors cursor-pointer"
                        >
                          <XCircle size={15} />
                          <span>Ignore</span>
                        </button>

                        <button
                          type="button"
                          data-testid="inbox-retry-btn"
                          disabled={submitting === selectedItem.id}
                          onClick={() => handleRetry(selectedItem.id)}
                          className="h-11 px-4 inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-xs font-semibold text-[var(--text-muted)] transition-colors cursor-pointer"
                        >
                          <RefreshCw
                            size={14}
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
                        className="h-11 px-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 size={15} />
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

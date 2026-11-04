"use client";

import React, { useMemo, useState } from "react";
import { Plus, Bookmark, Trash2, Edit2, X, Zap } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAccounts, useCategories, useTemplates, useSync } from "@/components/sync-provider";
import { localCreateTemplate, localUpdateTemplate, localDeleteTemplate } from "@/lib/sync/client";
import { LocalTemplate } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryIcon } from "@/components/ui/category-icon";
import { groupCategoriesByType } from "@/lib/categories-data";
import { useQuickAdd } from "@/components/transaction/quick-add-context";

function formatMinorForInput(amountMinor?: number | null): string {
  if (!amountMinor || amountMinor <= 0) return "";
  return amountMinor % 100 === 0
    ? String(amountMinor / 100)
    : (amountMinor / 100).toFixed(2);
}

export default function BookmarksPage() {
  const templates = useTemplates();
  const accounts = useAccounts();
  const categories = useCategories();
  const { db, userId } = useSync();
  const { openQuickAdd } = useQuickAdd();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LocalTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"EXPENSE" | "INCOME" | "TRANSFER">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);

  const filteredCategories = useMemo(() => {
    if (type === "INCOME") return categoryGroups.income;
    if (type === "EXPENSE") return categoryGroups.expense;
    return [];
  }, [type, categoryGroups]);

  const selectedAccount = useMemo(
    () => activeAccounts.find((a) => a.id === accountId),
    [activeAccounts, accountId]
  );

  const handleTypeChange = (nextType: "EXPENSE" | "INCOME" | "TRANSFER") => {
    setType(nextType);
    if (nextType === "TRANSFER") {
      if (!toAccountId || toAccountId === accountId) {
        const fallbackDest = activeAccounts.find((a) => a.id !== accountId);
        setToAccountId(fallbackDest?.id || "");
      }
      return;
    }
    const nextGroup = nextType === "INCOME" ? categoryGroups.income : categoryGroups.expense;
    if (!categoryId || !nextGroup.some((c) => c.id === categoryId)) {
      setCategoryId(nextGroup[0]?.id || "");
    }
  };

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName("");
    setType("EXPENSE");
    const firstAcc = activeAccounts[0]?.id || "";
    const secondAcc = activeAccounts.find((a) => a.id !== firstAcc)?.id || "";
    setAccountId(firstAcc);
    setToAccountId(secondAcc);
    setCategoryId(categoryGroups.expense[0]?.id || "");
    setAmountStr("");
    setNote("");
    setErrorMsg("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (t: LocalTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setType(t.type);
    setAccountId(t.accountId || "");
    setToAccountId(t.toAccountId || "");
    setCategoryId(t.categoryId || "");
    setAmountStr(formatMinorForInput(t.defaultAmountMinor));
    setNote(t.note || "");
    setErrorMsg("");
    setIsFormOpen(true);
  };

  const handleUseTemplate = (t: LocalTemplate) => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "hardmoney_quick_add_draft",
          JSON.stringify({
            type: t.type,
            accountId: t.accountId || "",
            toAccountId: t.type === "TRANSFER" ? t.toAccountId || "" : "",
            categoryId: t.type !== "TRANSFER" ? t.categoryId || "" : "",
            expression: formatMinorForInput(t.defaultAmountMinor),
            note: t.note || "",
          })
        );
      } catch {
        // ignore storage error
      }
    }
    openQuickAdd({
      type: t.type,
      accountId: t.accountId || undefined,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Please enter a name for the bookmark");
      return;
    }

    const trimmedAmount = amountStr.trim();
    const parsedMinor = trimmedAmount ? parseMoneyToMinor(trimmedAmount) : null;
    if (trimmedAmount && (!parsedMinor || parsedMinor <= 0)) {
      setErrorMsg("Please enter a valid positive default amount (or leave blank)");
      return;
    }

    if (type === "TRANSFER" && accountId && toAccountId && accountId === toAccountId) {
      setErrorMsg("Destination account must differ from source account");
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        await localUpdateTemplate(db, editingTemplate.id, {
          name: name.trim(),
          type,
          accountId: accountId || null,
          toAccountId: type === "TRANSFER" ? toAccountId || null : null,
          categoryId: type !== "TRANSFER" ? categoryId || null : null,
          defaultAmountMinor: parsedMinor,
          note: note.trim() || null,
        });
      } else {
        await localCreateTemplate(db, {
          userId: userId || "default",
          name: name.trim(),
          type,
          accountId: accountId || null,
          toAccountId: type === "TRANSFER" ? toAccountId || null : null,
          categoryId: type !== "TRANSFER" ? categoryId || null : null,
          defaultAmountMinor: parsedMinor,
          note: note.trim() || null,
        });
      }

      setIsFormOpen(false);
      setEditingTemplate(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save bookmark");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await localDeleteTemplate(db, id);
    } catch (err: unknown) {
      console.error("Failed to delete bookmark:", err);
    }
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Bookmarks & Templates"
        subtitle="1-Tap Quick-Add Presets"
        backHref="/more"
        backLabel="Back to More"
        rightSlot={
          <button
            type="button"
            data-testid="create-bookmark-btn"
            onClick={handleOpenCreate}
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Bookmark</span>
            <span className="sm:hidden">New</span>
          </button>
        }
      />

      {/* Template Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSave}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-sm animate-in fade-in"
        >
          <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
            <div>
              <h2 className="font-bold text-sm text-[var(--text)]">
                {editingTemplate ? "Edit Bookmark" : "Create New Bookmark"}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Pre-configure account, category, amount, and note for fast entry
              </p>
            </div>
            <button
              type="button"
              data-testid="template-cancel-btn"
              onClick={() => setIsFormOpen(false)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Name *</label>
              <input
                type="text"
                data-testid="template-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Milk, Monthly Rent"
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Type</label>
              <select
                data-testid="template-type-select"
                value={type}
                onChange={(e) =>
                  handleTypeChange(e.target.value as "EXPENSE" | "INCOME" | "TRANSFER")
                }
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                {type === "TRANSFER" ? "From Account" : "Account"}
              </label>
              <select
                data-testid="template-account-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">(None)</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Category / To Account */}
            {type === "TRANSFER" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  To Account
                </label>
                <select
                  data-testid="template-to-account-select"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">(None)</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  Category
                </label>
                <select
                  data-testid="template-category-select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">(None)</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Default Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Default Amount ({selectedAccount?.currency || "LKR"}, optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                data-testid="template-amount-input"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="e.g. 250"
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Note (optional)
              </label>
              <input
                type="text"
                data-testid="template-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Morning fresh milk"
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {errorMsg && <p className="text-xs text-[var(--expense)] font-semibold">{errorMsg}</p>}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="h-11 px-4 rounded-2xl border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              data-testid="template-save-btn"
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save Bookmark"}
            </button>
          </div>
        </form>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <EmptyState
          title="No bookmarks yet"
          description="Create bookmarks for repetitive transactions to pre-fill Quick-Add with 1 tap."
          icon={<Bookmark size={24} />}
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
            const acc = t.accountId ? accounts.find((a) => a.id === t.accountId) : null;
            const toAcc = t.toAccountId ? accounts.find((a) => a.id === t.toAccountId) : null;
            const currency = acc?.currency || "LKR";

            return (
              <div
                key={t.id}
                data-testid={`template-item-${t.id}`}
                className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:border-[var(--accent)]/40 transition-colors shadow-xs"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {cat ? (
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: cat.color || "#059669" }}
                    >
                      <CategoryIcon name={cat.icon} size={18} className="text-white" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                      <Bookmark size={18} />
                    </div>
                  )}

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text)] leading-snug">
                        {t.name}
                      </span>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded-full border font-mono font-semibold uppercase ${
                          t.type === "EXPENSE"
                            ? "bg-[var(--expense)]/10 border-[var(--expense)]/25 text-[var(--expense)]"
                            : t.type === "INCOME"
                              ? "bg-[var(--income)]/10 border-[var(--income)]/25 text-[var(--income)]"
                              : "bg-[var(--accent)]/10 border-[var(--accent)]/25 text-[var(--accent)]"
                        }`}
                      >
                        {t.type}
                      </span>
                    </div>

                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 flex-wrap">
                      {acc && (
                        <span>
                          {t.type === "TRANSFER" && toAcc
                            ? `${acc.name} → ${toAcc.name}`
                            : acc.name}
                        </span>
                      )}
                      {cat && <span>{acc ? `• ${cat.name}` : cat.name}</span>}
                      {t.note && (
                        <span className="truncate">
                          {acc || cat ? `• ${t.note}` : t.note}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--border)] shrink-0">
                  {t.defaultAmountMinor ? (
                    <span className="font-mono font-extrabold text-sm sm:text-base tabular-nums text-[var(--text)]">
                      {formatMoney(t.defaultAmountMinor, currency)}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">Variable amount</span>
                  )}

                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <button
                      type="button"
                      data-testid={`template-use-${t.id}`}
                      onClick={() => handleUseTemplate(t)}
                      className="h-9 px-3 rounded-xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors cursor-pointer"
                      title="Add transaction from this bookmark"
                    >
                      <Zap size={13} />
                      <span>Use</span>
                    </button>
                    <button
                      type="button"
                      data-testid={`template-edit-${t.id}`}
                      onClick={() => handleOpenEdit(t)}
                      className="w-9 h-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                      title="Edit bookmark"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      data-testid={`template-delete-${t.id}`}
                      onClick={() => handleDelete(t.id)}
                      className="w-9 h-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--expense)] hover:border-[var(--expense)]/40 transition-colors cursor-pointer"
                      title="Delete bookmark"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

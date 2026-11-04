"use client";

import React, { useState } from "react";
import { Plus, Bookmark, Trash2, Edit2, X } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { useAccounts, useCategories, useTemplates, useSync } from "@/components/sync-provider";
import { localCreateTemplate, localUpdateTemplate, localDeleteTemplate } from "@/lib/sync/client";
import { LocalTemplate } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { EmptyState } from "@/components/ui/empty-state";

export default function BookmarksPage() {
  const templates = useTemplates();
  const accounts = useAccounts();
  const categories = useCategories();
  const { db, userId } = useSync();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LocalTemplate | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<"EXPENSE" | "INCOME" | "TRANSFER">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName("");
    setType("EXPENSE");
    setAccountId(activeAccounts[0]?.id || "");
    setToAccountId(activeAccounts[1]?.id || "");
    setCategoryId(categories[0]?.id || "");
    setAmountStr("");
    setNote("");
    setErrorMsg("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (t: LocalTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setType(t.type);
    setAccountId(t.accountId || activeAccounts[0]?.id || "");
    setToAccountId(t.toAccountId || "");
    setCategoryId(t.categoryId || categories[0]?.id || "");
    setAmountStr(t.defaultAmountMinor ? (t.defaultAmountMinor / 100).toFixed(2) : "");
    setNote(t.note || "");
    setErrorMsg("");
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Please enter a name for the bookmark");
      return;
    }

    const defaultAmountMinor = amountStr.trim() ? parseMoneyToMinor(amountStr) : null;

    try {
      if (editingTemplate) {
        await localUpdateTemplate(db, editingTemplate.id, {
          name: name.trim(),
          type,
          accountId: accountId || null,
          toAccountId: type === "TRANSFER" ? toAccountId || null : null,
          categoryId: type !== "TRANSFER" ? categoryId || null : null,
          defaultAmountMinor,
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
          defaultAmountMinor,
          note: note.trim() || null,
        });
      }

      setIsFormOpen(false);
      setEditingTemplate(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save bookmark");
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
                onChange={(e) => setType(e.target.value as "EXPENSE" | "INCOME" | "TRANSFER")}
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Account</label>
              <select
                data-testid="template-account-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">(None)</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
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
                        {a.name}
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
                  {categories.map((c) => (
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
                Default Amount (LKR, optional)
              </label>
              <input
                type="text"
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
              data-testid="template-save-btn"
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              Save Bookmark
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

            return (
              <div
                key={t.id}
                data-testid={`template-item-${t.id}`}
                className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-[var(--accent)]/40 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                    <Bookmark size={18} />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text)] truncate">
                        {t.name}
                      </span>
                      <span className="text-2xs px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] font-mono font-semibold uppercase">
                        {t.type}
                      </span>
                    </div>

                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 flex-wrap">
                      {acc && <span>{acc.name}</span>}
                      {cat && <span>• {cat.name}</span>}
                      {t.note && <span className="truncate">• {t.note}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {t.defaultAmountMinor && (
                    <span className="font-mono font-bold text-sm tabular-nums text-[var(--text)]">
                      {formatMoney(t.defaultAmountMinor)}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`template-edit-${t.id}`}
                      onClick={() => handleOpenEdit(t)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                      title="Edit bookmark"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      data-testid={`template-delete-${t.id}`}
                      onClick={() => handleDelete(t.id)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--expense)] hover:bg-[var(--expense)]/10 transition-colors cursor-pointer"
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

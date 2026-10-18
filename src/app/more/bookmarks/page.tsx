"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Bookmark, Trash2, Edit2, X } from "lucide-react";
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-hairline">
        <div className="flex items-center gap-3">
          <Link
            href="/more"
            data-testid="back-button"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
            title="Back to More"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)] flex items-center gap-2">
              <Bookmark size={18} className="text-[var(--text-muted)]" />
              <span>Bookmarks & Templates</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Quick transaction presets for 1-tap entry in Quick-Add
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="create-bookmark-btn"
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={14} />
          <span>New Bookmark</span>
        </button>
      </div>

      {/* Template Form (Inline Card / Modal) */}
      {isFormOpen && (
        <form
          onSubmit={handleSave}
          className="flat-card p-4 space-y-3 bg-[var(--surface)] border border-hairline rounded-lg shadow-sm"
        >
          <div className="flex items-center justify-between pb-2 border-b border-hairline">
            <span className="font-semibold text-xs text-[var(--text)]">
              {editingTemplate ? "Edit Bookmark" : "Create New Bookmark"}
            </span>
            <button
              type="button"
              data-testid="template-cancel-btn"
              onClick={() => setIsFormOpen(false)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Name *</label>
              <input
                type="text"
                data-testid="template-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Milk, Monthly Rent"
                className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Type</label>
              <select
                data-testid="template-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as "EXPENSE" | "INCOME" | "TRANSFER")}
                className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>

            {/* Account */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Account</label>
              <select
                data-testid="template-account-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
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
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--text-muted)]">To Account</label>
                <select
                  data-testid="template-to-account-select"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
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
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--text-muted)]">Category</label>
                <select
                  data-testid="template-category-select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
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
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">
                Default Amount (LKR, optional)
              </label>
              <input
                type="text"
                data-testid="template-amount-input"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="e.g. 250"
                className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              />
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Note (optional)</label>
              <input
                type="text"
                data-testid="template-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Morning fresh milk"
                className="w-full px-2.5 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              />
            </div>
          </div>

          {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="py-1.5 px-3 rounded border border-hairline text-xs hover:bg-[var(--border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="template-save-btn"
              className="py-1.5 px-4 rounded bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
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
        <div className="border border-hairline rounded-lg divide-y divide-hairline bg-[var(--surface)] overflow-hidden">
          {templates.map((t) => {
            const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
            const acc = t.accountId ? accounts.find((a) => a.id === t.accountId) : null;

            return (
              <div
                key={t.id}
                data-testid={`template-item-${t.id}`}
                className="flex items-center justify-between p-3 hover:bg-[var(--border)]/30 transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text)]">{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--border)] text-[var(--text-muted)] font-mono uppercase">
                      {t.type}
                    </span>
                  </div>

                  <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                    {acc && <span>{acc.name}</span>}
                    {cat && <span>• {cat.name}</span>}
                    {t.note && <span>• {t.note}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {t.defaultAmountMinor && (
                    <span className="font-mono font-semibold text-xs tabular-nums text-[var(--text)]">
                      {formatMoney(t.defaultAmountMinor)}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`template-edit-${t.id}`}
                      onClick={() => handleOpenEdit(t)}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                      title="Edit bookmark"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      data-testid={`template-delete-${t.id}`}
                      onClick={() => handleDelete(t.id)}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Delete bookmark"
                    >
                      <Trash2 size={14} />
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

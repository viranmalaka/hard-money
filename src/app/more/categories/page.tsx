"use client";

import React, { useState } from "react";
import { Plus, Trash2, Edit2, TrendingDown, TrendingUp } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { useCategories, useSync } from "@/components/sync-provider";
import { localCreateCategory, localDeleteCategory, localUpdateCategory } from "@/lib/sync/client";
import { CategoryType, getCategoryType, groupCategoriesByType } from "@/lib/categories-data";
import type { LocalCategory } from "@/lib/db";
import { CategoryIcon } from "@/components/ui/category-icon";
import { IconPicker } from "@/components/ui/icon-picker";

const COLOR_PALETTE = [
  "#2B8A3E",
  "#E8590C",
  "#1971C2",
  "#F59F00",
  "#D6336C",
  "#845EF7",
  "#0CA678",
  "#495057",
  "#3B5BDB",
  "#F03E3E",
];

export default function CategoriesPage() {
  const categories = useCategories();
  const { db } = useSync();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState("#1971C2");
  const [catType, setCatType] = useState<CategoryType>("EXPENSE");
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setIcon("Tag");
    setColor("#1971C2");
    setCatType("EXPENSE");
    setError("");
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenCreate = (t: CategoryType = "EXPENSE") => {
    resetForm();
    setCatType(t);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (cat: LocalCategory) => {
    setEditingId(cat.id);
    setName(cat.name);
    setIcon(cat.icon || "Tag");
    setColor(cat.color || "#1971C2");
    setCatType(getCategoryType(cat));
    setError("");
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }

    if (editingId) {
      await localUpdateCategory(db, editingId, {
        name: name.trim(),
        icon,
        color,
        type: catType,
      });
    } else {
      await localCreateCategory(db, {
        userId: "current-user",
        name: name.trim(),
        icon,
        color,
        type: catType,
      });
    }

    resetForm();
  };

  const handleDelete = async (cat: LocalCategory) => {
    await localDeleteCategory(db, cat.id);
  };

  const groups = groupCategoriesByType(categories);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Transaction Categories"
        subtitle="Custom Income & Expense Icons"
        backHref="/more"
        backLabel="Back to More"
        rightSlot={
          <button
            type="button"
            data-testid="add-category-btn"
            onClick={() => handleOpenCreate()}
            className="h-10 px-4 inline-flex items-center gap-1.5 text-xs font-bold rounded-2xl bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add Category</span>
            <span className="sm:hidden">Add</span>
          </button>
        }
      />

      {/* Inline Create / Edit Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-sm animate-in fade-in"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3.5">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">
                {editingId ? "Edit Category" : "New Category"}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Choose classification, icon, and accent color
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)] block">Type</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl font-semibold text-xs">
              {(["EXPENSE", "INCOME"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`category-type-${t.toLowerCase()}`}
                  onClick={() => setCatType(t)}
                  className={`h-10 rounded-xl transition-all cursor-pointer ${
                    catType === t
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-xs border border-[var(--border)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {t === "EXPENSE" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)] block">
              Category Name
            </label>
            <input
              type="text"
              data-testid="category-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Subscriptions, Pet Care, Freelancing"
              className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm transition-colors"
              autoFocus
            />
            {error && <p className="text-[var(--expense)] text-xs font-medium">{error}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Visual Icon Picker & Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Icon</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  data-testid="category-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="e.g. ShoppingCart, Utensils, Tag"
                  className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
                />
                <IconPicker
                  value={icon}
                  onChange={setIcon}
                  color={color}
                  triggerClassName="shrink-0"
                />
              </div>
            </div>

            {/* Color Palette */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Color</label>
              <div data-testid="category-color" className="flex items-center gap-2.5 pt-1.5 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-testid={`color-option-${c}`}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-full border transition-transform cursor-pointer ${
                      color === c
                        ? "scale-110 border-white ring-2 ring-[var(--text)] shadow-xs"
                        : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2.5 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={resetForm}
              className="h-11 px-4 rounded-2xl border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="category-submit"
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              {editingId ? "Save Changes" : "Save Category"}
            </button>
          </div>
        </form>
      )}

      {/* Category Lists: Expense & Income */}
      {([
        { key: "EXPENSE" as const, label: "Expense", items: groups.expense, Icon: TrendingDown, tone: "text-[var(--expense)]" },
        { key: "INCOME" as const, label: "Income", items: groups.income, Icon: TrendingUp, tone: "text-[var(--income)]" },
      ]).map(({ key, label, items, Icon, tone }) => (
        <section key={key} data-testid={`category-section-${key.toLowerCase()}`} className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-2 text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              <Icon size={14} className={tone} />
              {label} ({items.length})
            </span>
            <button
              type="button"
              onClick={() => handleOpenCreate(key)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:opacity-85 cursor-pointer"
            >
              <Plus size={14} /> Add {label}
            </button>
          </div>

          <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs">
            {items.length === 0 && (
              <p className="p-5 text-xs text-[var(--text-muted)]">
                No {label.toLowerCase()} categories yet.
              </p>
            )}
            {items.map((cat) => (
              <div
                key={cat.id}
                data-testid="category-row"
                className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--surface-hover)] transition-colors group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span
                    style={{ backgroundColor: cat.color || "#888" }}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-xs"
                  >
                    <CategoryIcon name={cat.icon} size={18} className="text-white" />
                  </span>
                  <span
                    data-testid="category-item-name"
                    className="text-sm font-semibold text-[var(--text)] truncate"
                  >
                    {cat.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cat)}
                    title="Edit category"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    type="button"
                    data-testid="category-delete-btn"
                    onClick={() => handleDelete(cat)}
                    title="Delete category"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--expense)] hover:bg-[var(--expense)]/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

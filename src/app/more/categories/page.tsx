"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Edit2, TrendingDown, TrendingUp } from "lucide-react";
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Link
            href="/more" transitionTypes={["nav-back"]}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
              Transaction Categories
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Manage custom income & expense categories with Lucide icons
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="add-category-btn"
          onClick={() => handleOpenCreate()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[var(--text)] text-[var(--bg)] hover:opacity-90 active:scale-95 transition-all shadow-xs"
        >
          <Plus size={14} />
          <span>Add Category</span>
        </button>
      </div>

      {/* Inline Create / Edit Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="flat-card p-4 space-y-3.5 border border-hairline text-xs animate-in fade-in"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <span className="font-semibold text-[var(--text)]">
              {editingId ? "Edit Category" : "New Category"}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Choose an icon and color
            </span>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-[var(--text-muted)] block">Type</label>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[var(--border)] rounded-md font-semibold">
              {(["EXPENSE", "INCOME"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`category-type-${t.toLowerCase()}`}
                  onClick={() => setCatType(t)}
                  className={`py-1.5 rounded transition-all ${
                    catType === t
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {t === "EXPENSE" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-[var(--text-muted)]">Category Name</label>
            <input
              type="text"
              data-testid="category-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Subscriptions, Pet Care, Freelancing"
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-xs"
              autoFocus
            />
            {error && <p className="text-red-500 text-[11px]">{error}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Visual Icon Picker & Input */}
            <div className="space-y-1">
              <label className="font-medium text-[var(--text-muted)] block">Icon</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="category-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="e.g. ShoppingCart, Utensils, Tag"
                  className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-xs"
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
            <div className="space-y-1">
              <label className="font-medium text-[var(--text-muted)] block">Color</label>
              <div data-testid="category-color" className="flex items-center gap-1.5 pt-1 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-testid={`color-option-${c}`}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      color === c ? "scale-115 border-white ring-2 ring-[var(--text)] shadow-xs" : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-hairline">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded border border-hairline text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="category-submit"
              className="px-4 py-1.5 rounded bg-[var(--accent)] text-white font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
              {editingId ? "Save Changes" : "Save Category"}
            </button>
          </div>
        </form>
      )}

      {/* Category Lists: Expense & Income */}
      {([
        { key: "EXPENSE" as const, label: "Expense", items: groups.expense, Icon: TrendingDown, tone: "text-rose-500" },
        { key: "INCOME" as const, label: "Income", items: groups.income, Icon: TrendingUp, tone: "text-emerald-500" },
      ]).map(({ key, label, items, Icon, tone }) => (
        <section key={key} data-testid={`category-section-${key.toLowerCase()}`} className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <Icon size={13} className={tone} />
              {label} ({items.length})
            </span>
            <button
              type="button"
              onClick={() => handleOpenCreate(key)}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          <div className="flat-card divide-y divide-hairline">
            {items.length === 0 && (
              <p className="p-3 text-xs text-[var(--text-muted)]">No {label.toLowerCase()} categories yet.</p>
            )}
            {items.map((cat) => (
              <div
                key={cat.id}
                data-testid="category-row"
                className="flex items-center justify-between p-3 hover:bg-[var(--surface-hover)] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span
                    style={{ backgroundColor: cat.color || "#888" }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs"
                  >
                    <CategoryIcon name={cat.icon} size={15} className="text-white" />
                  </span>
                  <span
                    data-testid="category-item-name"
                    className="text-xs font-semibold text-[var(--text)]"
                  >
                    {cat.name}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cat)}
                    title="Edit category"
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    data-testid="category-delete-btn"
                    onClick={() => handleDelete(cat)}
                    title="Delete category"
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--surface)] transition-colors"
                  >
                    <Trash2 size={13} />
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

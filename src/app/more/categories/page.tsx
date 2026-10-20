"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Lock, Edit2 } from "lucide-react";
import { useCategories, useSync } from "@/components/sync-provider";
import { localCreateCategory, localDeleteCategory, localUpdateCategory } from "@/lib/sync/client";
import { DEFAULT_SYSTEM_CATEGORIES } from "@/lib/categories-data";
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

const SYSTEM_NAMES = new Set(DEFAULT_SYSTEM_CATEGORIES.map((c) => c.name));

export default function CategoriesPage() {
  const categories = useCategories();
  const { db } = useSync();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState("#1971C2");
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setIcon("Tag");
    setColor("#1971C2");
    setError("");
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (cat: { id: string; name: string; icon: string; color: string }) => {
    setEditingId(cat.id);
    setName(cat.name);
    setIcon(cat.icon || "Tag");
    setColor(cat.color || "#1971C2");
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
      });
    } else {
      await localCreateCategory(db, {
        userId: "current-user",
        name: name.trim(),
        icon,
        color,
      });
    }

    resetForm();
  };

  const handleDelete = async (id: string) => {
    await localDeleteCategory(db, id);
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Link
            href="/more"
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
          onClick={handleOpenCreate}
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

      {/* Category List */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            All Categories ({categories.length})
          </span>
        </div>

        <div className="flat-card divide-y divide-hairline">
          {categories.map((cat) => {
            const isSystem = cat.userId === null || SYSTEM_NAMES.has(cat.name);
            return (
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
                  <div>
                    <span
                      data-testid="category-item-name"
                      className="text-xs font-semibold text-[var(--text)] block"
                    >
                      {cat.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {cat.icon || "Tag"}
                    </span>
                  </div>
                  {isSystem && (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded border border-hairline ml-1">
                      <Lock size={10} />
                      <span>Default</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {!isSystem && (
                    <>
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
                        onClick={() => handleDelete(cat.id)}
                        title="Delete category"
                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--surface)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Lock } from "lucide-react";
import { useCategories, useSync } from "@/components/sync-provider";
import { localCreateCategory, localDeleteCategory } from "@/lib/sync/client";
import { DEFAULT_SYSTEM_CATEGORIES } from "@/lib/categories-data";

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
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState("#1971C2");
  const [error, setError] = useState("");

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }

    await localCreateCategory(db, {
      userId: "current-user",
      name: name.trim(),
      icon,
      color,
    });

    setName("");
    setIcon("Tag");
    setColor("#1971C2");
    setError("");
    setIsFormOpen(false);
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
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
            Categories
          </h1>
        </div>

        <button
          type="button"
          data-testid="add-category-btn"
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--text)] text-[var(--bg)] hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          <span>Add Category</span>
        </button>
      </div>

      {/* Inline Create Form */}
      {isFormOpen && (
        <form
          onSubmit={handleCreateCategory}
          className="flat-card p-4 space-y-3 border border-hairline text-xs"
        >
          <div className="space-y-1">
            <label className="font-medium text-[var(--text-muted)]">Category Name</label>
            <input
              type="text"
              data-testid="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Subscriptions, Pet Care"
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
            {error && <p className="text-red-500 text-[11px]">{error}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-[var(--text-muted)]">Icon</label>
              <input
                type="text"
                data-testid="category-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Tag"
                className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[var(--text-muted)]">Color</label>
              <div data-testid="category-color" className="flex items-center gap-2 pt-1 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-testid={`color-option-${c}`}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      color === c ? "scale-115 border-white ring-2 ring-[var(--text)]" : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 rounded border border-hairline text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="category-submit"
              className="px-4 py-1.5 rounded bg-[var(--text)] text-[var(--bg)] font-medium hover:opacity-90"
            >
              Save Category
            </button>
          </div>
        </form>
      )}

      {/* Category List */}
      <div className="flat-card divide-y divide-hairline">
        {categories.map((cat) => {
          const isSystem = cat.userId === null || SYSTEM_NAMES.has(cat.name);
          return (
            <div
              key={cat.id}
              data-testid="category-row"
              className="flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  style={{ backgroundColor: cat.color }}
                  className="w-4 h-4 rounded-full inline-block shrink-0 shadow-xs"
                />
                <span
                  data-testid="category-item-name"
                  className="text-xs font-semibold text-[var(--text)]"
                >
                  {cat.name}
                </span>
                {isSystem && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-normal">
                    <Lock size={10} />
                    <span>System</span>
                  </span>
                )}
              </div>

              {!isSystem && (
                <button
                  type="button"
                  data-testid="category-delete-btn"
                  onClick={() => handleDelete(cat.id)}
                  title="Delete category"
                  className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

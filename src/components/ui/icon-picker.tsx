"use client";

import React, { useState } from "react";
import { Search, X, Check } from "lucide-react";
import { CURATED_CATEGORY_ICONS, CategoryIcon } from "./category-icon";

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  color?: string;
  triggerClassName?: string;
}

export function IconPicker({
  value,
  onChange,
  color = "#059669",
  triggerClassName = "",
}: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>("All");

  const groups = [
    "All",
    "Food & Dining",
    "Shopping",
    "Transport",
    "Home & Bills",
    "Health",
    "Leisure",
    "Income & Finance",
    "Work & Study",
  ];

  const filteredIcons = CURATED_CATEGORY_ICONS.filter((item) => {
    const matchesGroup = activeGroup === "All" || item.group === activeGroup;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q);
    return matchesGroup && matchesSearch;
  });

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        data-testid="icon-picker-trigger"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2.5 h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-xs text-[var(--text)] hover:border-[var(--accent)] transition-all ${triggerClassName}`}
      >
        <span
          className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
          style={{ backgroundColor: color }}
        >
          <CategoryIcon name={value} size={15} className="text-white" />
        </span>
        <span className="font-medium truncate flex-1 text-left text-sm">
          {value || "Select Icon"}
        </span>
        <span className="text-[11px] font-medium text-[var(--text-muted)] border border-hairline px-2 py-0.5 rounded-lg bg-[var(--surface)]">
          Change
        </span>
      </button>

      {/* Modal Backdrop & Dialog */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full md:max-w-lg bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] pb-sheet-safe md:pb-0 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                  style={{ backgroundColor: color }}
                >
                  <CategoryIcon name={value} size={16} className="text-white" />
                </span>
                <h3 className="text-base font-semibold text-[var(--text)]">
                  Pick Category Icon
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input & Group Pill Filters */}
            <div className="px-5 py-3.5 border-b border-hairline bg-[var(--bg)]/60 space-y-2.5">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="text"
                  data-testid="icon-picker-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search curated category icons..."
                  className="w-full h-11 pl-10 pr-9 text-sm rounded-2xl border border-hairline bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {groups.map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setActiveGroup(grp)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      activeGroup === grp
                        ? "bg-[var(--accent)] text-white shadow-xs"
                        : "bg-[var(--surface)] border border-hairline text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {filteredIcons.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                  No icons matching &ldquo;{search}&rdquo;
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                  {filteredIcons.map((item) => {
                    const isSelected =
                      value.toLowerCase() === item.name.toLowerCase();
                    const IconComponent = item.icon;

                    return (
                      <button
                        key={item.name}
                        type="button"
                        data-testid={`icon-option-${item.name}`}
                        onClick={() => {
                          onChange(item.name);
                          setIsOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all text-center group relative ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)] font-semibold shadow-xs"
                            : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-[var(--text)]"
                        }`}
                        title={item.label}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: isSelected ? color : "var(--surface)",
                            color: isSelected ? "#FFFFFF" : "var(--text)",
                          }}
                        >
                          <IconComponent size={17} />
                        </div>
                        <span className="text-[10px] truncate max-w-full leading-tight text-[var(--text-muted)] group-hover:text-[var(--text)]">
                          {item.name}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 text-[var(--accent)]">
                            <Check size={12} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-hairline bg-[var(--bg)]/60 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Showing {filteredIcons.length} curated icons</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-9 px-4 rounded-xl border border-hairline bg-[var(--surface)] text-[var(--text)] font-semibold hover:bg-[var(--surface-hover)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
  color = "#1971C2",
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
        className={`flex items-center gap-2 px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-xs text-[var(--text)] hover:border-[var(--accent)] transition-all ${triggerClassName}`}
      >
        <span
          className="w-6 h-6 rounded flex items-center justify-center text-white shrink-0 shadow-xs"
          style={{ backgroundColor: color }}
        >
          <CategoryIcon name={value} size={14} className="text-white" />
        </span>
        <span className="font-medium truncate flex-1 text-left">
          {value || "Select Icon"}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] border border-hairline px-1.5 py-0.5 rounded">
          Change
        </span>
      </button>

      {/* Modal Backdrop & Dialog */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--bg)] border border-hairline rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-hairline">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  <CategoryIcon name={value} size={14} className="text-white" />
                </span>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Pick Category Icon
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-hairline bg-[var(--surface)]">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="text"
                  data-testid="icon-picker-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search 50 common category icons..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Group Pill Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 scrollbar-none">
                {groups.map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setActiveGroup(grp)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                      activeGroup === grp
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg)] border border-hairline text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon Grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {filteredIcons.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No icons matching &ldquo;{search}&rdquo;
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
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
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-center group relative ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)] font-semibold shadow-xs"
                            : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-[var(--text)] hover:border-[var(--text-muted)]"
                        }`}
                        title={item.label}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-transform group-hover:scale-110"
                          style={{
                            backgroundColor: isSelected ? color : "var(--surface)",
                            color: isSelected ? "#FFFFFF" : "var(--text)",
                          }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <span className="text-[10px] truncate max-w-full leading-tight text-[var(--text-muted)] group-hover:text-[var(--text)]">
                          {item.name}
                        </span>
                        {isSelected && (
                          <span className="absolute top-1 right-1 text-[var(--accent)]">
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
            <div className="p-2.5 border-t border-hairline bg-[var(--surface)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Showing {filteredIcons.length} curated icons</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-medium hover:bg-[var(--surface-hover)]"
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

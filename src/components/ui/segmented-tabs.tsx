"use client";

import React from "react";

interface TabItem {
  id: string;
  label: string;
}

interface SegmentedTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function SegmentedTabs({ tabs, activeTab, onChange }: SegmentedTabsProps) {
  return (
    <div
      data-testid="segmented-tabs"
      className="flex gap-1.5 p-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] select-none"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex-1 py-2.5 px-3 rounded-xl text-center text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              isActive
                ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]/60"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

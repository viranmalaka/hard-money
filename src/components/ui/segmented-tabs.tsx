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
      className="flex border-b border-hairline bg-surface select-none"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex-1 py-2 text-center text-xs font-medium transition-colors border-b-2 ${
              isActive
                ? "border-[var(--accent)] text-[var(--text)] font-semibold"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

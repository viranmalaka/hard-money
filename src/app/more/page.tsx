"use client";

import React from "react";
import {
  Bookmark,
  ChevronRight,
  Database,
  Inbox,
  Moon,
  Paintbrush,
  Sun,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";

export default function MorePage() {
  const { resolvedTheme, toggleTheme, colorSwap, toggleColorSwap } = useTheme();
  const mounted = useMounted();

  const menuSections = [
    {
      title: "Organization",
      items: [
        { label: "Bookmarks & Templates", icon: Bookmark, badge: null },
        { label: "Categories", icon: Paintbrush, badge: null },
      ],
    },
    {
      title: "Automation & Data",
      items: [
        { label: "SMS Review Inbox", icon: Inbox, badge: "0" },
        { label: "Export & Import", icon: Database, badge: null },
        { label: "Household Collaboration", icon: Users, badge: null },
      ],
    },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      <div className="flex items-center justify-between py-1">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          More
        </h1>
      </div>

      {/* Preferences Section: Theme & Color Swap */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Preferences
        </span>
        <div className="flat-card divide-y divide-hairline">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              {mounted && resolvedTheme === "dark" ? (
                <Sun size={18} className="text-amber-400" />
              ) : (
                <Moon size={18} className="text-[var(--text-muted)]" />
              )}
              <span className="text-sm font-medium text-[var(--text)]">Appearance</span>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-2.5 py-1 text-xs rounded border border-hairline font-medium hover:bg-surface text-[var(--text)]"
            >
              {mounted && resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
            </button>
          </div>

          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border border-hairline flex overflow-hidden">
                <span className="w-1/2 bg-[var(--income)]" />
                <span className="w-1/2 bg-[var(--expense)]" />
              </span>
              <div>
                <span className="text-sm font-medium text-[var(--text)] block">
                  Income / Expense Colors
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {colorSwap
                    ? "Swapped (Red = income, Blue = expense)"
                    : "Default (Blue = income, Red = expense)"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleColorSwap}
              className="px-2.5 py-1 text-xs rounded border border-hairline font-medium hover:bg-surface text-[var(--text)]"
            >
              {colorSwap ? "Reset to Default" : "Swap Colors"}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
            {section.title}
          </span>
          <div className="flat-card divide-y divide-hairline">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className="text-[var(--text-muted)]" />
                    <span className="text-sm font-medium text-[var(--text)]">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface border border-hairline text-[var(--text-muted)]">
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-[var(--text-muted)]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty State requirement */}
      <EmptyState
        title="Settings & Tools"
        description="All system configurations, backup tools, and household settings are available here."
      />
    </main>
  );
}

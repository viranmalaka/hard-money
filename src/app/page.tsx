"use client";

import React, { useState } from "react";
import { ArrowLeftRight, Moon, Sun, CreditCard } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState("daily");
  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();

  const tabs = [
    { id: "daily", label: "Daily" },
    { id: "calendar", label: "Calendar" },
    { id: "monthly", label: "Monthly" },
    { id: "summary", label: "Summary" },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-3">
      {/* Top Bar with Single h1 and Mobile Controls */}
      <div className="flex items-center justify-between py-1">
        <h1
          data-testid="app-title"
          className="text-base font-semibold tracking-tight text-[var(--text)]"
        >
          Hard Money
        </h1>

        {/* Mobile quick controls */}
        <div className="mobile-only flex items-center gap-1">
          <button
            type="button"
            data-testid="color-swap-toggle"
            onClick={toggleColorSwap}
            title={`Color swap: ${colorSwap ? "Active" : "Default"}`}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Toggle Color Swap"
          >
            <CreditCard size={18} />
          </button>

          <button
            type="button"
            data-testid="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Toggle Theme"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun size={18} className="text-amber-400" />
            ) : (
              <Moon size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Month Switcher */}
      <MonthSwitcher />

      {/* 3-cell Summary Bar: Income · Expense · Total */}
      <SummaryBar
        incomeMinor={125000}
        expenseMinor={45000}
        totalMinor={80000}
      />

      {/* Segmented text tabs without pill/elevation */}
      <SegmentedTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content: Empty State */}
      <EmptyState
        title="No transactions yet"
        description="Tap the + button to record your first income, expense, or transfer."
        icon={<ArrowLeftRight size={24} />}
      />
    </main>
  );
}

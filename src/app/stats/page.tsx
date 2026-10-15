"use client";

import React, { useState } from "react";
import { BarChart3 } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState("expense");

  const tabs = [
    { id: "expense", label: "Expense" },
    { id: "income", label: "Income" },
    { id: "trend", label: "Trend" },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-3">
      <div className="flex items-center justify-between py-1">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          Stats
        </h1>
      </div>

      <MonthSwitcher />
      <SummaryBar incomeMinor={125000} expenseMinor={45000} totalMinor={80000} />
      <SegmentedTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <EmptyState
        title="No statistics available"
        description="Add transactions for this period to see category spending breakdowns."
        icon={<BarChart3 size={24} />}
      />
    </main>
  );
}

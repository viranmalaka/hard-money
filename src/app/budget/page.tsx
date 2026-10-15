"use client";

import React from "react";
import { PieChart } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { EmptyState } from "@/components/ui/empty-state";

export default function BudgetPage() {
  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-3">
      <div className="flex items-center justify-between py-1">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          Budget
        </h1>
      </div>

      <MonthSwitcher />

      {/* Safe-to-Spend banner placeholder */}
      <div className="flat-panel p-3 flex items-center justify-between">
        <div>
          <span className="text-xs text-[var(--text-muted)]">Safe-to-Spend Daily</span>
          <p className="text-sm font-semibold text-[var(--text)] tabular-nums">LKR 0.00 / day</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--text-muted)]">Monthly Budget</span>
          <p className="text-sm font-semibold text-[var(--text)] tabular-nums">LKR 0.00</p>
        </div>
      </div>

      <EmptyState
        title="No budgets configured"
        description="Set monthly spending limits per category to activate safe-to-spend tracking and symmetric rollover."
        icon={<PieChart size={24} />}
      />
    </main>
  );
}

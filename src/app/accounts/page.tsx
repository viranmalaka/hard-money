"use client";

import React from "react";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function AccountsPage() {
  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-3">
      <div className="flex items-center justify-between py-1">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          Accounts
        </h1>
      </div>

      {/* Net Worth Summary Header */}
      <div className="grid grid-cols-3 divide-x divide-hairline border border-hairline flat-card py-3 text-center text-xs">
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Assets</span>
          <p className="text-income font-semibold tabular-nums mt-0.5">LKR 0.00</p>
        </div>
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Liabilities</span>
          <p className="text-expense font-semibold tabular-nums mt-0.5">LKR 0.00</p>
        </div>
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Net Worth</span>
          <p className="text-[var(--text)] font-semibold tabular-nums mt-0.5">LKR 0.00</p>
        </div>
      </div>

      <EmptyState
        title="No accounts created"
        description="Add cash, bank accounts, or credit cards to begin tracking balances and net worth."
        icon={<Wallet size={24} />}
      />
    </main>
  );
}

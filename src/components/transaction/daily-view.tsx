"use client";

import React, { useMemo } from "react";
import { Scale, Split, Tag, Ban } from "lucide-react";
import { LocalTransaction } from "@/lib/db";
import { formatMoney } from "@/lib/finance-core/money";

interface DailyViewProps {
  transactions: LocalTransaction[];
  categoryMap: Map<string, { name: string; color: string }>;
  accountMap: Map<string, string>;
  onSelectTransaction?: (tx: LocalTransaction) => void;
}

export function DailyView({
  transactions,
  categoryMap,
  accountMap,
  onSelectTransaction,
}: DailyViewProps) {
  // Group transactions by transactionDate (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const groups = new Map<string, LocalTransaction[]>();

    for (const tx of transactions) {
      const dateKey = tx.transactionDate.slice(0, 10);
      const list = groups.get(dateKey) || [];
      list.push(tx);
      groups.set(dateKey, list);
    }

    // Sort dates descending
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map((dateKey) => {
      const txs = groups.get(dateKey)!;
      // Day subtotal: Income - Expense (excluding transfers and excludeFromStats)
      let subtotal = 0;
      for (const t of txs) {
        if (t.type === "INCOME") {
          subtotal += t.amountMinor;
        } else if (t.type === "EXPENSE") {
          subtotal -= t.amountMinor;
        }
      }
      return {
        dateKey,
        transactions: txs,
        subtotal,
      };
    });
  }, [transactions]);

  if (grouped.length === 0) {
    return null;
  }

  return (
    <div data-testid="view-daily" className="space-y-4">
      {grouped.map(({ dateKey, transactions: dayTxs, subtotal }) => {
        const dateObj = new Date(dateKey + "T00:00:00");
        const formattedDate = dateObj.toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          weekday: "short",
        });

        return (
          <div
            key={dateKey}
            className="border border-hairline rounded-lg bg-[var(--surface)] overflow-hidden shadow-2xs"
            style={{ contentVisibility: "auto", containIntrinsicSize: "0 100px" }}
          >
            {/* Day Header with Day Subtotal */}
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--border)]/40 border-b border-hairline text-xs font-semibold select-none">
              <span className="text-[var(--text)]">{formattedDate}</span>
              <span
                data-testid="day-subtotal"
                className={`font-mono tabular-nums ${
                  subtotal > 0
                    ? "text-income"
                    : subtotal < 0
                    ? "text-expense"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {subtotal > 0
                  ? `+ ${formatMoney(subtotal)}`
                  : subtotal < 0
                  ? `- ${formatMoney(Math.abs(subtotal))}`
                  : formatMoney(0)}
              </span>
            </div>

            {/* Day Transactions List */}
            <div className="divide-y divide-hairline">
              {dayTxs.map((tx) => {
                const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;
                const fromAccount = accountMap.get(tx.accountId) || "Account";
                const toAccount = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;
                const isTransfer = tx.type === "TRANSFER";
                const isCalibration = tx.source === "CALIBRATION" || tx.type === "ADJUSTMENT";
                const isExpense = tx.type === "EXPENSE";
                const isIncome = tx.type === "INCOME" || tx.type === "REFUND";

                return (
                  <div
                    key={tx.id}
                    data-testid={`transaction-row-${tx.id}`}
                    onClick={() => onSelectTransaction?.(tx)}
                    className="flex items-center justify-between p-3 hover:bg-[var(--border)]/30 active:bg-[var(--border)]/50 transition-colors cursor-pointer"
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isCalibration ? (
                          <span
                            data-testid="calibration-icon"
                            className="p-1 rounded bg-[var(--border)] text-[var(--text)] shrink-0"
                            title="Balance Calibration"
                          >
                            <Scale size={12} />
                          </span>
                        ) : category ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                        ) : (
                          <Tag size={12} className="text-[var(--text-muted)] shrink-0" />
                        )}

                        <span className="text-xs font-semibold text-[var(--text)] truncate">
                          {isCalibration
                            ? "Balance Calibration"
                            : isTransfer
                            ? `${fromAccount} → ${toAccount || "Account"}`
                            : category?.name || tx.type}
                        </span>

                        {/* Split Badge */}
                        {tx.isSplit && (
                          <span
                            data-testid="split-tag"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-medium"
                          >
                            <Split size={9} />
                            <span>Split</span>
                          </span>
                        )}

                        {/* Excluded from budget badge */}
                        {tx.excludeFromBudget && (
                          <span
                            data-testid="badge-exclude-budget"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded bg-[var(--border)] text-[var(--text-muted)] font-medium"
                            title="Excluded from budget"
                          >
                            <Ban size={9} />
                            <span>No budget</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                        <span>{fromAccount}</span>
                        {tx.note && <span>• {tx.note}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isExpense && (
                        <span
                          data-testid="transaction-amount"
                          className="font-mono font-semibold text-xs tabular-nums text-expense"
                        >
                          - {formatMoney(tx.amountMinor)}
                        </span>
                      )}
                      {isIncome && (
                        <span
                          data-testid="transaction-amount"
                          className="font-mono font-semibold text-xs tabular-nums text-income"
                        >
                          + {formatMoney(tx.amountMinor)}
                        </span>
                      )}
                      {isTransfer && (
                        <span
                          data-testid="transaction-amount"
                          className="font-mono font-semibold text-xs tabular-nums text-[var(--text-muted)]"
                        >
                          {formatMoney(tx.amountMinor)}
                        </span>
                      )}
                      {isCalibration && (
                        <span
                          data-testid="transaction-amount"
                          className={`font-mono font-semibold text-xs tabular-nums ${
                            tx.direction === "IN" ? "text-income" : "text-expense"
                          }`}
                        >
                          {tx.direction === "IN"
                            ? `+ ${formatMoney(tx.amountMinor)}`
                            : `- ${formatMoney(tx.amountMinor)}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

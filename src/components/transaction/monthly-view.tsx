"use client";

import React, { useMemo } from "react";
import { formatMoney } from "@/lib/finance-core/money";
import { LocalTransaction } from "@/lib/db";

interface MonthlyViewProps {
  currentDate: Date;
  allTransactions: LocalTransaction[];
  onSelectMonth?: (date: Date) => void;
}

export function MonthlyView({
  currentDate,
  allTransactions,
  onSelectMonth,
}: MonthlyViewProps) {
  const year = currentDate.getFullYear();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // Aggregated data per month for the current year
  const monthlyData = useMemo(() => {
    const list: Array<{
      monthIndex: number;
      name: string;
      income: number;
      expense: number;
      net: number;
      count: number;
    }> = [];

    for (let m = 0; m < 12; m++) {
      const mStr = `${year}-${String(m + 1).padStart(2, "0")}`;
      let inc = 0;
      let exp = 0;
      let count = 0;

      for (const tx of allTransactions) {
        if (tx.deletedAt || tx.excludeFromStats) continue;
        if (!tx.transactionDate.startsWith(mStr)) continue;

        count++;
        if (tx.type === "INCOME") {
          inc += tx.amountMinor;
        } else if (tx.type === "EXPENSE") {
          exp += tx.amountMinor;
        }
      }

      list.push({
        monthIndex: m,
        name: monthNames[m],
        income: inc,
        expense: exp,
        net: inc - exp,
        count,
      });
    }

    return list;
  }, [year, allTransactions]);

  return (
    <div data-testid="view-monthly" className="bg-[var(--surface)] border border-hairline rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--border)]/40 border-b border-hairline flex items-center justify-between text-xs font-semibold select-none">
        <span>Year {year} Monthly Overview</span>
      </div>

      <div className="divide-y divide-hairline">
        {monthlyData.map((item) => {
          const isCurrentMonth = item.monthIndex === currentDate.getMonth();

          return (
            <div
              key={item.monthIndex}
              data-testid={`monthly-row-${year}-${String(item.monthIndex + 1).padStart(2, "0")}`}
              onClick={() => onSelectMonth?.(new Date(year, item.monthIndex, 1))}
              className={`p-3 flex items-center justify-between text-xs hover:bg-[var(--border)]/30 transition-colors cursor-pointer ${
                isCurrentMonth ? "bg-[var(--border)]/20 font-medium" : ""
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text)]">{item.name}</span>
                  {isCurrentMonth && (
                    <span className="text-[10px] px-1 rounded bg-[var(--text)] text-[var(--bg)] font-semibold">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {item.count} transaction{item.count !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="text-right space-y-0.5 font-mono tabular-nums">
                <div className="flex items-center justify-end gap-3 text-[11px]">
                  <span className="text-income font-medium">+ {formatMoney(item.income)}</span>
                  <span className="text-expense font-medium">- {formatMoney(item.expense)}</span>
                </div>
                <div
                  className={`text-xs font-semibold ${
                    item.net > 0 ? "text-income" : item.net < 0 ? "text-expense" : "text-[var(--text-muted)]"
                  }`}
                >
                  {item.net >= 0 ? `+ ${formatMoney(item.net)}` : `- ${formatMoney(Math.abs(item.net))}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

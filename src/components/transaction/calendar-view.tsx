"use client";

import React, { useState, useMemo } from "react";
import { formatMoney } from "@/lib/finance-core/money";
import { LocalTransaction } from "@/lib/db";
import { Scale, Split, Tag } from "lucide-react";

interface CalendarViewProps {
  currentDate: Date;
  transactions: LocalTransaction[];
  categoryMap: Map<string, { name: string; color: string }>;
  accountMap: Map<string, string>;
  onSelectTransaction?: (tx: LocalTransaction) => void;
}

export function CalendarView({
  currentDate,
  transactions,
  categoryMap,
  accountMap,
  onSelectTransaction,
}: CalendarViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Today string in local/Asia:Colombo time
  const todayStr = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  // Aggregated totals per day for this month
  const dayStats = useMemo(() => {
    const stats = new Map<string, { income: number; expense: number; transactions: LocalTransaction[] }>();

    for (const tx of transactions) {
      const dateKey = tx.transactionDate.slice(0, 10);
      const entry = stats.get(dateKey) || { income: 0, expense: 0, transactions: [] };
      if (tx.type === "INCOME") {
        entry.income += tx.amountMinor;
      } else if (tx.type === "EXPENSE") {
        entry.expense += tx.amountMinor;
      }
      entry.transactions.push(tx);
      stats.set(dateKey, entry);
    }
    return stats;
  }, [transactions]);

  // Selected day: default to today if in current month, or the 1st of month
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const yStr = String(year);
    const mStr = String(month + 1).padStart(2, "0");
    const prefix = `${yStr}-${mStr}`;
    if (todayStr.startsWith(prefix)) {
      return todayStr;
    }
    return `${prefix}-01`;
  });

  // Calculate calendar grid days
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Empty lead cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        dateStr: `prev-${i}`,
        dayNum: 0,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        dateStr: dStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
      });
    }

    return days;
  }, [year, month, todayStr]);

  const selectedDayData = dayStats.get(selectedDate);
  const selectedTxs = selectedDayData?.transactions || [];

  return (
    <div data-testid="view-calendar" className="flex flex-col md:flex-row gap-4 w-full">
      {/* Calendar Grid Section */}
      <div className="flex-1 bg-[var(--surface)] border border-hairline rounded-lg p-3 space-y-2">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--text-muted)] py-1 border-b border-hairline select-none">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Calendar Cells Grid */}
        <div data-testid="calendar-grid" className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            if (!cell.isCurrentMonth) {
              return <div key={cell.dateStr || idx} className="h-16 md:h-18 p-1 opacity-20" />;
            }

            const stats = dayStats.get(cell.dateStr);
            const isSelected = selectedDate === cell.dateStr;

            return (
              <div
                key={cell.dateStr}
                data-testid={`calendar-day-${cell.dateStr}`}
                onClick={() => setSelectedDate(cell.dateStr)}
                className={`h-16 md:h-18 p-1 rounded border flex flex-col justify-between cursor-pointer transition-all select-none ${
                  isSelected
                    ? "border-[var(--text)] bg-[var(--border)]/40 shadow-xs"
                    : cell.isToday
                    ? "border-accent border-2 bg-transparent"
                    : "border-hairline bg-[var(--bg)] hover:border-[var(--text-muted)]"
                }`}
              >
                {/* Day number */}
                <span
                  className={`text-[11px] font-semibold leading-none ${
                    cell.isToday ? "text-accent font-bold" : "text-[var(--text)]"
                  }`}
                >
                  {cell.dayNum}
                </span>

                {/* Day Incomes & Expenses */}
                <div className="space-y-0.5 overflow-hidden">
                  {stats && stats.income > 0 && (
                    <div
                      data-testid="day-income"
                      className="text-[9px] md:text-[10px] font-mono text-income truncate font-semibold leading-tight"
                    >
                      +{(stats.income / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                  {stats && stats.expense > 0 && (
                    <div
                      data-testid="day-expense"
                      className="text-[9px] md:text-[10px] font-mono text-expense truncate font-semibold leading-tight"
                    >
                      -{(stats.expense / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Transaction Detail (Side-by-side on desktop, stacked on mobile) */}
      <div
        data-testid="calendar-day-detail"
        className="w-full md:w-80 lg:w-96 bg-[var(--surface)] border border-hairline rounded-lg p-3 space-y-3 flex flex-col"
      >
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <div>
            <h3 className="font-semibold text-xs text-[var(--text)]">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {selectedTxs.length} transaction{selectedTxs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {selectedDayData && (
            <div className="text-right text-[11px] font-mono tabular-nums">
              {selectedDayData.income > 0 && (
                <div className="text-income font-medium">+ {formatMoney(selectedDayData.income)}</div>
              )}
              {selectedDayData.expense > 0 && (
                <div className="text-expense font-medium">- {formatMoney(selectedDayData.expense)}</div>
              )}
            </div>
          )}
        </div>

        {/* Selected day transactions list */}
        <div className="flex-1 overflow-y-auto divide-y divide-hairline max-h-96 md:max-h-[500px]">
          {selectedTxs.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No transactions recorded on this date.
            </div>
          ) : (
            selectedTxs.map((tx) => {
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
                  className="py-2.5 px-1 flex items-center justify-between hover:bg-[var(--border)]/30 transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isCalibration ? (
                        <Scale size={12} className="text-[var(--text)] shrink-0" />
                      ) : category ? (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
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
                      {tx.isSplit && (
                        <span
                          data-testid="split-tag"
                          className="text-[9px] px-1 rounded bg-amber-500/10 text-amber-500 font-medium"
                        >
                          Split
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      <span>{fromAccount}</span>
                      {tx.note && <span>• {tx.note}</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      data-testid="transaction-amount"
                      className={`font-mono font-semibold text-xs tabular-nums ${
                        isExpense
                          ? "text-expense"
                          : isIncome
                          ? "text-income"
                          : isCalibration
                          ? tx.direction === "IN"
                            ? "text-income"
                            : "text-expense"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {isExpense
                        ? `- ${formatMoney(tx.amountMinor)}`
                        : isIncome
                        ? `+ ${formatMoney(tx.amountMinor)}`
                        : isCalibration
                        ? tx.direction === "IN"
                          ? `+ ${formatMoney(tx.amountMinor)}`
                          : `- ${formatMoney(tx.amountMinor)}`
                        : formatMoney(tx.amountMinor)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

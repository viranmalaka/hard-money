"use client";

import React, { useMemo, useState } from "react";
import { Scale, Split, Tag, Ban, MessageSquare, AlertTriangle, X } from "lucide-react";
import { LocalTransaction } from "@/lib/db";
import { formatMoney } from "@/lib/finance-core/money";
import { useSync } from "@/components/sync-provider";

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
  const { sync } = useSync();
  const [activeSmsModal, setActiveSmsModal] = useState<{
    rawMessage: string;
    sender: string;
    receivedAt: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openSmsModal = async (tx: LocalTransaction) => {
    try {
      const res = await fetch(`/api/transactions/${tx.id}/raw-sms`);
      if (res.ok) {
        const data = await res.json();
        setActiveSmsModal(data.sms);
      } else {
        // Fallback for offline or local preview
        setActiveSmsModal({
          rawMessage: tx.note || "Raw SMS not available locally.",
          sender: "BANK",
          receivedAt: tx.transactionDate,
        });
      }
    } catch {
      setActiveSmsModal({
        rawMessage: tx.note || "Raw SMS not available locally.",
        sender: "BANK",
        receivedAt: tx.transactionDate,
      });
    }
  };

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
        if (t.deletedAt || t.excludeFromStats) continue;
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
                    className="p-3 hover:bg-[var(--border)]/30 active:bg-[var(--border)]/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
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

                          {/* SMS Glyph */}
                          {(tx.source === "SMS" || tx.feeTransactionId) && (
                            <button
                              type="button"
                              data-testid="sms-glyph"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSmsModal(tx);
                              }}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-medium hover:bg-blue-500/20 transition-colors"
                              title="Bank SMS ingested"
                            >
                              <MessageSquare size={10} />
                              <span>SMS</span>
                            </button>
                          )}

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

                          {/* Converted to installment badge */}
                          {tx.excludeFromBalance && tx.excludeFromStats && (
                            <span
                              data-testid="converted-chip"
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 font-medium"
                            >
                              converted
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

                    {/* Possible Duplicate Prompt */}
                    {tx.possibleDuplicateOfTransactionId && (
                      <div
                        data-testid="possible-duplicate-prompt"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 p-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle size={13} />
                          <span>Possible duplicate — merge?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid="merge-duplicate-btn"
                            disabled={actionLoading === tx.id}
                            onClick={async () => {
                              setActionLoading(tx.id);
                              try {
                                await fetch(`/api/transactions/${tx.id}/merge`, { method: "POST" });
                                await sync();
                              } finally {
                                setActionLoading(null);
                              }
                            }}
                            className="px-2 py-0.5 rounded bg-amber-500 text-white font-medium text-[11px] hover:bg-amber-600 transition-colors"
                          >
                            Merge
                          </button>
                          <button
                            type="button"
                            data-testid="dismiss-duplicate-btn"
                            disabled={actionLoading === tx.id}
                            onClick={async () => {
                              setActionLoading(tx.id);
                              try {
                                await fetch(`/api/transactions/${tx.id}/dismiss-duplicate`, { method: "POST" });
                                await sync();
                              } finally {
                                setActionLoading(null);
                              }
                            }}
                            className="px-2 py-0.5 rounded border border-hairline text-[var(--text-muted)] hover:text-[var(--text)] text-[11px] transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Raw SMS Glyph Modal */}
      {activeSmsModal && (
        <div
          data-testid="sms-glyph-modal"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setActiveSmsModal(null)}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] border border-hairline rounded-lg shadow-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-blue-500" />
                <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
                  Bank SMS • {activeSmsModal.sender}
                </h3>
              </div>
              <button
                type="button"
                data-testid="close-sms-modal-btn"
                onClick={() => setActiveSmsModal(null)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={15} />
              </button>
            </div>

            <div
              data-testid="sms-raw-text"
              className="p-3 rounded bg-[var(--bg)] border border-hairline font-mono text-xs text-[var(--text)] whitespace-pre-wrap break-words"
            >
              {activeSmsModal.rawMessage}
            </div>

            <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
              <span>Received: {new Date(activeSmsModal.receivedAt).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setActiveSmsModal(null)}
                className="px-3 py-1 rounded bg-[var(--text)] text-[var(--bg)] font-medium text-xs hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

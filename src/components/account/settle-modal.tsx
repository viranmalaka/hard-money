"use client";

import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { LocalAccount } from "@/lib/db";
import { useAccounts, useSync } from "@/components/sync-provider";
import { localCreateTransaction } from "@/lib/sync/client";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { getColomboDateString } from "@/lib/jobs/cron-runner";

interface SettleModalProps {
  card: LocalAccount;
  billedBalanceMinor: number;
  totalDebtMinor: number;
  isOpen: boolean;
  onClose: () => void;
}

export function SettleModal({
  card,
  billedBalanceMinor,
  totalDebtMinor,
  isOpen,
  onClose,
}: SettleModalProps) {
  const accounts = useAccounts();
  const { db, sync } = useSync();

  // Mode: "BILLED" | "TOTAL" | "CUSTOM"
  const [selectedMode, setSelectedMode] = useState<"BILLED" | "TOTAL" | "CUSTOM">("BILLED");
  const [customAmountStr, setCustomAmountStr] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Eligible source accounts (BANK_SAVINGS or CASH, non-archived)
  const sourceAccounts = accounts.filter(
    (a) => !a.isArchived && a.id !== card.id && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  // Default source is linked settlement account or first eligible source
  const defaultSourceId =
    card.linkedSettlementAccountId && sourceAccounts.some((a) => a.id === card.linkedSettlementAccountId)
      ? card.linkedSettlementAccountId
      : sourceAccounts[0]?.id || "";

  const [sourceAccountId, setSourceAccountId] = useState("");
  const effectiveSourceId = sourceAccountId || defaultSourceId;

  if (!isOpen) return null;

  const handleSettle = async () => {
    setError("");

    let amountMinor = 0;
    if (selectedMode === "BILLED") {
      amountMinor = billedBalanceMinor;
    } else if (selectedMode === "TOTAL") {
      amountMinor = totalDebtMinor;
    } else {
      amountMinor = parseMoneyToMinor(customAmountStr);
    }

    if (amountMinor <= 0) {
      setError("Please enter a valid amount greater than 0");
      return;
    }

    const effectiveSourceId = sourceAccountId || defaultSourceId;
    if (!effectiveSourceId) {
      setError("Please select a source payment account");
      return;
    }

    setIsSubmitting(true);
    try {
      const todayDate = getColomboDateString(new Date());
      await localCreateTransaction(db, {
        userId: card.userId,
        accountId: effectiveSourceId,
        toAccountId: card.id,
        amountMinor,
        type: "TRANSFER",
        subType: "CC_SETTLEMENT",
        direction: "OUT",
        source: "MANUAL",
        createdByUserId: card.userId,
        updatedByUserId: card.userId,
        transactionDate: todayDate,
        note: `Credit Card Settlement - ${card.name}`,
        isSplit: false,
        excludeFromBudget: false,
        excludeFromStats: false,
        excludeFromBalance: false,
      });

      try {
        await sync();
      } catch {
        // Background sync will retry
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to process settlement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="settle-modal"
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs"
    >
      <div
        className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-2xl md:rounded-xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Settle Credit Card</h2>
            <p className="text-[11px] text-[var(--text-muted)]">{card.name}</p>
          </div>
          <button
            type="button"
            data-testid="settle-cancel-btn"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick Payment Chips */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-[var(--text-muted)]">Select Settlement Amount</label>
          <div className="grid grid-cols-3 gap-2">
            {/* Full Billed Due */}
            <button
              type="button"
              data-testid="settle-chip-billed"
              onClick={() => setSelectedMode("BILLED")}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                selectedMode === "BILLED"
                  ? "border-[var(--text)] bg-[var(--text)]/5 font-semibold"
                  : "border-hairline hover:bg-[var(--border)]/40"
              }`}
            >
              <span className="text-[10px] text-[var(--text-muted)]">Full Billed</span>
              <span className="text-xs font-mono tabular-nums text-[var(--text)] mt-1 truncate">
                {formatMoney(billedBalanceMinor)}
              </span>
            </button>

            {/* Total Outstanding */}
            <button
              type="button"
              data-testid="settle-chip-total"
              onClick={() => setSelectedMode("TOTAL")}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                selectedMode === "TOTAL"
                  ? "border-[var(--text)] bg-[var(--text)]/5 font-semibold"
                  : "border-hairline hover:bg-[var(--border)]/40"
              }`}
            >
              <span className="text-[10px] text-[var(--text-muted)]">Total Debt</span>
              <span className="text-xs font-mono tabular-nums text-[var(--text)] mt-1 truncate">
                {formatMoney(totalDebtMinor)}
              </span>
            </button>

            {/* Custom Amount */}
            <button
              type="button"
              data-testid="settle-chip-custom"
              onClick={() => setSelectedMode("CUSTOM")}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                selectedMode === "CUSTOM"
                  ? "border-[var(--text)] bg-[var(--text)]/5 font-semibold"
                  : "border-hairline hover:bg-[var(--border)]/40"
              }`}
            >
              <span className="text-[10px] text-[var(--text-muted)]">Custom</span>
              <span className="text-xs font-mono text-[var(--text)] mt-1">Other</span>
            </button>
          </div>

          {/* Custom Amount Input */}
          {selectedMode === "CUSTOM" && (
            <div className="pt-1 space-y-1">
              <label className="text-[11px] text-[var(--text-muted)]">Enter Amount (LKR)</label>
              <input
                type="text"
                data-testid="settle-amount-input"
                value={customAmountStr}
                onChange={(e) => setCustomAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--text)] text-sm"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Source Account Picker */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--text-muted)]">Pay From Account</label>
          <select
            data-testid="settle-source-account-select"
            value={effectiveSourceId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
          >
            {sourceAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.type === "BANK_SAVINGS" ? "Bank" : "Cash"})
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="settle-confirm-btn"
            disabled={isSubmitting}
            onClick={handleSettle}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Check size={14} />
            <span>Confirm Settlement</span>
          </button>
        </div>
      </div>
    </div>
  );
}

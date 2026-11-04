"use client";

import React, { useState } from "react";
import { X, Check, CreditCard } from "lucide-react";
import { LocalAccount } from "@/lib/db";
import { useAccounts, useSync } from "@/components/sync-provider";
import { localCreateTransaction } from "@/lib/sync/client";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { getColomboDateString } from "@/lib/jobs/cron-runner";
import { useModalHistory } from "@/hooks/use-modal-history";

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
  useModalHistory(isOpen, onClose, "settle-modal");
  const accounts = useAccounts();
  const { db, sync } = useSync();

  const [selectedMode, setSelectedMode] = useState<"BILLED" | "TOTAL" | "CUSTOM">("BILLED");
  const [customAmountStr, setCustomAmountStr] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceAccounts = accounts.filter(
    (a) => !a.isArchived && a.id !== card.id && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  const defaultSourceId =
    card.linkedSettlementAccountId && sourceAccounts.some((a) => a.id === card.linkedSettlementAccountId)
      ? card.linkedSettlementAccountId
      : sourceAccounts[0]?.id || "";

  const [sourceAccountId, setSourceAccountId] = useState("");
  const effectiveSourceId = sourceAccountId || defaultSourceId;

  if (!isOpen) return null;

  const activeAmountMinor =
    selectedMode === "BILLED"
      ? billedBalanceMinor
      : selectedMode === "TOTAL"
      ? totalDebtMinor
      : parseMoneyToMinor(customAmountStr);

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

    const chosenSourceId = sourceAccountId || defaultSourceId;
    if (!chosenSourceId) {
      setError("Please select a source payment account");
      return;
    }

    setIsSubmitting(true);
    try {
      const todayDate = getColomboDateString(new Date());
      await localCreateTransaction(db, {
        userId: card.userId,
        accountId: chosenSourceId,
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
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl p-5 sm:p-6 pb-sheet-safe md:pb-6 space-y-5 modal-sheet-dialog overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Settle Credit Card</h2>
              <p className="text-xs text-[var(--text-muted)]">{card.name}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="settle-cancel-btn"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero Settlement Amount Display */}
        <div className="rounded-3xl bg-[var(--bg)] border border-hairline px-4 py-5 text-center space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Settlement Payment
          </span>
          {selectedMode === "CUSTOM" ? (
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="text-sm font-semibold text-[var(--text-muted)]">LKR</span>
              <input
                type="text"
                data-testid="settle-amount-input"
                value={customAmountStr}
                onChange={(e) => setCustomAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-44 bg-transparent text-center text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text)] focus:outline-none border-b-2 border-[var(--accent)] pb-1"
                autoFocus
              />
            </div>
          ) : (
            <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text)]">
              {formatMoney(activeAmountMinor)}
            </p>
          )}
        </div>

        {/* Quick Payment Chips */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-muted)]">
            Select Settlement Mode
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              data-testid="settle-chip-billed"
              onClick={() => setSelectedMode("BILLED")}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                selectedMode === "BILLED"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30"
                  : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Full Billed</span>
              <span className="text-xs font-mono font-semibold tabular-nums text-[var(--text)] mt-1.5 truncate">
                {formatMoney(billedBalanceMinor)}
              </span>
            </button>

            <button
              type="button"
              data-testid="settle-chip-total"
              onClick={() => setSelectedMode("TOTAL")}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                selectedMode === "TOTAL"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30"
                  : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Total Debt</span>
              <span className="text-xs font-mono font-semibold tabular-nums text-[var(--text)] mt-1.5 truncate">
                {formatMoney(totalDebtMinor)}
              </span>
            </button>

            <button
              type="button"
              data-testid="settle-chip-custom"
              onClick={() => setSelectedMode("CUSTOM")}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                selectedMode === "CUSTOM"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30"
                  : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="text-[11px] font-medium text-[var(--text-muted)]">Custom</span>
              <span className="text-xs font-mono font-semibold text-[var(--text)] mt-1.5">Other</span>
            </button>
          </div>
        </div>

        {/* Source Account Picker */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--text-muted)]">
            Pay From Account
          </label>
          <select
            data-testid="settle-source-account-select"
            value={effectiveSourceId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            {sourceAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.type === "BANK_SAVINGS" ? "Bank" : "Cash"})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-500 font-medium">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-2xl border border-hairline text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="settle-confirm-btn"
            disabled={isSubmitting}
            onClick={handleSettle}
            className="h-11 flex items-center gap-2 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
          >
            <Check size={15} />
            <span>{isSubmitting ? "Settling..." : "Confirm Settlement"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

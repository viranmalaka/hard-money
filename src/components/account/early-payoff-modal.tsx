"use client";

import React, { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { LocalInstallmentPlan } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localCreateTransaction, localUpdateInstallmentPlan } from "@/lib/sync/client";
import { formatMoney } from "@/lib/finance-core/money";
import { useModalHistory } from "@/hooks/use-modal-history";

interface EarlyPayoffModalProps {
  plan: LocalInstallmentPlan | null;
  remainingPrincipalMinor: number;
  isOpen: boolean;
  onClose: () => void;
}

export function EarlyPayoffModal({
  plan,
  remainingPrincipalMinor,
  isOpen,
  onClose,
}: EarlyPayoffModalProps) {
  useModalHistory(isOpen, onClose, "early-payoff-modal");
  const { db, userId } = useSync();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !plan) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const effectiveUserId = plan.userId || userId || "current-user";
      await localCreateTransaction(db, {
        userId: effectiveUserId,
        accountId: plan.accountId,
        categoryId: plan.categoryId || null,
        amountMinor: remainingPrincipalMinor,
        type: "EXPENSE",
        subType: "CC_INSTALLMENT_PAYOFF",
        source: "MANUAL",
        createdByUserId: effectiveUserId,
        updatedByUserId: effectiveUserId,
        transactionDate: new Date().toISOString(),
        note: `${plan.merchantName} (Early Payoff)`,
        isSplit: false,
        excludeFromBudget: false,
        excludeFromStats: false,
        excludeFromBalance: false,
        installmentPlanId: plan.id,
      });

      await localUpdateInstallmentPlan(db, plan.id, {
        status: "COMPLETED",
      });

      onClose();
    } catch (err) {
      console.error("Early payoff failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="early-payoff-modal"
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs select-none overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl p-5 sm:p-6 pb-sheet-safe md:pb-6 space-y-5 modal-sheet-dialog overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-hairline">
          <h2 className="text-base font-semibold text-[var(--text)]">Early Payoff Confirmation</h2>
          <button
            type="button"
            data-testid="early-payoff-cancel"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="rounded-3xl bg-[var(--bg)] border border-hairline px-4 py-5 text-center space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Remaining Principal
            </span>
            <p
              data-testid="early-payoff-amount"
              className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text)]"
            >
              {formatMoney(remainingPrincipalMinor)}
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">{plan.merchantName}</p>
              <p className="text-xs leading-relaxed opacity-90">
                Confirming early payoff will post the remaining principal onto your card balance as a single expense and complete this installment plan. Blocked principal will drop to 0.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-2xl border border-hairline text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-early-payoff-btn"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 h-11 px-4 rounded-2xl bg-red-600 text-white font-semibold text-xs hover:bg-red-700 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
            >
              {submitting ? "Processing..." : "Confirm Payoff"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

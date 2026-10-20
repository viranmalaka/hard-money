"use client";

import React, { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { LocalInstallmentPlan } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localCreateTransaction, localUpdateInstallmentPlan } from "@/lib/sync/client";
import { formatMoney } from "@/lib/finance-core/money";

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
  const { db, userId } = useSync();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !plan) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const effectiveUserId = plan.userId || userId || "current-user";
      // 1. Post CC_INSTALLMENT_PAYOFF transaction for remaining principal
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

      // 2. Mark plan COMPLETED
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
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs select-none"
    >
      <div className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-xl md:rounded-lg shadow-xl p-5 pb-sheet-safe md:pb-5 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <h2 className="text-sm font-semibold text-[var(--text)]">Early Payoff Confirmation</h2>
          <button
            type="button"
            data-testid="early-payoff-cancel"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{plan.merchantName}</p>
              <p className="text-[11px] opacity-90">
                Confirming early payoff will post the remaining principal onto your card balance as a single expense and complete this installment plan. Blocked principal will drop to 0.
              </p>
            </div>
          </div>

          <div className="p-3 rounded border border-hairline bg-[var(--bg)] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">Remaining Principal:</span>
              <span data-testid="early-payoff-amount" className="font-mono font-bold text-sm text-[var(--text)] tabular-nums">
                {formatMoney(remainingPrincipalMinor)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              data-testid="confirm-early-payoff-btn"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 py-2.5 px-4 rounded bg-red-600 text-white font-semibold text-xs hover:bg-red-700 active:scale-98 transition-all disabled:opacity-50"
            >
              {submitting ? "Processing..." : "Confirm Payoff"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded border border-hairline text-xs hover:bg-[var(--border)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

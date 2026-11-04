"use client";

import React, { useState, useMemo } from "react";
import { X, Layers } from "lucide-react";
import { LocalAccount, LocalInstallmentPlan } from "@/lib/db";
import { useCategories, useSync } from "@/components/sync-provider";
import {
  localCreateInstallmentPlan,
  localUpdateInstallmentPlan,
  localCreateTransaction,
  localCreateCategory,
} from "@/lib/sync/client";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { useModalHistory } from "@/hooks/use-modal-history";

interface InstallmentPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
  defaultAccountId?: string;
  installmentPlan?: LocalInstallmentPlan | null;
}

export function InstallmentPlanModal({
  isOpen,
  onClose,
  accounts,
  defaultAccountId,
  installmentPlan = null,
}: InstallmentPlanModalProps) {
  useModalHistory(isOpen, onClose, "installment-modal");
  const { db, userId } = useSync();
  const categories = useCategories();

  const creditCards = useMemo(
    () => accounts.filter((a) => a.type === "CREDIT_CARD" && !a.isArchived),
    [accounts]
  );

  const [accountId, setAccountId] = useState(
    installmentPlan?.accountId || defaultAccountId || creditCards[0]?.id || ""
  );
  const [merchantName, setMerchantName] = useState(installmentPlan?.merchantName || "");
  const [totalAmountStr, setTotalAmountStr] = useState(
    installmentPlan ? (installmentPlan.totalAmountMinor / 100).toFixed(2) : ""
  );
  const [tenureMonths, setTenureMonths] = useState(installmentPlan?.tenureMonths || 12);
  const [initialPaidInstallments, setInitialPaidInstallments] = useState(
    installmentPlan?.initialPaidInstallments || 0
  );
  const [firstStatementDate, setFirstStatementDate] = useState(() => {
    if (installmentPlan) return installmentPlan.firstStatementDate.slice(0, 10);
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [processingFeeStr, setProcessingFeeStr] = useState(
    installmentPlan ? (installmentPlan.processingFeeMinor / 100).toFixed(2) : ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalAmountMinor = useMemo(() => parseMoneyToMinor(totalAmountStr), [totalAmountStr]);
  const monthlyAmountMinor = useMemo(() => {
    if (!tenureMonths || tenureMonths < 1) return 0;
    return Math.floor(totalAmountMinor / tenureMonths);
  }, [totalAmountMinor, tenureMonths]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!accountId) {
      newErrors.accountId = "Please select a credit card";
    }
    if (!merchantName.trim()) {
      newErrors.merchantName = "Merchant name is required";
    }
    if (totalAmountMinor <= 0) {
      newErrors.totalAmount = "Please enter a valid total amount";
    }
    if (!Number.isInteger(tenureMonths) || tenureMonths < 1) {
      newErrors.tenure = "Tenure must be at least 1 month";
    }
    if (initialPaidInstallments < 0 || initialPaidInstallments >= tenureMonths) {
      newErrors.paid = "Paid months must be less than the tenure";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const feeMinor = parseMoneyToMinor(processingFeeStr);
    const finalAmountMinor = totalAmountMinor - monthlyAmountMinor * (tenureMonths - 1);

    if (!installmentPlan && initialPaidInstallments === 0 && feeMinor > 0) {
      let bankFeesCat = categories.find(
        (c) =>
          c.name.toLowerCase().includes("bank fee") ||
          c.name.toLowerCase() === "fees"
      );
      if (!bankFeesCat) {
        bankFeesCat = await localCreateCategory(db, {
          name: "Bank Fees",
          icon: "Percent",
          color: "#ef4444",
        });
      }

      const effectiveUserId = userId || "current-user";
      await localCreateTransaction(db, {
        userId: effectiveUserId,
        accountId,
        categoryId: bankFeesCat.id,
        amountMinor: feeMinor,
        type: "EXPENSE",
        subType: "FEE",
        source: "MANUAL",
        createdByUserId: effectiveUserId,
        updatedByUserId: effectiveUserId,
        transactionDate: new Date().toISOString(),
        note: `${merchantName.trim()} (Processing Fee)`,
        isSplit: false,
        excludeFromBudget: false,
        excludeFromStats: false,
        excludeFromBalance: false,
      });
    }

    const effectiveUserId = userId || "current-user";
    const values = {
      userId: effectiveUserId,
      accountId,
      merchantName: merchantName.trim(),
      totalAmountMinor,
      tenureMonths,
      monthlyAmountMinor,
      finalInstallmentAmountMinor: finalAmountMinor,
      initialPaidInstallments: Number(initialPaidInstallments) || 0,
      processingFeeMinor: feeMinor,
      processingFeeBilled: feeMinor > 0,
      startDate: new Date().toISOString(),
      firstStatementDate: new Date(firstStatementDate + "T12:00:00.000Z").toISOString(),
      isOngoingSetup: initialPaidInstallments > 0,
      status: "ACTIVE" as const,
    };
    if (installmentPlan) {
      await localUpdateInstallmentPlan(db, installmentPlan.id, {
        accountId,
        merchantName: merchantName.trim(),
        totalAmountMinor,
        tenureMonths,
        monthlyAmountMinor,
        finalInstallmentAmountMinor: finalAmountMinor,
        initialPaidInstallments: Number(initialPaidInstallments) || 0,
        processingFeeMinor: feeMinor,
        firstStatementDate: values.firstStatementDate,
        isOngoingSetup: initialPaidInstallments > 0,
      });
    } else {
      await localCreateInstallmentPlan(db, values);
    }

    onClose();
  };

  return (
    <div
      data-testid="installment-plan-modal"
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs select-none overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl p-5 sm:p-6 pb-sheet-safe md:pb-6 space-y-5 modal-sheet-dialog overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">
                {installmentPlan ? "Edit" : "Add"} 0% Installment Plan
              </h2>
              <p className="text-xs text-[var(--text-muted)]">Split credit card spend across months</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="installment-plan-cancel"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
          {/* Card Account */}
          <div className="space-y-1.5">
            <label className="block font-medium text-[var(--text-muted)]">Credit Card</label>
            <select
              data-testid="installment-account-select"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select a card</option>
              {creditCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.accountId && <p className="text-red-500 text-[11px]">{errors.accountId}</p>}
          </div>

          {/* Merchant */}
          <div className="space-y-1.5">
            <label className="block font-medium text-[var(--text-muted)]">Merchant Name</label>
            <input
              type="text"
              data-testid="installment-merchant-input"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="e.g. Singer, Abans, Apple Store"
              className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
            {errors.paid && <p className="text-red-500 text-[11px]">{errors.paid}</p>}
            {errors.merchantName && (
              <p className="text-red-500 text-[11px]">{errors.merchantName}</p>
            )}
          </div>

          {/* Total Amount & Tenure */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-medium text-[var(--text-muted)]">Total Amount (LKR)</label>
              <input
                type="text"
                data-testid="installment-total-input"
                value={totalAmountStr}
                onChange={(e) => setTotalAmountStr(e.target.value)}
                placeholder="120000.00"
                className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm font-mono tabular-nums focus:outline-none focus:border-[var(--accent)]"
              />
              {errors.totalAmount && (
                <p className="text-red-500 text-[11px]">{errors.totalAmount}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-[var(--text-muted)]">Tenure (Months)</label>
              <input
                type="number"
                min={1}
                data-testid="installment-tenure-input"
                value={tenureMonths}
                onChange={(e) => setTenureMonths(Number(e.target.value))}
                className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              {errors.tenure && <p className="text-red-500 text-[11px]">{errors.tenure}</p>}
            </div>
          </div>

          {/* Initial Paid Installments & First Statement Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-medium text-[var(--text-muted)]">Initial Paid Months</label>
              <input
                type="number"
                min={0}
                max={tenureMonths - 1}
                data-testid="installment-paid-input"
                value={initialPaidInstallments}
                onChange={(e) => setInitialPaidInstallments(Number(e.target.value))}
                placeholder="0"
                className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-[var(--text-muted)]">First Cutoff Date</label>
              <input
                type="date"
                data-testid="installment-first-statement-date"
                value={firstStatementDate}
                onChange={(e) => setFirstStatementDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Processing Fee */}
          <div className="space-y-1.5">
            <label className="block font-medium text-[var(--text-muted)]">
              Processing Fee (Optional LKR)
            </label>
            <input
              type="text"
              data-testid="installment-fee-input"
              value={processingFeeStr}
              onChange={(e) => setProcessingFeeStr(e.target.value)}
              placeholder="e.g. 2500.00"
              className="w-full h-11 px-3.5 rounded-2xl border border-hairline bg-[var(--bg)] text-[var(--text)] text-sm font-mono tabular-nums focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Monthly Amount Preview */}
          {monthlyAmountMinor > 0 && (
            <div className="p-3.5 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-muted)]">Monthly Installment</span>
              <span className="font-mono font-bold text-sm text-[var(--accent)] tabular-nums">
                {formatMoney(monthlyAmountMinor)} / mo
              </span>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              data-testid="installment-plan-submit"
              className="w-full h-12 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-95 active:scale-[0.99] transition-all shadow-sm"
            >
              {installmentPlan ? "Save Changes" : "Add Installment Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

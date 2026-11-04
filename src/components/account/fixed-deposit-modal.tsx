"use client";

import React, { useState, useEffect } from "react";
import { X, Landmark } from "lucide-react";
import { LocalAccount, LocalFixedDeposit } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localCreateFixedDeposit, localUpdateFixedDeposit } from "@/lib/sync/client";
import { parseMoneyToMinor } from "@/lib/finance-core/money";
import { addMonthsClamped } from "@/lib/finance-core/dates";
import { useModalHistory } from "@/hooks/use-modal-history";

interface FixedDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
  fixedDeposit?: LocalFixedDeposit | null;
}

export function FixedDepositModal({
  isOpen,
  onClose,
  accounts,
  fixedDeposit = null,
}: FixedDepositModalProps) {
  useModalHistory(isOpen, onClose, "fixed-deposit-modal");
  const { db, userId, sync } = useSync();

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [principalStr, setPrincipalStr] = useState("");
  const [aprStr, setAprStr] = useState("");
  const [tenureMonthsStr, setTenureMonthsStr] = useState("");
  const [startDateStr, setStartDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [compoundingFrequency, setCompoundingFrequency] = useState<
    "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY"
  >("MONTHLY");
  const [payoutMode, setPayoutMode] = useState<"MONTHLY_PAYOUT_TO_ACCOUNT" | "REINVEST_COMPOUND">(
    "MONTHLY_PAYOUT_TO_ACCOUNT"
  );
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [whtStr, setWhtStr] = useState("0.0");
  const [autoRenew, setAutoRenew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const eligibleSavings = accounts.filter(
    (a) => !a.isArchived && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  const isWhtDirtyRef = React.useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => {
      if (fixedDeposit) {
        setBankName(fixedDeposit.bankName);
        setAccountNumber(fixedDeposit.accountNumber || "");
        setPrincipalStr((fixedDeposit.principalAmountMinor / 100).toFixed(2));
        setAprStr((fixedDeposit.annualInterestRateBps / 100).toFixed(2));
        setTenureMonthsStr(String(fixedDeposit.tenureMonths));
        setStartDateStr(fixedDeposit.startDate.slice(0, 10));
        setCompoundingFrequency(fixedDeposit.compoundingFrequency);
        setPayoutMode(fixedDeposit.payoutMode);
        setLinkedAccountId(fixedDeposit.linkedPayoutAccountId || "");
        setFundingAccountId(fixedDeposit.fundingAccountId || "");
        setWhtStr((fixedDeposit.withholdingTaxRateBps / 100).toFixed(1));
        setAutoRenew(fixedDeposit.autoRenew);
        isWhtDirtyRef.current = true;
      } else {
        setBankName("");
        setAccountNumber("");
        setPrincipalStr("1000000.00");
        setAprStr("12.0");
        setTenureMonthsStr("12");
        setStartDateStr(new Date().toISOString().slice(0, 10));
        setCompoundingFrequency("MONTHLY");
        setPayoutMode("MONTHLY_PAYOUT_TO_ACCOUNT");
        setLinkedAccountId("");
        setFundingAccountId("");
        setWhtStr("0.0");
        setAutoRenew(false);
        isWhtDirtyRef.current = false;
      }
      setErrors({});
    });
  }, [isOpen, fixedDeposit]);

  useEffect(() => {
    if (!isOpen) {
      isWhtDirtyRef.current = false;
      return;
    }

    fetch("/api/user/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isWhtDirtyRef.current && data?.user?.defaultWithholdingTaxRateBps !== undefined) {
          setWhtStr(((data.user.defaultWithholdingTaxRateBps || 0) / 100).toFixed(1));
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!bankName.trim()) {
      newErrors.bankName = "Bank name is required";
    }

    const principalMinor = parseMoneyToMinor(principalStr);
    if (principalMinor <= 0) {
      newErrors.principal = "Principal must be greater than zero";
    }

    const aprNum = parseFloat(aprStr);
    if (isNaN(aprNum) || aprNum < 0) {
      newErrors.rate = "Valid APR % is required";
    }

    const tenureNum = parseInt(tenureMonthsStr, 10);
    if (isNaN(tenureNum) || tenureNum <= 0) {
      newErrors.tenure = "Valid tenure months is required";
    }

    const whtNum = parseFloat(whtStr);
    if (isNaN(whtNum) || whtNum < 0) {
      newErrors.wht = "Valid WHT % is required (0 or greater)";
    }

    if (payoutMode === "MONTHLY_PAYOUT_TO_ACCOUNT" && !linkedAccountId && eligibleSavings.length > 0) {
      newErrors.linkedAccount = "Linked savings account required for monthly payout";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const startDate = new Date(`${startDateStr}T00:00:00`).toISOString();
      const now = new Date(startDate);
      const maturity = addMonthsClamped(now, tenureNum);
      const maturityDate = maturity.toISOString();
      let paidPeriods = 0;
      const today = new Date();
      while (paidPeriods < tenureNum && addMonthsClamped(now, paidPeriods + 1) <= today) paidPeriods += 1;

      const values: Omit<LocalFixedDeposit, "id" | "serverSeq" | "createdAt" | "updatedAt"> = {
        userId: userId || "",
        householdId: null,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim() || null,
        principalAmountMinor: principalMinor,
        annualInterestRateBps: Math.round(aprNum * 100),
        tenureMonths: tenureNum,
        paidPeriods,
        startDate,
        maturityDate,
        compoundingFrequency,
        payoutMode,
        linkedPayoutAccountId: linkedAccountId || null,
        fundingAccountId: fundingAccountId || null,
        withholdingTaxRateBps: Math.round(whtNum * 100),
        autoRenew,
        status: "ACTIVE",
        closedAt: null,
        prematureClosure: false,
      };
      if (fixedDeposit) {
        await fetch(`/api/fixed-deposits/${fixedDeposit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankName: values.bankName,
            principalAmountMinor: values.principalAmountMinor,
            annualInterestRateBps: values.annualInterestRateBps,
            tenureMonths: values.tenureMonths,
            startDate: values.startDate,
            paidPeriods,
            withholdingTaxRateBps: values.withholdingTaxRateBps,
          }),
        });
        await localUpdateFixedDeposit(db, fixedDeposit.id, {
          ...values,
          id: fixedDeposit.id,
          serverSeq: fixedDeposit.serverSeq,
          createdAt: fixedDeposit.createdAt,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await localCreateFixedDeposit(db, values);
      }

      void sync();
      onClose();
    } catch (err) {
      console.error("Failed to create fixed deposit:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/55 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full md:max-w-lg bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden modal-sheet-dialog flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Landmark size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">
                {fixedDeposit ? "Edit Fixed Deposit" : "New Fixed Deposit"}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">Term deposit placement & interest payouts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 pb-sheet-safe md:pb-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {/* Bank Name & Account Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Bank Name</label>
              <input
                type="text"
                data-testid="fd-form-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Commercial Bank"
                className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
              {errors.bankName && <p className="text-[11px] text-[var(--expense)]">{errors.bankName}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                Account Number (Optional)
              </label>
              <input
                type="text"
                data-testid="fd-form-account-number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 100098234"
                className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>
          </div>

          {/* Principal & Started Date */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Principal Amount</label>
              <input
                type="text"
                data-testid="fd-form-principal"
                value={principalStr}
                onChange={(e) => setPrincipalStr(e.target.value)}
                placeholder="1,000,000.00"
                className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono tabular-nums"
              />
              {errors.principal && <p className="text-[11px] text-[var(--expense)]">{errors.principal}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Started Date</label>
              <input
                type="date"
                data-testid="fd-form-start-date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Rate, Tenure, WHT */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">APR %</label>
              <input
                type="number"
                step="0.01"
                data-testid="fd-form-rate"
                value={aprStr}
                onChange={(e) => setAprStr(e.target.value)}
                placeholder="12.00"
                className="w-full h-11 px-3 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.rate && <p className="text-[11px] text-[var(--expense)]">{errors.rate}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Tenure (Mo)</label>
              <input
                type="number"
                data-testid="fd-form-tenure"
                value={tenureMonthsStr}
                onChange={(e) => setTenureMonthsStr(e.target.value)}
                min="1"
                className="w-full h-11 px-3 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.tenure && <p className="text-[11px] text-[var(--expense)]">{errors.tenure}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">WHT %</label>
              <input
                type="number"
                step="0.1"
                data-testid="fd-form-wht"
                value={whtStr}
                onFocus={() => {
                  isWhtDirtyRef.current = true;
                }}
                onInput={() => {
                  isWhtDirtyRef.current = true;
                }}
                onChange={(e) => {
                  isWhtDirtyRef.current = true;
                  setWhtStr(e.target.value);
                }}
                min="0"
                placeholder="5.0"
                className="w-full h-11 px-3 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.wht && <p className="text-[11px] text-[var(--expense)]">{errors.wht}</p>}
            </div>
          </div>

          {/* Payout Mode & Compounding Frequency */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Payout Mode</label>
              <select
                data-testid="fd-form-payout-mode"
                value={payoutMode}
                onChange={(e) =>
                  setPayoutMode(e.target.value as "MONTHLY_PAYOUT_TO_ACCOUNT" | "REINVEST_COMPOUND")
                }
                className="w-full h-11 px-3 rounded-2xl bg-[var(--bg)] border border-hairline text-xs sm:text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="MONTHLY_PAYOUT_TO_ACCOUNT">Monthly Payout</option>
                <option value="REINVEST_COMPOUND">Compound & Reinvest</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Compounding</label>
              <select
                data-testid="fd-form-compounding"
                value={compoundingFrequency}
                onChange={(e) =>
                  setCompoundingFrequency(
                    e.target.value as "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY"
                  )
                }
                className="w-full h-11 px-3 rounded-2xl bg-[var(--bg)] border border-hairline text-xs sm:text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
                <option value="AT_MATURITY">At Maturity (Simple)</option>
              </select>
            </div>
          </div>

          {/* Linked Savings Account */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Interest Payout Account (Linked Savings)
            </label>
            <select
              data-testid="fd-form-linked-account"
              value={linkedAccountId}
              onChange={(e) => setLinkedAccountId(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">None / Not linked</option>
              {eligibleSavings.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
            {errors.linkedAccount ? (
              <p className="text-[11px] text-[var(--expense)]">{errors.linkedAccount}</p>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Where monthly interest payouts are deposited. Does NOT deduct any funds.
              </p>
            )}
          </div>

          {/* Funding Account */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Funding Account (Deduct Principal)
            </label>
            <select
              data-testid="fd-form-funding-account"
              value={fundingAccountId}
              onChange={(e) => setFundingAccountId(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">None — Already started / Track only (No deduction)</option>
              {eligibleSavings.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Choose &quot;None&quot; for already-started FDs to keep current account balances unchanged.
            </p>
          </div>

          {/* Auto-renew checkbox */}
          <label
            htmlFor="fd-auto-renew"
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--bg)] border border-hairline cursor-pointer"
          >
            <input
              type="checkbox"
              id="fd-auto-renew"
              data-testid="fd-form-auto-renew"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="w-4 h-4 rounded border-hairline bg-[var(--surface)] accent-[var(--accent)]"
            />
            <span className="text-xs font-medium text-[var(--text)]">
              Auto-renew on maturity for the same tenure
            </span>
          </label>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 px-4 rounded-2xl border border-hairline text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="fd-form-submit"
              disabled={submitting}
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
            >
              {submitting
                ? fixedDeposit
                  ? "Saving..."
                  : "Creating..."
                : fixedDeposit
                ? "Save Changes"
                : "Create Fixed Deposit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

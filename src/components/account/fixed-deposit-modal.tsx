"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { LocalAccount } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localCreateFixedDeposit } from "@/lib/sync/client";
import { parseMoneyToMinor } from "@/lib/finance-core/money";
import { addMonthsClamped } from "@/lib/finance-core/dates";

interface FixedDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
}

export function FixedDepositModal({ isOpen, onClose, accounts }: FixedDepositModalProps) {
  const { db, userId } = useSync();

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [principalStr, setPrincipalStr] = useState("1000000.00");
  const [aprStr, setAprStr] = useState("12.0");
  const [tenureMonthsStr, setTenureMonthsStr] = useState("12");
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
    if (!isOpen) {
      isWhtDirtyRef.current = false;
      return;
    }

    // Fetch user default WHT from settings
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
      const now = new Date();
      const startDate = now.toISOString();
      const maturity = addMonthsClamped(now, tenureNum);
      const maturityDate = maturity.toISOString();

      await localCreateFixedDeposit(db, {
        userId: userId || "",
        householdId: null,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim() || null,
        principalAmountMinor: principalMinor,
        annualInterestRateBps: Math.round(aprNum * 100),
        tenureMonths: tenureNum,
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
      });

      onClose();
    } catch (err) {
      console.error("Failed to create fixed deposit:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-md bg-[var(--surface)] border border-hairline rounded shadow-2xl overflow-hidden modal-sheet-dialog flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">New Fixed Deposit</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {/* Bank Name */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">Bank Name</label>
            <input
              type="text"
              data-testid="fd-form-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Commercial Bank, Sampath Bank"
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            {errors.bankName && <p className="text-[11px] text-[var(--expense)]">{errors.bankName}</p>}
          </div>

          {/* Account Number */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">Account Number (Optional)</label>
            <input
              type="text"
              data-testid="fd-form-account-number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 100098234"
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>

          {/* Principal & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Principal Amount</label>
              <input
                type="text"
                data-testid="fd-form-principal"
                value={principalStr}
                onChange={(e) => setPrincipalStr(e.target.value)}
                placeholder="1,000,000.00"
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.principal && <p className="text-[11px] text-[var(--expense)]">{errors.principal}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Annual Rate (APR %)</label>
              <input
                type="number"
                step="0.01"
                data-testid="fd-form-rate"
                value={aprStr}
                onChange={(e) => setAprStr(e.target.value)}
                placeholder="12.00"
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.rate && <p className="text-[11px] text-[var(--expense)]">{errors.rate}</p>}
            </div>
          </div>

          {/* Tenure & WHT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Tenure (Months)</label>
              <input
                type="number"
                data-testid="fd-form-tenure"
                value={tenureMonthsStr}
                onChange={(e) => setTenureMonthsStr(e.target.value)}
                min="1"
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.tenure && <p className="text-[11px] text-[var(--expense)]">{errors.tenure}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Withholding Tax (WHT %)</label>
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
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.wht && <p className="text-[11px] text-[var(--expense)]">{errors.wht}</p>}
            </div>
          </div>

          {/* Payout Mode & Compounding Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Payout Mode</label>
              <select
                data-testid="fd-form-payout-mode"
                value={payoutMode}
                onChange={(e) =>
                  setPayoutMode(e.target.value as "MONTHLY_PAYOUT_TO_ACCOUNT" | "REINVEST_COMPOUND")
                }
                className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="MONTHLY_PAYOUT_TO_ACCOUNT">Monthly Payout</option>
                <option value="REINVEST_COMPOUND">Compound & Reinvest</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Compounding Frequency</label>
              <select
                data-testid="fd-form-compounding"
                value={compoundingFrequency}
                onChange={(e) =>
                  setCompoundingFrequency(
                    e.target.value as "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY"
                  )
                }
                className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
                <option value="AT_MATURITY">At Maturity (Simple)</option>
              </select>
            </div>
          </div>

          {/* Linked Savings Account */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">Linked Savings Account</label>
            <select
              data-testid="fd-form-linked-account"
              value={linkedAccountId}
              onChange={(e) => setLinkedAccountId(e.target.value)}
              className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">None / Not linked</option>
              {eligibleSavings.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
            {errors.linkedAccount && <p className="text-[11px] text-[var(--expense)]">{errors.linkedAccount}</p>}
          </div>

          {/* Funding Account */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">Funding Account (Optional)</label>
            <select
              data-testid="fd-form-funding-account"
              value={fundingAccountId}
              onChange={(e) => setFundingAccountId(e.target.value)}
              className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">No funding account (open directly)</option>
              {eligibleSavings.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--text-muted)]">
              If selected, creates an FD placement expense reducing this account. Net worth stays unchanged.
            </span>
          </div>

          {/* Auto-renew checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="fd-auto-renew"
              data-testid="fd-form-auto-renew"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="rounded border-hairline bg-[var(--bg)] text-[var(--accent)] focus:ring-0"
            />
            <label htmlFor="fd-auto-renew" className="text-xs text-[var(--text)] cursor-pointer">
              Auto-renew on maturity for the same tenure
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="fd-form-submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Fixed Deposit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

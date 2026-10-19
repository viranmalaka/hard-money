"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { LocalAccount } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localCreateLoan } from "@/lib/sync/client";
import { parseMoneyToMinor } from "@/lib/finance-core/money";

interface LoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
}

export function LoanModal({ isOpen, onClose, accounts }: LoanModalProps) {
  const { db, userId, sync } = useSync();

  const [kind, setKind] = useState<"LOAN" | "LEASE">("LOAN");
  const [lenderName, setLenderName] = useState("");
  const [principalStr, setPrincipalStr] = useState("1200000.00");
  const [residualStr, setResidualStr] = useState("0.00");
  const [aprStr, setAprStr] = useState("12.0");
  const [tenureMonthsStr, setTenureMonthsStr] = useState("12");
  const [calculationType, setCalculationType] = useState<"REDUCING_BALANCE" | "FLAT_RATE">(
    "REDUCING_BALANCE"
  );
  const [disbursementAccountId, setDisbursementAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const eligibleSavings = accounts.filter(
    (a) => !a.isArchived && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!lenderName.trim()) {
      newErrors.lenderName = "Lender name is required";
    }

    const principalMinor = parseMoneyToMinor(principalStr);
    if (principalMinor <= 0) {
      newErrors.principal = "Principal must be greater than zero";
    }

    const residualMinor = kind === "LEASE" ? parseMoneyToMinor(residualStr) : 0;
    if (residualMinor < 0) {
      newErrors.residual = "Residual value cannot be negative";
    }
    if (residualMinor >= principalMinor) {
      newErrors.residual = "Residual value must be less than principal";
    }

    const aprNum = parseFloat(aprStr);
    if (isNaN(aprNum) || aprNum < 0) {
      newErrors.rate = "Valid APR % is required";
    }

    const tenureNum = parseInt(tenureMonthsStr, 10);
    if (isNaN(tenureNum) || tenureNum <= 0) {
      newErrors.tenure = "Valid tenure months is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const startDate = now.toISOString();

      await localCreateLoan(db, {
        userId: userId || "",
        householdId: null,
        kind,
        lenderName: lenderName.trim(),
        originalPrincipalMinor: principalMinor,
        residualValueMinor: residualMinor,
        annualInterestRateBps: Math.round(aprNum * 100),
        tenureMonths: tenureNum,
        startDate,
        monthlyEmiAmountMinor: 0, // Will be computed by localCreateLoan
        calculationType,
        linkedDisbursementAccountId: disbursementAccountId || null,
        status: "ACTIVE",
        closedAt: null,
      });

      await sync();
      onClose();
    } catch (err) {
      console.error("Failed to create loan:", err);
      setErrors({ form: "Failed to create loan. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="loan-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md bg-[var(--surface)] border border-hairline rounded-xl shadow-2xl p-5 space-y-4 my-auto">
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <h2 className="text-sm font-semibold text-[var(--text)]">Add Loan / Lease</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3 text-xs">
          {errors.form && <p className="text-red-500 text-xs">{errors.form}</p>}

          {/* Kind Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--bg)] rounded-lg border border-hairline">
            <button
              type="button"
              data-testid="loan-kind-loan"
              onClick={() => setKind("LOAN")}
              className={`py-1 rounded text-center font-medium transition-all ${
                kind === "LOAN"
                  ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Loan
            </button>
            <button
              type="button"
              data-testid="loan-kind-lease"
              onClick={() => setKind("LEASE")}
              className={`py-1 rounded text-center font-medium transition-all ${
                kind === "LEASE"
                  ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Lease
            </button>
          </div>

          {/* Lender Name */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Lender / Financial Institution
            </label>
            <input
              type="text"
              data-testid="loan-form-lender"
              value={lenderName}
              onChange={(e) => setLenderName(e.target.value)}
              placeholder="e.g. Commercial Bank, Central Finance, LOLC"
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            {errors.lenderName && (
              <p className="text-[11px] text-[var(--expense)]">{errors.lenderName}</p>
            )}
          </div>

          {/* Principal & Residual */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {kind === "LEASE" ? "Financed Amount (LKR)" : "Principal (LKR)"}
              </label>
              <input
                type="text"
                data-testid="loan-form-principal"
                value={principalStr}
                onChange={(e) => setPrincipalStr(e.target.value)}
                placeholder="1,200,000.00"
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.principal && (
                <p className="text-[11px] text-[var(--expense)]">{errors.principal}</p>
              )}
            </div>

            {kind === "LEASE" ? (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  Residual / Balloon (LKR)
                </label>
                <input
                  type="text"
                  data-testid="loan-form-residual"
                  value={residualStr}
                  onChange={(e) => setResidualStr(e.target.value)}
                  placeholder="200,000.00"
                  className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                {errors.residual && (
                  <p className="text-[11px] text-[var(--expense)]">{errors.residual}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  Interest Rate (APR %)
                </label>
                <input
                  type="number"
                  step="0.01"
                  data-testid="loan-form-rate"
                  value={aprStr}
                  onChange={(e) => setAprStr(e.target.value)}
                  placeholder="12.00"
                  className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                {errors.rate && <p className="text-[11px] text-[var(--expense)]">{errors.rate}</p>}
              </div>
            )}
          </div>

          {/* Rate (if Lease) & Tenure */}
          <div className="grid grid-cols-2 gap-3">
            {kind === "LEASE" && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  Interest Rate (APR %)
                </label>
                <input
                  type="number"
                  step="0.01"
                  data-testid="loan-form-rate"
                  value={aprStr}
                  onChange={(e) => setAprStr(e.target.value)}
                  placeholder="12.00"
                  className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                {errors.rate && <p className="text-[11px] text-[var(--expense)]">{errors.rate}</p>}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                Tenure (Months)
              </label>
              <input
                type="number"
                data-testid="loan-form-tenure"
                value={tenureMonthsStr}
                onChange={(e) => setTenureMonthsStr(e.target.value)}
                min="1"
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
              {errors.tenure && (
                <p className="text-[11px] text-[var(--expense)]">{errors.tenure}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                Calculation Type
              </label>
              <select
                data-testid="loan-form-calculation-type"
                value={calculationType}
                onChange={(e) =>
                  setCalculationType(e.target.value as "REDUCING_BALANCE" | "FLAT_RATE")
                }
                className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="REDUCING_BALANCE">Reducing Balance</option>
                <option value="FLAT_RATE">Flat Rate</option>
              </select>
            </div>
          </div>

          {/* Disbursement Account */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Disbursement Account (Optional)
            </label>
            <select
              data-testid="loan-form-disbursement-account"
              value={disbursementAccountId}
              onChange={(e) => setDisbursementAccountId(e.target.value)}
              className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">None (No disbursement transaction)</option>
              {eligibleSavings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[var(--text-muted)]">
              If selected, creates a stats-excluded LOAN_DISBURSEMENT income row in this account.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-hairline text-xs font-medium hover:bg-[var(--border)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="loan-form-submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

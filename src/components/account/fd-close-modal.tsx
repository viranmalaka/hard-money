"use client";

import React, { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { LocalFixedDeposit, LocalAccount } from "@/lib/db";
import { useSync } from "@/components/sync-provider";
import { localUpdateFixedDeposit } from "@/lib/sync/client";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { useMutation } from "@tanstack/react-query";
import { closeFixedDeposit } from "@/services/fixed-deposit-service";
import { useModalHistory } from "@/hooks/use-modal-history";

interface FdCloseModalProps {
  fd: LocalFixedDeposit | null;
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
}

export function FdCloseModal({ fd, isOpen, onClose, accounts }: FdCloseModalProps) {
  useModalHistory(isOpen, onClose, "fd-close-modal");
  const { db, sync } = useSync();

  const [proceedsStr, setProceedsStr] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const closeMutation = useMutation({ mutationFn: closeFixedDeposit });

  React.useEffect(() => {
    if (fd) {
      queueMicrotask(() => {
        setProceedsStr((fd.principalAmountMinor / 100).toFixed(2));
        setTargetAccountId(
          fd.linkedPayoutAccountId ||
            fd.fundingAccountId ||
            accounts.find((a) => !a.isArchived && (a.type === "BANK_SAVINGS" || a.type === "CASH"))?.id ||
            ""
        );
        setError("");
      });
    }
  }, [fd, accounts]);

  if (!isOpen || !fd) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const actualProceedsMinor = parseMoneyToMinor(proceedsStr);
    if (actualProceedsMinor <= 0) {
      setError("Proceeds must be greater than zero");
      return;
    }
    if (!targetAccountId) {
      setError("Please select a target account for proceeds");
      return;
    }

    setSubmitting(true);
    try {
      await closeMutation.mutateAsync({ id: fd.id, actualProceedsMinor, targetAccountId });

      const now = new Date().toISOString();
      await localUpdateFixedDeposit(db, fd.id, {
        status: "CLOSED",
        closedAt: now,
        prematureClosure: true,
      });

      await sync();
      onClose();
    } catch (err) {
      console.error("Failed to close fixed deposit:", err);
      setError("Failed to close fixed deposit");
    } finally {
      setSubmitting(false);
    }
  };

  const eligibleAccounts = accounts.filter(
    (a) => !a.isArchived && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/55 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden modal-sheet-dialog flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--expense)]/10 text-[var(--expense)] flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Premature Close FD</h2>
              <p className="text-xs text-[var(--text-muted)]">{fd.bankName}</p>
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

        <form onSubmit={handleConfirm} className="p-5 sm:p-6 pb-sheet-safe md:pb-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-hairline text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Bank / Account</span>
              <span className="font-semibold text-[var(--text)]">{fd.bankName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Original Principal</span>
              <span className="font-semibold font-mono tabular-nums text-[var(--text)]">
                {formatMoney(fd.principalAmountMinor)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Original Tenure</span>
              <span className="text-[var(--text)]">{fd.tenureMonths} Months</span>
            </div>
          </div>

          {/* Hero Proceeds Input */}
          <div className="rounded-3xl bg-[var(--bg)] border border-hairline px-4 py-4 text-center space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Actual Proceeds from Bank
            </label>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)]">LKR</span>
              <input
                type="text"
                data-testid="fd-close-proceeds-input"
                value={proceedsStr}
                onChange={(e) => setProceedsStr(e.target.value)}
                placeholder="1,000,000.00"
                className="w-44 bg-transparent text-center text-2xl font-bold font-mono tabular-nums text-[var(--text)] focus:outline-none border-b-2 border-[var(--accent)] pb-1"
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] pt-1">
              Amount credited after bank penalties or early exit charges
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Deposit Account
            </label>
            <select
              data-testid="fd-close-target-account"
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl bg-[var(--bg)] border border-hairline text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              {eligibleAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-[var(--expense)] font-medium">
              {error}
            </div>
          )}

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
              data-testid="fd-close-confirm-btn"
              disabled={submitting}
              className="h-11 px-5 rounded-2xl bg-[var(--expense)] text-white text-xs font-semibold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm"
            >
              {submitting ? "Closing..." : "Confirm Premature Close"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

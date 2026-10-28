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

      // The server is authoritative for the proceeds transactions.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-md bg-[var(--surface)] border border-hairline rounded shadow-2xl overflow-hidden modal-sheet-dialog flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-[var(--expense)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Premature Close Fixed Deposit</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 rounded bg-[var(--surface-hover)] border border-hairline text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Bank / Account:</span>
              <span className="font-semibold text-[var(--text)]">{fd.bankName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Original Principal:</span>
              <span className="font-semibold text-[var(--text)]">{formatMoney(fd.principalAmountMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Original Tenure:</span>
              <span className="text-[var(--text)]">{fd.tenureMonths} Months</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Actual Proceeds from Bank
            </label>
            <input
              type="text"
              data-testid="fd-close-proceeds-input"
              value={proceedsStr}
              onChange={(e) => setProceedsStr(e.target.value)}
              placeholder="1,000,000.00"
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
            />
            <span className="text-[10px] text-[var(--text-muted)]">
              Enter the actual amount credited to your account after bank penalties or early exit charges.
            </span>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Deposit Account
            </label>
            <select
              data-testid="fd-close-target-account"
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              {eligibleAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-[11px] text-[var(--expense)]">{error}</p>}

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
              data-testid="fd-close-confirm-btn"
              disabled={submitting}
              className="px-3 py-1.5 rounded bg-[var(--expense)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? "Closing..." : "Confirm Premature Close"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

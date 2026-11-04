"use client";

import React, { useState, useMemo, useCallback } from "react";
import { X, Scale, AlertCircle, Calculator } from "lucide-react";
import { useCategories, useSync } from "@/components/sync-provider";
import { localCreateTransaction, localCreateCategory } from "@/lib/sync/client";
import { LocalAccount } from "@/lib/db";
import { formatMoney } from "@/lib/finance-core/money";
import {
  evaluateExpression,
  handleKeypadPress,
  KeypadToken,
} from "@/lib/finance-core/calculator";
import { NumberKeypadPopup } from "@/components/ui/number-keypad-popup";

function getTodayDateString(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

interface CalibrationModalProps {
  account: LocalAccount;
  currentBalanceMinor: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CalibrationModal({
  account,
  currentBalanceMinor,
  isOpen,
  onClose,
}: CalibrationModalProps) {
  if (!isOpen) return null;

  return (
    <CalibrationModalContent
      account={account}
      currentBalanceMinor={currentBalanceMinor}
      onClose={onClose}
    />
  );
}

function CalibrationModalContent({
  account,
  currentBalanceMinor,
  onClose,
}: {
  account: LocalAccount;
  currentBalanceMinor: number;
  onClose: () => void;
}) {
  const { db, userId } = useSync();
  const categories = useCategories();

  const isCreditCard = account.type === "CREDIT_CARD";
  const currentDebtMinor =
    isCreditCard && currentBalanceMinor < 0 ? Math.abs(currentBalanceMinor) : 0;

  const initialValueStr = isCreditCard
    ? (currentDebtMinor / 100).toFixed(2)
    : (currentBalanceMinor / 100).toFixed(2);

  const [expression, setExpression] = useState<string>(initialValueStr);
  const [note, setNote] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isKeypadOpen, setIsKeypadOpen] = useState(true);

  const evalResult = useMemo(() => {
    return evaluateExpression(expression);
  }, [expression]);

  const onKeypadClick = useCallback((token: string) => {
    setErrorMsg("");
    if (token === "C") {
      setExpression("");
      return;
    }
    setExpression((prev) => {
      const res = handleKeypadPress(prev, token as KeypadToken);
      if (res.error) {
        setErrorMsg(res.error);
      }
      return res.nextExpr;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const key = e.key;
      if (key >= "0" && key <= "9") {
        e.preventDefault();
        onKeypadClick(key as KeypadToken);
      } else if (key === ".") {
        e.preventDefault();
        onKeypadClick(".");
      } else if (key === "+" || key === "-") {
        e.preventDefault();
        onKeypadClick(key as KeypadToken);
      } else if (key === "*" || key === "x" || key === "X") {
        e.preventDefault();
        onKeypadClick("×");
      } else if (key === "/") {
        e.preventDefault();
        onKeypadClick("÷");
      } else if (key === "=" || key === "Enter") {
        e.preventDefault();
        onKeypadClick("=");
      } else if (key === "Backspace") {
        e.preventDefault();
        onKeypadClick("⌫");
      }
    },
    [onKeypadClick]
  );

  const enteredRealMinor = useMemo(() => {
    if (!evalResult.isValid) return null;
    return Math.round(evalResult.value * 100);
  }, [evalResult]);

  const deltaMinor = useMemo(() => {
    if (enteredRealMinor === null) return 0;
    if (isCreditCard) {
      return currentDebtMinor - enteredRealMinor;
    }
    return enteredRealMinor - currentBalanceMinor;
  }, [enteredRealMinor, currentBalanceMinor, currentDebtMinor, isCreditCard]);

  const isNothingToAdjust = deltaMinor === 0;

  const handleSave = async () => {
    if (enteredRealMinor === null) {
      setErrorMsg("Please enter a valid amount");
      return;
    }

    if (isNothingToAdjust) {
      setErrorMsg("Nothing to adjust");
      return;
    }

    try {
      let calibCat = categories.find(
        (c) =>
          c.name.toLowerCase() === "balance calibration" ||
          c.name.toLowerCase() === "adjustments"
      );

      if (!calibCat) {
        calibCat = await localCreateCategory(db, {
          userId: userId || "default",
          name: "Balance Calibration",
          color: "#64748b",
          icon: "Scale",
        });
      }

      const direction = deltaMinor > 0 ? "IN" : "OUT";
      const amountMinor = Math.abs(deltaMinor);

      await localCreateTransaction(db, {
        userId: userId || "default",
        accountId: account.id,
        toAccountId: null,
        categoryId: calibCat.id,
        amountMinor,
        direction,
        type: "ADJUSTMENT",
        source: "CALIBRATION",
        transactionDate: getTodayDateString(),
        note: note.trim() || (isCreditCard ? "Credit Card Debt Calibration" : "Balance Calibration"),
        createdByUserId: userId || "default",
        updatedByUserId: userId || "default",
        isSplit: false,
        excludeFromBudget: true,
        excludeFromStats: true,
        excludeFromBalance: false,
      });

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to calibrate balance");
    }
  };

  return (
    <div
      data-testid="calibration-sheet"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 select-none overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        data-testid="calibration-dialog"
        className="w-full md:max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col modal-sheet-dialog overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)]">
              <Scale size={18} />
            </span>
            <div>
              <h2 className="font-bold text-base text-[var(--text)]">Calibrate Balance</h2>
              <p className="text-xs text-[var(--text-muted)]">{account.name}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="calibration-close"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Current balance card */}
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-muted)]">
              {isCreditCard ? "Current Computed Debt" : "Current Computed Balance"}
            </span>
            <span
              data-testid="current-computed-balance"
              className="font-mono font-bold text-sm text-[var(--text)] tabular-nums"
            >
              {formatMoney(isCreditCard ? currentDebtMinor : currentBalanceMinor)}
            </span>
          </div>

          {/* Hero Real Balance Input & Delta */}
          <div className="p-5 rounded-3xl border border-[var(--border)] bg-[var(--bg)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                {isCreditCard ? "Real Outstanding Debt" : "Real Balance"}
              </span>
              <div className="flex items-center gap-2">
                <span
                  data-testid="calibration-delta"
                  className={`font-mono font-bold tabular-nums ${
                    deltaMinor > 0
                      ? "text-[var(--income)]"
                      : deltaMinor < 0
                        ? "text-[var(--expense)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {deltaMinor > 0
                    ? `+${(deltaMinor / 100).toFixed(2)}`
                    : deltaMinor < 0
                      ? `-${(Math.abs(deltaMinor) / 100).toFixed(2)}`
                      : "+0.00"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsKeypadOpen(!isKeypadOpen);
                  }}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    isKeypadOpen
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  title="Toggle Calculator Keypad"
                >
                  <Calculator size={15} />
                </button>
              </div>
            </div>

            <div onClick={() => setIsKeypadOpen(true)} className="cursor-pointer">
              <input
                type="text"
                data-testid="real-balance-input"
                inputMode="none"
                value={expression || "0"}
                onKeyDown={handleKeyDown}
                onClick={() => setIsKeypadOpen(true)}
                onFocus={() => setIsKeypadOpen(true)}
                readOnly
                className="w-full text-3xl font-bold font-mono tracking-tight bg-transparent text-[var(--text)] focus:outline-none text-center tabular-nums cursor-pointer py-1"
              />
            </div>
          </div>

          <NumberKeypadPopup
            isOpen={isKeypadOpen}
            onClose={() => setIsKeypadOpen(false)}
            onKeypadClick={onKeypadClick}
            expression={expression}
            previewValue={evalResult.isValid ? evalResult.displayValue : undefined}
            title="Balance Keypad"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)] block">
              Note (optional)
            </label>
            <input
              type="text"
              data-testid="calibration-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Monthly statement check, wallet count"
              className="w-full h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {isNothingToAdjust && (
            <div
              data-testid="nothing-to-adjust-msg"
              className="p-3.5 rounded-2xl bg-[var(--income)]/10 border border-[var(--income)]/25 text-[var(--income)] text-xs font-bold text-center"
            >
              Nothing to adjust
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-xs text-[var(--expense)] font-semibold">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="px-5 sm:px-6 py-4 border-t border-[var(--border)] bg-[var(--surface)] pb-sheet-safe shrink-0">
          <button
            type="button"
            data-testid="calibration-save-btn"
            disabled={isNothingToAdjust || enteredRealMinor === null}
            onClick={handleSave}
            className="w-full h-12 px-5 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
          >
            Save Calibration
          </button>
        </div>
      </div>
    </div>
  );
}

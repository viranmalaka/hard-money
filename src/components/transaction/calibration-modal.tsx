"use client";

import React, { useState, useMemo, useCallback } from "react";
import { X, Scale, AlertCircle } from "lucide-react";
import { useCategories, useSync } from "@/components/sync-provider";
import { localCreateTransaction, localCreateCategory } from "@/lib/sync/client";
import { LocalAccount } from "@/lib/db";
import { formatMoney } from "@/lib/finance-core/money";
import {
  evaluateExpression,
  handleKeypadPress,
  KeypadToken,
} from "@/lib/finance-core/calculator";

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
  // For credit card: current debt basis
  const currentDebtMinor = isCreditCard && currentBalanceMinor < 0 ? Math.abs(currentBalanceMinor) : 0;

  // Initial expression defaults to current balance or current debt
  const initialValueStr = isCreditCard
    ? (currentDebtMinor / 100).toFixed(2)
    : (currentBalanceMinor / 100).toFixed(2);

  const [expression, setExpression] = useState<string>(initialValueStr);
  const [note, setNote] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const evalResult = useMemo(() => {
    return evaluateExpression(expression);
  }, [expression]);

  const onKeypadClick = useCallback((token: KeypadToken) => {
    setErrorMsg("");
    setExpression((prev) => {
      const res = handleKeypadPress(prev, token);
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

  // Parse entered real value into minor units
  const enteredRealMinor = useMemo(() => {
    if (!evalResult.isValid) return null;
    return Math.round(evalResult.value * 100);
  }, [evalResult]);

  // Delta calculation:
  // For standard accounts: real - current computed
  // For credit cards: current debt - real debt (if real debt is lower, debt decreased => direction IN)
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
      // Find or create "Balance Calibration" category
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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 select-none"
    >
      <div
        data-testid="calibration-dialog"
        className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-2xl md:rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-[var(--surface)]">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[var(--border)] text-[var(--text)]">
              <Scale size={16} />
            </span>
            <div>
              <h2 className="font-semibold text-sm text-[var(--text)]">Calibrate Balance</h2>
              <p className="text-[10px] text-[var(--text-muted)]">{account.name}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="calibration-close"
            onClick={onClose}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Current balance card */}
          <div className="p-3 rounded-lg bg-[var(--bg)] border border-hairline flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">
              {isCreditCard ? "Current Computed Debt" : "Current Computed Balance"}
            </span>
            <span
              data-testid="current-computed-balance"
              className="font-mono font-bold text-sm text-[var(--text)] tabular-nums"
            >
              {formatMoney(isCreditCard ? currentDebtMinor : currentBalanceMinor)}
            </span>
          </div>

          {/* Real Balance Input & Delta */}
          <div className="p-3 rounded-lg border border-hairline bg-[var(--bg)] space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                {isCreditCard ? "Real Outstanding Debt" : "Real Balance"}
              </span>
              {/* Live Delta Display */}
              <span
                data-testid="calibration-delta"
                className={`font-mono font-semibold tabular-nums ${
                  deltaMinor > 0
                    ? "text-income"
                    : deltaMinor < 0
                    ? "text-expense"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {deltaMinor > 0
                  ? `+${(deltaMinor / 100).toFixed(2)}`
                  : deltaMinor < 0
                  ? `-${(Math.abs(deltaMinor) / 100).toFixed(2)}`
                  : "+0.00"}
              </span>
            </div>

            <input
              type="text"
              data-testid="real-balance-input"
              inputMode="none"
              value={expression || "0"}
              onKeyDown={handleKeyDown}
              readOnly
              className="w-full text-2xl font-bold font-mono tracking-tight bg-transparent text-[var(--text)] focus:outline-none text-right tabular-nums cursor-default"
            />
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--bg)] rounded-lg border border-hairline">
            <button
              type="button"
              data-testid="keypad-7"
              onClick={() => onKeypadClick("7")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              7
            </button>
            <button
              type="button"
              data-testid="keypad-8"
              onClick={() => onKeypadClick("8")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              8
            </button>
            <button
              type="button"
              data-testid="keypad-9"
              onClick={() => onKeypadClick("9")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              9
            </button>
            <button
              type="button"
              data-testid="keypad-divide"
              onClick={() => onKeypadClick("÷")}
              className="py-2.5 rounded font-mono text-sm font-semibold bg-[var(--border)] text-[var(--text)]"
            >
              ÷
            </button>

            <button
              type="button"
              data-testid="keypad-4"
              onClick={() => onKeypadClick("4")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              4
            </button>
            <button
              type="button"
              data-testid="keypad-5"
              onClick={() => onKeypadClick("5")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              5
            </button>
            <button
              type="button"
              data-testid="keypad-6"
              onClick={() => onKeypadClick("6")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              6
            </button>
            <button
              type="button"
              data-testid="keypad-multiply"
              onClick={() => onKeypadClick("×")}
              className="py-2.5 rounded font-mono text-sm font-semibold bg-[var(--border)] text-[var(--text)]"
            >
              ×
            </button>

            <button
              type="button"
              data-testid="keypad-1"
              onClick={() => onKeypadClick("1")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              1
            </button>
            <button
              type="button"
              data-testid="keypad-2"
              onClick={() => onKeypadClick("2")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              2
            </button>
            <button
              type="button"
              data-testid="keypad-3"
              onClick={() => onKeypadClick("3")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              3
            </button>
            <button
              type="button"
              data-testid="keypad-minus"
              onClick={() => onKeypadClick("-")}
              className="py-2.5 rounded font-mono text-sm font-semibold bg-[var(--border)] text-[var(--text)]"
            >
              −
            </button>

            <button
              type="button"
              data-testid="keypad-dot"
              onClick={() => onKeypadClick(".")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              .
            </button>
            <button
              type="button"
              data-testid="keypad-0"
              onClick={() => onKeypadClick("0")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              0
            </button>
            <button
              type="button"
              data-testid="keypad-backspace"
              onClick={() => onKeypadClick("⌫")}
              className="py-2.5 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] text-[var(--text)]"
            >
              ⌫
            </button>
            <button
              type="button"
              data-testid="keypad-plus"
              onClick={() => onKeypadClick("+")}
              className="py-2.5 rounded font-mono text-sm font-semibold bg-[var(--border)] text-[var(--text)]"
            >
              +
            </button>
          </div>

          {/* Optional Note */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Note (optional)</label>
            <input
              type="text"
              data-testid="calibration-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Monthly statement check, wallet count"
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>

          {/* Nothing to adjust message */}
          {isNothingToAdjust && (
            <div
              data-testid="nothing-to-adjust-msg"
              className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-medium text-center"
            >
              Nothing to adjust
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium py-1">
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="p-3 border-t border-hairline bg-[var(--surface)]">
          <button
            type="button"
            data-testid="calibration-save-btn"
            disabled={isNothingToAdjust || enteredRealMinor === null}
            onClick={handleSave}
            className="w-full py-2.5 px-4 rounded bg-[var(--text)] text-[var(--bg)] font-semibold text-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            Save Calibration
          </button>
        </div>
      </div>
    </div>
  );
}

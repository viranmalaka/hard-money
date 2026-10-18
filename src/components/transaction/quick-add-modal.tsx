"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { X, AlertCircle } from "lucide-react";
import { useAccounts, useCategories, useTemplates, useSync } from "@/components/sync-provider";
import { LocalTemplate } from "@/lib/db";
import { localCreateTransaction } from "@/lib/sync/client";
import {
  evaluateExpression,
  handleKeypadPress,
  KeypadToken,
} from "@/lib/finance-core/calculator";
import { useQuickAdd, TransactionType } from "./quick-add-context";

/**
 * Returns today's date in YYYY-MM-DD formatted for Asia/Colombo or local timezone
 */
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

export function QuickAddModal() {
  const { isOpen } = useQuickAdd();

  if (!isOpen) return null;

  return <QuickAddModalContent />;
}

function QuickAddModalContent() {
  const { closeQuickAdd, initialType, initialAccountId } = useQuickAdd();
  const accounts = useAccounts();
  const categories = useCategories();
  const { db, userId } = useSync();

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  const templates = useTemplates();
  const [type, setType] = useState<TransactionType>(initialType || "EXPENSE");
  const [date, setDate] = useState<string>(getTodayDateString());
  const [expression, setExpression] = useState<string>("");
  const [rawAccountId, setAccountId] = useState<string>(initialAccountId || "");
  const [rawToAccountId, setToAccountId] = useState<string>("");
  const [rawCategoryId, setCategoryId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleApplyTemplate = (tmpl: LocalTemplate) => {
    if (tmpl.type === "EXPENSE" || tmpl.type === "INCOME" || tmpl.type === "TRANSFER") {
      setType(tmpl.type);
    }
    if (tmpl.accountId) {
      setAccountId(tmpl.accountId);
    }
    if (tmpl.toAccountId) {
      setToAccountId(tmpl.toAccountId);
    }
    if (tmpl.categoryId) {
      setCategoryId(tmpl.categoryId);
    }
    if (tmpl.defaultAmountMinor) {
      setExpression(String(tmpl.defaultAmountMinor / 100));
    }
    if (tmpl.note) {
      setNote(tmpl.note);
    }
  };

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Derived effective account and category with sensible fallbacks
  const accountId = useMemo(() => {
    if (rawAccountId && activeAccounts.some((a) => a.id === rawAccountId)) {
      return rawAccountId;
    }
    return activeAccounts[0]?.id || "";
  }, [rawAccountId, activeAccounts]);

  const toAccountId = useMemo(() => {
    if (rawToAccountId && activeAccounts.some((a) => a.id === rawToAccountId && a.id !== accountId)) {
      return rawToAccountId;
    }
    const dest = activeAccounts.find((a) => a.id !== accountId);
    return dest?.id || "";
  }, [rawToAccountId, activeAccounts, accountId]);

  const categoryId = useMemo(() => {
    if (rawCategoryId && categories.some((c) => c.id === rawCategoryId)) {
      return rawCategoryId;
    }
    return categories[0]?.id || "";
  }, [rawCategoryId, categories]);

  // Live expression evaluation
  const evalResult = useMemo(() => {
    return evaluateExpression(expression);
  }, [expression]);

  // Keypad button click handler
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

  // Physical keyboard listener
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

  const isDivisionByZero = !evalResult.isValid;

  const validateAndSubmit = async (keepOpen = false) => {
    setErrorMsg("");

    // Division by zero or evaluation error
    if (!evalResult.isValid) {
      setErrorMsg(evalResult.error || "Invalid amount formula");
      return;
    }

    const finalAmount = evalResult.value;
    if (!finalAmount || finalAmount <= 0) {
      setErrorMsg("Amount must be greater than 0");
      return;
    }

    if (!accountId) {
      setErrorMsg("Please select an account");
      return;
    }

    if (type === "TRANSFER") {
      if (!toAccountId) {
        setErrorMsg("Please select a destination account");
        return;
      }
      if (toAccountId === accountId) {
        setErrorMsg("Destination account must differ from source account");
        return;
      }
    } else {
      if (!categoryId) {
        setErrorMsg("Please select a category");
        return;
      }
    }

    const amountMinor = Math.round(finalAmount * 100);

    try {
      await localCreateTransaction(db, {
        userId: userId || "default",
        accountId,
        toAccountId: type === "TRANSFER" ? toAccountId : null,
        categoryId: type === "TRANSFER" ? null : categoryId,
        amountMinor,
        direction: type === "EXPENSE" ? "OUT" : type === "INCOME" ? "IN" : null,
        type,
        transactionDate: date,
        note: note.trim() || null,
        source: "MANUAL",
        createdByUserId: userId || "default",
        updatedByUserId: userId || "default",
        isSplit: false,
        excludeFromBudget,
        excludeFromStats: false,
        excludeFromBalance: false,
      });

      if (keepOpen) {
        setExpression("");
        setNote("");
        setErrorMsg("");
      } else {
        closeQuickAdd();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save transaction";
      setErrorMsg(message);
    }
  };

  return (
    <div
      data-testid="quick-add-sheet"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 select-none"
    >
      <div
        data-testid="quick-add-dialog"
        className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-2xl md:rounded-xl shadow-2xl flex flex-col max-h-[95vh] md:max-h-[90vh] overflow-hidden"
      >
        {/* Header: Type Tabs & Close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-[var(--surface)]">
          {/* 3-State Type Switcher */}
          <div className="flex items-center gap-1 p-0.5 bg-[var(--border)] rounded-md text-xs font-semibold">
            <button
              type="button"
              data-testid="type-expense"
              onClick={() => {
                setType("EXPENSE");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded transition-all ${
                type === "EXPENSE"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              data-testid="type-income"
              onClick={() => {
                setType("INCOME");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded transition-all ${
                type === "INCOME"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Income
            </button>
            <button
              type="button"
              data-testid="type-transfer"
              onClick={() => {
                setType("TRANSFER");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded transition-all ${
                type === "TRANSFER"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Transfer
            </button>
          </div>

          {/* Close button */}
          <button
            type="button"
            data-testid="quick-add-close"
            onClick={closeQuickAdd}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Bookmark Chips Row */}
        {templates.length > 0 && (
          <div
            data-testid="bookmark-chips"
            className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-hairline bg-[var(--surface-hover)]/30 no-scrollbar"
          >
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                data-testid={`bookmark-chip-${tmpl.id}`}
                onClick={() => handleApplyTemplate(tmpl)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-hairline bg-[var(--surface)] hover:bg-[var(--border)] text-xs text-[var(--text)] whitespace-nowrap shrink-0 transition-colors"
              >
                <span className="font-medium">{tmpl.name}</span>
                {tmpl.defaultAmountMinor && (
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {(tmpl.defaultAmountMinor / 100).toFixed(0)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Date & Account selectors row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Date</label>
              <input
                type="date"
                data-testid="quick-add-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">
                {type === "TRANSFER" ? "From Account" : "Account"}
              </label>
              <select
                data-testid="quick-add-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-2.5 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Transfer Destination Account */}
          {type === "TRANSFER" && (
            <div className="space-y-1 text-xs">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">To Account</label>
              <select
                data-testid="quick-add-to-account"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full px-2.5 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                {activeAccounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Amount Display & Live Preview */}
          <div className="p-3 rounded-lg border border-hairline bg-[var(--bg)] space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Amount
              </span>
              <span
                data-testid="calculator-preview"
                className={`font-mono text-xs font-semibold tabular-nums ${
                  evalResult.isValid ? "text-[var(--text-muted)]" : "text-red-500 font-bold"
                }`}
              >
                {evalResult.isValid ? evalResult.displayValue : evalResult.displayValue}
              </span>
            </div>

            <input
              ref={amountInputRef}
              type="text"
              data-testid="quick-add-amount"
              inputMode="none"
              value={expression || "0"}
              onKeyDown={handleKeyDown}
              readOnly
              className="w-full text-2xl font-bold font-mono tracking-tight bg-transparent text-[var(--text)] focus:outline-none text-right tabular-nums cursor-default"
            />
          </div>

          {/* Embedded Arithmetic Keypad */}
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--bg)] rounded-lg border border-hairline">
            {/* Row 1 */}
            <KeypadButton id="keypad-7" label="7" onClick={() => onKeypadClick("7")} />
            <KeypadButton id="keypad-8" label="8" onClick={() => onKeypadClick("8")} />
            <KeypadButton id="keypad-9" label="9" onClick={() => onKeypadClick("9")} />
            <KeypadButton
              id="keypad-divide"
              label="÷"
              className="bg-[var(--border)] font-semibold text-sm"
              onClick={() => onKeypadClick("÷")}
            />

            {/* Row 2 */}
            <KeypadButton id="keypad-4" label="4" onClick={() => onKeypadClick("4")} />
            <KeypadButton id="keypad-5" label="5" onClick={() => onKeypadClick("5")} />
            <KeypadButton id="keypad-6" label="6" onClick={() => onKeypadClick("6")} />
            <KeypadButton
              id="keypad-multiply"
              label="×"
              className="bg-[var(--border)] font-semibold text-sm"
              onClick={() => onKeypadClick("×")}
            />

            {/* Row 3 */}
            <KeypadButton id="keypad-1" label="1" onClick={() => onKeypadClick("1")} />
            <KeypadButton id="keypad-2" label="2" onClick={() => onKeypadClick("2")} />
            <KeypadButton id="keypad-3" label="3" onClick={() => onKeypadClick("3")} />
            <KeypadButton
              id="keypad-minus"
              label="−"
              className="bg-[var(--border)] font-semibold text-sm"
              onClick={() => onKeypadClick("-")}
            />

            {/* Row 4 */}
            <KeypadButton id="keypad-dot" label="." onClick={() => onKeypadClick(".")} />
            <KeypadButton id="keypad-0" label="0" onClick={() => onKeypadClick("0")} />
            <KeypadButton
              id="keypad-backspace"
              label="⌫"
              className="text-xs"
              onClick={() => onKeypadClick("⌫")}
            />
            <KeypadButton
              id="keypad-plus"
              label="+"
              className="bg-[var(--border)] font-semibold text-sm"
              onClick={() => onKeypadClick("+")}
            />
          </div>

          {/* Equals Row for Explicit Evaluation */}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="keypad-equals"
              onClick={() => onKeypadClick("=")}
              className="w-full py-1.5 rounded border border-hairline bg-[var(--border)] font-mono text-sm font-semibold hover:bg-[var(--border)]/80 text-[var(--text)] transition-colors"
            >
              =
            </button>
          </div>

          {/* Category Selector Grid (Only for Expense & Income) */}
          {type !== "TRANSFER" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Category</label>
              <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto p-1 rounded border border-hairline bg-[var(--bg)]">
                {categories.map((cat) => {
                  const isSelected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-testid={`category-select-${cat.id}`}
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex flex-col items-center justify-center p-2 rounded text-center transition-all ${
                        isSelected
                          ? "bg-[var(--text)] text-[var(--bg)] font-semibold shadow-xs"
                          : "hover:bg-[var(--border)] text-[var(--text)]"
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full mb-1 shrink-0"
                        style={{ backgroundColor: cat.color || "#888" }}
                      />
                      <span className="text-[10px] truncate max-w-full leading-tight">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Note Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Note (optional)</label>
            <input
              type="text"
              data-testid="quick-add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Lunch with team, monthly salary"
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>

          {/* Exclude from Budget Toggle */}
          <div className="flex items-center justify-between py-1 border-t border-hairline">
            <span className="text-xs text-[var(--text)]">Exclude from budget</span>
            <button
              type="button"
              data-testid="exclude-budget-toggle"
              onClick={() => setExcludeFromBudget(!excludeFromBudget)}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                excludeFromBudget ? "bg-[var(--text)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-[var(--bg)] transition-transform absolute top-0.5 ${
                  excludeFromBudget ? "left-4.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Inline Validation / Error Message */}
          {errorMsg && (
            <div
              data-testid="quick-add-error"
              className="flex items-center gap-1.5 text-xs text-red-500 font-medium py-1"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Save & Continue */}
        <div className="p-3 border-t border-hairline bg-[var(--surface)] grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="quick-add-continue"
            disabled={isDivisionByZero}
            onClick={() => validateAndSubmit(true)}
            className="py-2.5 px-3 rounded border border-hairline font-semibold text-xs text-[var(--text)] hover:bg-[var(--border)] active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            Continue
          </button>
          <button
            type="button"
            data-testid="quick-add-save"
            disabled={isDivisionByZero}
            onClick={() => validateAndSubmit(false)}
            className="py-2.5 px-3 rounded bg-[var(--text)] text-[var(--bg)] font-semibold text-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function KeypadButton({
  id,
  label,
  className = "",
  onClick,
}: {
  id: string;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={id}
      onClick={onClick}
      className={`py-3 rounded font-mono text-sm font-medium hover:bg-[var(--border)] active:bg-[var(--border)] transition-colors text-[var(--text)] ${className}`}
    >
      {label}
    </button>
  );
}

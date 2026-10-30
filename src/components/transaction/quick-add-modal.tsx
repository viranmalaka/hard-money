"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { X, AlertCircle, Calculator } from "lucide-react";
import { useAccounts, useCategories, useTemplates, useSync } from "@/components/sync-provider";
import { getWarmedAccounts, getWarmedCategories } from "@/lib/offline/warmed-cache";
import { LocalAccount, LocalCategory, LocalTemplate } from "@/lib/db";
import { localCreateTransaction } from "@/lib/sync/client";
import {
  evaluateExpression,
  handleKeypadPress,
  KeypadToken,
} from "@/lib/finance-core/calculator";
import { useQuickAdd, TransactionType } from "./quick-add-context";
import { useModalHistory } from "@/hooks/use-modal-history";
import { CategoryIcon } from "@/components/ui/category-icon";
import { NumberKeypadPopup } from "@/components/ui/number-keypad-popup";
import { MobileQuickAdd } from "./mobile-quick-add";
import { getCategoryType, groupCategoriesByType } from "@/lib/categories-data";
import {
  calculateConvertedMinor,
  calculateExchangeRateMicros,
  rateNumberToMicros,
} from "@/lib/finance-core/currency";

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

function getInitialDraft() {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem("hardmoney_quick_add_draft");
    if (saved) {
      sessionStorage.removeItem("hardmoney_quick_add_draft");
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return null;
}

function QuickAddModalContent() {
  const { closeQuickAdd, initialType, initialAccountId } = useQuickAdd();
  useModalHistory(true, closeQuickAdd, "quick-add");
  const liveAccounts = useAccounts();
  const liveCategories = useCategories();
  const accounts: LocalAccount[] = useMemo(() => {
    if (liveAccounts && liveAccounts.length > 0) return liveAccounts;
    if (typeof window !== "undefined" && !navigator.onLine) {
      return getWarmedAccounts();
    }
    return liveAccounts;
  }, [liveAccounts]);

  const categories: LocalCategory[] = useMemo(() => {
    if (liveCategories && liveCategories.length > 0) return liveCategories;
    if (typeof window !== "undefined" && !navigator.onLine) {
      return getWarmedCategories();
    }
    return liveCategories;
  }, [liveCategories]);

  const { db, userId } = useSync();

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  const [initialDraft] = useState(() => getInitialDraft());
  const templates = useTemplates();
  const [type, setType] = useState<TransactionType>(initialDraft?.type || initialType || "EXPENSE");
  const [date, setDate] = useState<string>(initialDraft?.date || getTodayDateString());
  const [expression, setExpression] = useState<string>(initialDraft?.expression || "");
  const [rawAccountId, setAccountId] = useState<string>(initialDraft?.accountId || initialAccountId || "");
  const [rawToAccountId, setToAccountId] = useState<string>(initialDraft?.toAccountId || "");
  const [rawCategoryId, setCategoryId] = useState<string>(initialDraft?.categoryId || "");
  const [destinationAmountStr, setDestinationAmountStr] = useState("");
  const [exchangeRateStr, setExchangeRateStr] = useState("");
  const [note, setNote] = useState<string>(initialDraft?.note || "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(Boolean(initialDraft?.excludeFromBudget));
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Desktop has a physical keyboard: on-screen keypad is opt-in via the calculator toggle
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);

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
  const sourceAccount = useMemo(() => activeAccounts.find((a) => a.id === accountId), [activeAccounts, accountId]);
  const destinationAccount = useMemo(() => activeAccounts.find((a) => a.id === toAccountId), [activeAccounts, toAccountId]);
  const isUsdToLkrTransfer =
    type === "TRANSFER" && sourceAccount?.currency === "USD" && destinationAccount?.currency === "LKR";

  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);

  // Categories valid for the current transaction type
  const typeCategories = type === "INCOME" ? categoryGroups.income : categoryGroups.expense;

  // Mobile: no auto-populated selections — the user picks each field (guided by OK/next flow)
  const mobileCategoryId =
    rawCategoryId && typeCategories.some((c) => c.id === rawCategoryId) ? rawCategoryId : "";
  const mobileAccountId =
    rawAccountId && activeAccounts.some((a) => a.id === rawAccountId) ? rawAccountId : "";
  const mobileToAccountId =
    rawToAccountId && rawToAccountId !== mobileAccountId && activeAccounts.some((a) => a.id === rawToAccountId)
      ? rawToAccountId
      : "";

  // Desktop: sensible fallbacks (first account / first category of the current type)
  const categoryId = useMemo(() => {
    if (rawCategoryId && typeCategories.some((c) => c.id === rawCategoryId)) {
      return rawCategoryId;
    }
    return typeCategories[0]?.id || "";
  }, [rawCategoryId, typeCategories]);

  // Live expression evaluation
  const evalResult = useMemo(() => {
    return evaluateExpression(expression);
  }, [expression]);

  // Keypad button click handler
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
    let destinationAmountMinor: number | null = null;
    let exchangeRateMicros: number | null = null;
    if (isUsdToLkrTransfer) {
      const enteredDestinationMinor = Math.round(Number(destinationAmountStr) * 100);
      const enteredRateMicros = rateNumberToMicros(Number(exchangeRateStr));
      if (enteredDestinationMinor <= 0 && enteredRateMicros <= 0) {
        setErrorMsg("Enter an LKR amount or exchange rate");
        return;
      }
      if (enteredRateMicros > 0) {
        exchangeRateMicros = enteredRateMicros;
        destinationAmountMinor = calculateConvertedMinor(amountMinor, exchangeRateMicros);
      } else {
        destinationAmountMinor = enteredDestinationMinor;
        exchangeRateMicros = calculateExchangeRateMicros(amountMinor, destinationAmountMinor);
      }
    }

    try {
      await localCreateTransaction(db, {
        userId: userId || "default",
        accountId,
        toAccountId: type === "TRANSFER" ? toAccountId : null,
        categoryId: type === "TRANSFER" ? null : categoryId,
        amountMinor,
        destinationAmountMinor,
        exchangeRateMicros,
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
    <>
      {/* Mobile Native View (< md) */}
      <MobileQuickAdd
        type={type}
        setType={setType}
        date={date}
        setDate={setDate}
        expression={expression}
        evalResult={evalResult}
        onKeypadClick={onKeypadClick}
        accountId={mobileAccountId}
        setAccountId={setAccountId}
        toAccountId={mobileToAccountId}
        setToAccountId={setToAccountId}
        categoryId={mobileCategoryId}
        setCategoryId={setCategoryId}
        note={note}
        setNote={setNote}
        excludeFromBudget={excludeFromBudget}
        setExcludeFromBudget={setExcludeFromBudget}
        activeAccounts={activeAccounts}
        categories={categories}
        templates={templates}
        handleApplyTemplate={handleApplyTemplate}
        errorMsg={errorMsg}
        setErrorMsg={setErrorMsg}
        validateAndSubmit={validateAndSubmit}
        closeQuickAdd={closeQuickAdd}
        isDivisionByZero={isDivisionByZero}
      />

      {/* Desktop Modal Sheet (>= md) */}
      <div
        data-testid="quick-add-sheet"
        className="hidden md:flex fixed inset-0 z-50 bg-black/60 backdrop-blur-xs items-center justify-center p-4 select-none overflow-y-auto"
      >
        <div
          data-testid="quick-add-dialog"
          className="w-full max-w-md bg-[var(--surface)] border border-hairline rounded-xl shadow-2xl flex flex-col modal-sheet-dialog overflow-hidden"
        >
        {/* Header: Type Tabs & Close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-[var(--surface)] shrink-0">
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
            className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-hairline bg-[var(--surface-hover)]/30 no-scrollbar shrink-0"
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
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
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
                    {a.name} ({a.currency})
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
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {isUsdToLkrTransfer && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Final LKR amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  data-testid="quick-add-destination-amount"
                  value={destinationAmountStr}
                  onChange={(e) => {
                    setDestinationAmountStr(e.target.value);
                    const destinationMinor = Math.round(Number(e.target.value) * 100);
                    const sourceMinor = Math.round(evalResult.value * 100);
                    setExchangeRateStr(
                      sourceMinor > 0 && destinationMinor > 0
                        ? (calculateExchangeRateMicros(sourceMinor, destinationMinor) / 1_000_000).toFixed(6)
                        : "",
                    );
                  }}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Rate (LKR / USD)</span>
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  data-testid="quick-add-exchange-rate"
                  value={exchangeRateStr}
                  onChange={(e) => {
                    setExchangeRateStr(e.target.value);
                    setDestinationAmountStr("");
                  }}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                />
              </label>
            </div>
          )}

          {/* Amount Display & Live Preview */}
          <div className="p-3 rounded-lg border border-hairline bg-[var(--bg)] space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Amount ({sourceAccount?.currency || "LKR"})
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

            <div className="flex items-center justify-between">
              <input
                ref={amountInputRef}
                type="text"
                data-testid="quick-add-amount"
                inputMode="none"
                value={expression || "0"}
                onKeyDown={handleKeyDown}
                readOnly
                autoFocus
                aria-label="Amount (type digits and + - * /)"
                className="w-full text-2xl font-bold font-mono tracking-tight bg-transparent text-[var(--text)] focus:outline-none text-right tabular-nums cursor-text"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsKeypadOpen(!isKeypadOpen);
                }}
                className={`ml-2 p-1.5 rounded border border-hairline transition-colors ${
                  isKeypadOpen
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
                title="Toggle Calculator Keypad"
              >
                <Calculator size={16} />
              </button>
            </div>
          </div>

          {/* On-Demand Pop-Up Arithmetic Keypad */}
          <NumberKeypadPopup
            isOpen={isKeypadOpen}
            onClose={() => setIsKeypadOpen(false)}
            onKeypadClick={onKeypadClick}
            expression={expression}
            previewValue={evalResult.isValid ? evalResult.displayValue : undefined}
          />

          {/* Category Selector Grid (Only for Expense & Income) */}
          {type !== "TRANSFER" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Category</label>
              <div className="max-h-44 overflow-y-auto p-1.5 rounded border border-hairline bg-[var(--bg)] space-y-2">
                {(type === "INCOME"
                  ? [{ label: "Income", items: categoryGroups.income }, { label: "Expense", items: categoryGroups.expense }]
                  : [{ label: "Expense", items: categoryGroups.expense }, { label: "Income", items: categoryGroups.income }]
                )
                  .filter((g) => g.items.length > 0)
                  .map((group) => (
                    <div key={group.label}>
                      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {group.items.map((cat) => {
                          const isSelected = categoryId === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              data-testid={`category-select-${cat.id}`}
                              onClick={() => {
                                setCategoryId(cat.id);
                                // Picking a category of the other group switches the transaction type
                                const t = getCategoryType(cat);
                                if (t !== type) setType(t);
                              }}
                              className={`flex flex-col items-center justify-center p-2 rounded text-center transition-all ${
                                isSelected
                                  ? "bg-[var(--text)] text-[var(--bg)] font-semibold shadow-xs"
                                  : "hover:bg-[var(--border)] text-[var(--text)]"
                              }`}
                            >
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center mb-1 shrink-0 text-white shadow-xs"
                                style={{ backgroundColor: cat.color || "#888" }}
                              >
                                <CategoryIcon name={cat.icon} size={13} className="text-white" />
                              </span>
                              <span className="text-[10px] truncate max-w-full leading-tight">{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
        <div className="p-3 border-t border-hairline bg-[var(--surface)] grid grid-cols-2 gap-2 pb-sheet-safe shrink-0">
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
    </>
  );
}

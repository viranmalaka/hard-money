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
  const [rawAccountId, setAccountId] = useState<string>(
    initialDraft?.accountId || initialAccountId || ""
  );
  const [rawToAccountId, setToAccountId] = useState<string>(initialDraft?.toAccountId || "");
  const [rawCategoryId, setCategoryId] = useState<string>(initialDraft?.categoryId || "");
  const [destinationAmountStr, setDestinationAmountStr] = useState("");
  const [exchangeRateStr, setExchangeRateStr] = useState("");
  const [note, setNote] = useState<string>(initialDraft?.note || "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    Boolean(initialDraft?.excludeFromBudget)
  );
  const [errorMsg, setErrorMsg] = useState<string>("");
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

  const accountId = useMemo(() => {
    if (rawAccountId && activeAccounts.some((a) => a.id === rawAccountId)) {
      return rawAccountId;
    }
    return activeAccounts[0]?.id || "";
  }, [rawAccountId, activeAccounts]);

  const toAccountId = useMemo(() => {
    if (
      rawToAccountId &&
      activeAccounts.some((a) => a.id === rawToAccountId && a.id !== accountId)
    ) {
      return rawToAccountId;
    }
    const dest = activeAccounts.find((a) => a.id !== accountId);
    return dest?.id || "";
  }, [rawToAccountId, activeAccounts, accountId]);

  const sourceAccount = useMemo(
    () => activeAccounts.find((a) => a.id === accountId),
    [activeAccounts, accountId]
  );
  const destinationAccount = useMemo(
    () => activeAccounts.find((a) => a.id === toAccountId),
    [activeAccounts, toAccountId]
  );
  const isUsdToLkrTransfer =
    type === "TRANSFER" &&
    sourceAccount?.currency === "USD" &&
    destinationAccount?.currency === "LKR";

  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);
  const typeCategories = type === "INCOME" ? categoryGroups.income : categoryGroups.expense;

  const mobileCategoryId =
    rawCategoryId && typeCategories.some((c) => c.id === rawCategoryId) ? rawCategoryId : "";
  const mobileAccountId =
    rawAccountId && activeAccounts.some((a) => a.id === rawAccountId) ? rawAccountId : "";
  const mobileToAccountId =
    rawToAccountId &&
    rawToAccountId !== mobileAccountId &&
    activeAccounts.some((a) => a.id === rawToAccountId)
      ? rawToAccountId
      : "";

  const categoryId = useMemo(() => {
    if (rawCategoryId && typeCategories.some((c) => c.id === rawCategoryId)) {
      return rawCategoryId;
    }
    return typeCategories[0]?.id || "";
  }, [rawCategoryId, typeCategories]);

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

  const isDivisionByZero = !evalResult.isValid;

  const handleDestinationAmountChange = (val: string) => {
    setDestinationAmountStr(val);
    const destinationMinor = Math.round(Number(val) * 100);
    const sourceMinor = Math.round((evalResult.value || 0) * 100);
    setExchangeRateStr(
      sourceMinor > 0 && destinationMinor > 0
        ? (calculateExchangeRateMicros(sourceMinor, destinationMinor) / 1_000_000).toFixed(6)
        : ""
    );
  };

  const handleExchangeRateChange = (val: string) => {
    setExchangeRateStr(val);
    setDestinationAmountStr("");
  };

  const validateAndSubmit = async (keepOpen = false) => {
    setErrorMsg("");

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
        isUsdToLkrTransfer={isUsdToLkrTransfer}
        destinationAmountStr={destinationAmountStr}
        onDestinationAmountChange={handleDestinationAmountChange}
        exchangeRateStr={exchangeRateStr}
        onExchangeRateChange={handleExchangeRateChange}
      />

      {/* Desktop Modal Sheet (>= md) */}
      <div
        data-testid="quick-add-sheet"
        className="hidden md:flex fixed inset-0 z-50 bg-black/60 backdrop-blur-xs items-center justify-center p-4 select-none overflow-y-auto animate-in fade-in duration-150"
      >
        <div
          data-testid="quick-add-dialog"
          className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl flex flex-col modal-sheet-dialog overflow-hidden"
        >
          {/* Header: Type Tabs & Close */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
            <div className="flex items-center gap-1 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs font-bold">
              <button
                type="button"
                data-testid="type-expense"
                onClick={() => {
                  setType("EXPENSE");
                  setErrorMsg("");
                }}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  type === "EXPENSE"
                    ? "bg-[var(--expense)]/12 text-[var(--expense)] border border-[var(--expense)]/25"
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
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  type === "INCOME"
                    ? "bg-[var(--income)]/12 text-[var(--income)] border border-[var(--income)]/25"
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
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  type === "TRANSFER"
                    ? "bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Transfer
              </button>
            </div>

            <button
              type="button"
              data-testid="quick-add-close"
              onClick={closeQuickAdd}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Bookmark Chips Row */}
          {templates.length > 0 && (
            <div
              data-testid="bookmark-chips"
              className="flex items-center gap-2 overflow-x-auto px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)]/50 no-scrollbar shrink-0"
            >
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  data-testid={`bookmark-chip-${tmpl.id}`}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 text-xs text-[var(--text)] whitespace-nowrap shrink-0 transition-colors cursor-pointer shadow-2xs"
                >
                  <span className="font-semibold">{tmpl.name}</span>
                  {tmpl.defaultAmountMinor && (
                    <span className="text-2xs text-[var(--text-muted)] font-mono">
                      {(tmpl.defaultAmountMinor / 100).toFixed(0)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Content Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            {/* Modern Hero Amount Card */}
            <div className="p-5 rounded-3xl border border-[var(--border)] bg-[var(--bg)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Amount ({sourceAccount?.currency || "LKR"})
                </span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="calculator-preview"
                    className={`font-mono text-xs font-bold tabular-nums ${
                      evalResult.isValid ? "text-[var(--text-muted)]" : "text-[var(--expense)]"
                    }`}
                  >
                    {evalResult.displayValue}
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
                className="w-full text-3xl font-bold font-mono tracking-tight bg-transparent text-[var(--text)] focus:outline-none text-center tabular-nums cursor-text py-1"
              />
            </div>

            <NumberKeypadPopup
              isOpen={isKeypadOpen}
              onClose={() => setIsKeypadOpen(false)}
              onKeypadClick={onKeypadClick}
              expression={expression}
              previewValue={evalResult.isValid ? evalResult.displayValue : undefined}
            />

            {/* Date & Account Pill Selectors */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">Date</label>
                <input
                  type="date"
                  data-testid="quick-add-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono text-xs focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  {type === "TRANSFER" ? "From Account" : "Account"}
                </label>
                <select
                  data-testid="quick-add-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {type === "TRANSFER" && (
              <div className="space-y-1.5 text-xs">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  To Account
                </label>
                <select
                  data-testid="quick-add-to-account"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
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
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1.5 block">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    Final LKR amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="quick-add-destination-amount"
                    value={destinationAmountStr}
                    onChange={(e) => handleDestinationAmountChange(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="space-y-1.5 block">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    Rate (LKR / USD)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    data-testid="quick-add-exchange-rate"
                    value={exchangeRateStr}
                    onChange={(e) => handleExchangeRateChange(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            {/* Category Selector Grid */}
            {type !== "TRANSFER" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  Category
                </label>
                <div className="max-h-52 overflow-y-auto p-2.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] space-y-3">
                  {(type === "INCOME"
                    ? [
                        { label: "Income", items: categoryGroups.income },
                        { label: "Expense", items: categoryGroups.expense },
                      ]
                    : [
                        { label: "Expense", items: categoryGroups.expense },
                        { label: "Income", items: categoryGroups.income },
                      ]
                  )
                    .filter((g) => g.items.length > 0)
                    .map((group) => (
                      <div key={group.label}>
                        <div className="px-1 pb-1.5 text-2xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          {group.label}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {group.items.map((cat) => {
                            const isSelected = categoryId === cat.id;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                data-testid={`category-select-${cat.id}`}
                                onClick={() => {
                                  setCategoryId(cat.id);
                                  const t = getCategoryType(cat);
                                  if (t !== type) setType(t);
                                }}
                                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl text-center transition-all cursor-pointer border ${
                                  isSelected
                                    ? "bg-[var(--accent)]/12 border-[var(--accent)] text-[var(--text)] font-bold shadow-2xs"
                                    : "bg-[var(--surface)] border-transparent hover:border-[var(--border)] text-[var(--text)]"
                                }`}
                              >
                                <span
                                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 shrink-0 text-white shadow-2xs"
                                  style={{ backgroundColor: cat.color || "#888" }}
                                >
                                  <CategoryIcon name={cat.icon} size={15} className="text-white" />
                                </span>
                                <span className="text-2xs truncate max-w-full leading-tight">
                                  {cat.name}
                                </span>
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
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Note (optional)
              </label>
              <input
                type="text"
                data-testid="quick-add-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Lunch with team, monthly salary"
                className="w-full h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Exclude from Budget Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-xs font-semibold text-[var(--text)]">Exclude from budget</span>
              <button
                type="button"
                data-testid="exclude-budget-toggle"
                onClick={() => setExcludeFromBudget(!excludeFromBudget)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  excludeFromBudget ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    excludeFromBudget ? "left-5.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {errorMsg && (
              <div
                data-testid="quick-add-error"
                className="flex items-center gap-2 p-3 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-xs text-[var(--expense)] font-semibold"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface)] grid grid-cols-2 gap-3 pb-sheet-safe shrink-0">
            <button
              type="button"
              data-testid="quick-add-continue"
              disabled={isDivisionByZero}
              onClick={() => validateAndSubmit(true)}
              className="h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] font-bold text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              Save &amp; Add Another
            </button>
            <button
              type="button"
              data-testid="quick-add-save"
              disabled={isDivisionByZero}
              onClick={() => validateAndSubmit(false)}
              className="h-12 px-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
            >
              Save Transaction
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

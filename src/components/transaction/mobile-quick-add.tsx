"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  Star,
  X,
  Plus,
  Calendar,
  Tag,
  ArrowUpDown,
  AlertCircle,
  Wallet,
  Building2,
  CreditCard,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LocalAccount, LocalCategory, LocalTemplate } from "@/lib/db";
import { TransactionType } from "./quick-add-context";
import { CategoryIcon } from "@/components/ui/category-icon";
import { groupCategoriesByType } from "@/lib/categories-data";

export type MobileActiveField =
  | "amount"
  | "category"
  | "account"
  | "toAccount"
  | "date"
  | "note";

interface MobileQuickAddProps {
  type: TransactionType;
  setType: (t: TransactionType) => void;
  date: string;
  setDate: (d: string) => void;
  expression: string;
  evalResult: { isValid: boolean; value: number | null; displayValue: string; error?: string };
  onKeypadClick: (token: string) => void;
  accountId: string;
  setAccountId: (id: string) => void;
  toAccountId: string;
  setToAccountId: (id: string) => void;
  categoryId: string;
  setCategoryId: (id: string) => void;
  note: string;
  setNote: (n: string) => void;
  excludeFromBudget: boolean;
  setExcludeFromBudget: (v: boolean) => void;
  activeAccounts: LocalAccount[];
  categories: LocalCategory[];
  templates: LocalTemplate[];
  handleApplyTemplate: (tmpl: LocalTemplate) => void;
  errorMsg: string;
  setErrorMsg: (msg: string) => void;
  validateAndSubmit: (keepOpen?: boolean) => Promise<void>;
  closeQuickAdd: () => void;
  isDivisionByZero: boolean;
  isUsdToLkrTransfer?: boolean;
  destinationAmountStr?: string;
  onDestinationAmountChange?: (val: string) => void;
  exchangeRateStr?: string;
  onExchangeRateChange?: (val: string) => void;
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getRelativeDateString(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function MobileQuickAdd({
  type,
  setType,
  date,
  setDate,
  expression,
  evalResult,
  onKeypadClick,
  accountId,
  setAccountId,
  toAccountId,
  setToAccountId,
  categoryId,
  setCategoryId,
  note,
  setNote,
  excludeFromBudget,
  setExcludeFromBudget,
  activeAccounts,
  categories,
  templates,
  handleApplyTemplate,
  errorMsg,
  setErrorMsg,
  validateAndSubmit,
  closeQuickAdd,
  isDivisionByZero,
  isUsdToLkrTransfer,
  destinationAmountStr = "",
  onDestinationAmountChange,
  exchangeRateStr = "",
  onExchangeRateChange,
}: MobileQuickAddProps) {
  const router = useRouter();
  const [activeField, setActiveField] = useState<MobileActiveField>("amount");
  const [showBookmarks, setShowBookmarks] = useState(false);

  const typeTone = useMemo(() => {
    switch (type) {
      case "EXPENSE":
        return {
          title: "New Expense",
          amountText: "text-[var(--expense)]",
          ctaBg: "bg-[var(--accent)] text-white",
        };
      case "INCOME":
        return {
          title: "New Income",
          amountText: "text-[var(--income)]",
          ctaBg: "bg-[var(--accent)] text-white",
        };
      case "TRANSFER":
        return {
          title: "Transfer Funds",
          amountText: "text-[var(--text)]",
          ctaBg: "bg-[var(--accent)] text-white",
        };
    }
  }, [type]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId]
  );

  const selectedAccount = useMemo(
    () => activeAccounts.find((a) => a.id === accountId),
    [activeAccounts, accountId]
  );

  const selectedToAccount = useMemo(
    () => activeAccounts.find((a) => a.id === toAccountId),
    [activeAccounts, toAccountId]
  );

  const cashAccounts = useMemo(
    () => activeAccounts.filter((a) => a.type === "CASH"),
    [activeAccounts]
  );
  const bankAccounts = useMemo(
    () => activeAccounts.filter((a) => a.type === "BANK_SAVINGS"),
    [activeAccounts]
  );
  const cardAccounts = useMemo(
    () => activeAccounts.filter((a) => a.type === "CREDIT_CARD"),
    [activeAccounts]
  );

  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);

  const firstMissingField = (
    overrides: { categoryId?: string; accountId?: string; toAccountId?: string } = {}
  ): MobileActiveField | null => {
    const cat = overrides.categoryId ?? categoryId;
    const acc = overrides.accountId ?? accountId;
    const toAcc = overrides.toAccountId ?? toAccountId;
    if (!evalResult.isValid || !evalResult.value || evalResult.value <= 0) return "amount";
    if (type !== "TRANSFER" && !cat) return "category";
    if (!acc) return "account";
    if (type === "TRANSFER" && (!toAcc || toAcc === acc)) return "toAccount";
    return null;
  };

  const advance = (overrides?: Parameters<typeof firstMissingField>[0]) => {
    setActiveField(firstMissingField(overrides) ?? "note");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitOrFocusMissing = async () => {
    if (isSubmitting) return;
    const missing = firstMissingField();
    if (missing) {
      setActiveField(missing);
      if (missing === "amount") setErrorMsg("Please enter a valid amount");
      return;
    }
    setIsSubmitting(true);
    try {
      await validateAndSubmit();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeypadOk = () => {
    if (!evalResult.isValid || !evalResult.value || evalResult.value <= 0) {
      setErrorMsg("Please enter a valid amount");
      return;
    }
    setErrorMsg("");
    advance();
  };

  const handleSelectCategory = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      const catType = categoryGroups.income.includes(cat) ? "INCOME" : "EXPENSE";
      if (catType !== type) setType(catType);
    }
    setCategoryId(catId);
    setErrorMsg("");
    advance({ categoryId: catId });
  };

  const handleSelectAccount = (accId: string) => {
    setAccountId(accId);
    setErrorMsg("");
    advance({ accountId: accId });
  };

  const handleSelectToAccount = (accId: string) => {
    setToAccountId(accId);
    setErrorMsg("");
    advance({ toAccountId: accId });
  };

  const handleSwapTransferAccounts = (e: React.MouseEvent) => {
    e.stopPropagation();
    const temp = accountId;
    setAccountId(toAccountId);
    setToAccountId(temp);
  };

  const todayStr = getRelativeDateString(0);
  const yesterdayStr = getRelativeDateString(-1);
  const twoDaysAgoStr = getRelativeDateString(-2);
  const currencyCode = selectedAccount?.currency || "LKR";
  const hasFormula = /[+\-×÷]/.test(expression);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Transaction"
      data-testid="quick-add-mobile"
      className="flex md:hidden flex-col fixed inset-0 z-50 bg-[var(--bg)] text-[var(--text)] select-none overflow-hidden"
    >
      {/* 1. Clean Top Bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <button
          type="button"
          data-testid="quick-add-mobile-back"
          aria-label="Back to Transactions"
          onClick={closeQuickAdd}
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>

        <span className="text-sm font-bold tracking-tight text-[var(--text)]">
          {typeTone.title}
        </span>

        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <button
              type="button"
              data-testid="quick-add-mobile-bookmarks-btn"
              onClick={() => setShowBookmarks(!showBookmarks)}
              className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-colors cursor-pointer ${
                showBookmarks
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-500"
                  : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              title="Templates"
            >
              <Star size={17} fill={showBookmarks ? "currentColor" : "none"} />
            </button>
          )}

          <button
            type="button"
            data-testid="quick-add-mobile-save"
            disabled={isDivisionByZero || isSubmitting}
            onClick={submitOrFocusMissing}
            className="h-10 px-4 rounded-2xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-xs cursor-pointer"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Templates Strip */}
      {showBookmarks && templates.length > 0 && (
        <div
          data-testid="quick-add-mobile-bookmarks"
          className="flex items-center gap-2 overflow-x-auto px-4 pb-3 no-scrollbar shrink-0"
        >
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => {
                handleApplyTemplate(tmpl);
                setShowBookmarks(false);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text)] whitespace-nowrap shrink-0 active:scale-95 transition-all shadow-2xs"
            >
              <span>{tmpl.name}</span>
              {tmpl.defaultAmountMinor && (
                <span className="text-2xs text-[var(--text-muted)] font-mono">
                  {(tmpl.defaultAmountMinor / 100).toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 2. Hero Amount + Pill Selectors */}
      <div className="shrink-0 px-4 pb-3 space-y-3">
        {/* Segmented Type Switcher */}
        <div
          role="radiogroup"
          aria-label="Transaction type"
          className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--surface)] rounded-2xl text-xs font-bold border border-[var(--border)] shadow-2xs"
        >
          <button
            type="button"
            role="radio"
            aria-checked={type === "EXPENSE"}
            data-testid="quick-add-mobile-type-expense"
            onClick={() => {
              setType("EXPENSE");
              setErrorMsg("");
            }}
            className={`h-9 rounded-xl transition-all text-center cursor-pointer ${
              type === "EXPENSE"
                ? "bg-[var(--expense)]/12 text-[var(--expense)] border border-[var(--expense)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "INCOME"}
            data-testid="quick-add-mobile-type-income"
            onClick={() => {
              setType("INCOME");
              setErrorMsg("");
            }}
            className={`h-9 rounded-xl transition-all text-center cursor-pointer ${
              type === "INCOME"
                ? "bg-[var(--income)]/12 text-[var(--income)] border border-[var(--income)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Income
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "TRANSFER"}
            data-testid="quick-add-mobile-type-transfer"
            onClick={() => {
              setType("TRANSFER");
              setErrorMsg("");
            }}
            className={`h-9 rounded-xl transition-all text-center cursor-pointer ${
              type === "TRANSFER"
                ? "bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Transfer
          </button>
        </div>

        {/* Modern Centered Hero Amount Card */}
        <button
          type="button"
          onClick={() => setActiveField("amount")}
          aria-expanded={activeField === "amount"}
          aria-label={`Amount: ${expression || "0"}`}
          className={`w-full rounded-3xl bg-[var(--surface)] border px-5 py-4 text-center transition-all cursor-pointer shadow-xs ${
            activeField === "amount"
              ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
              : "border-[var(--border)]"
          }`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-2xs font-bold font-mono text-[var(--text-muted)]">
              {currencyCode}
            </span>
            {hasFormula && evalResult.isValid && evalResult.value !== null && (
              <span className="text-xs font-mono font-semibold text-[var(--accent)]">
                = {evalResult.displayValue}
              </span>
            )}
          </div>
          <div
            className={`text-3xl font-bold font-mono tracking-tight tabular-nums truncate ${
              expression ? typeTone.amountText : "text-[var(--text-muted)]"
            }`}
          >
            {expression || "0.00"}
          </div>
        </button>

        {/* USD -> LKR Conversion Inputs (when applicable) */}
        {isUsdToLkrTransfer && onDestinationAmountChange && onExchangeRateChange && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={destinationAmountStr}
              onChange={(e) => onDestinationAmountChange(e.target.value)}
              placeholder="Final LKR amount"
              className="h-10 px-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--text)]"
            />
            <input
              type="number"
              min="0"
              step="0.000001"
              value={exchangeRateStr}
              onChange={(e) => onExchangeRateChange(e.target.value)}
              placeholder="Rate (LKR/USD)"
              className="h-10 px-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--text)]"
            />
          </div>
        )}

        {/* Spacious Pill / Card Selectors Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Pill 1: Category OR Transfer Source */}
          {type !== "TRANSFER" ? (
            <button
              type="button"
              onClick={() => setActiveField("category")}
              aria-expanded={activeField === "category"}
              aria-label={`Category: ${selectedCategory?.name || "Select category"}`}
              className={`p-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center gap-2.5 min-w-0 ${
                activeField === "category"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                  : "border-[var(--border)]"
              }`}
            >
              {selectedCategory ? (
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-2xs"
                  style={{ backgroundColor: selectedCategory.color || "#64748B" }}
                >
                  <CategoryIcon name={selectedCategory.icon} size={15} className="text-white" />
                </span>
              ) : (
                <span className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-dashed border-[var(--border)] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                  <Tag size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Category
                </span>
                <span className="text-xs font-bold text-[var(--text)] block truncate">
                  {selectedCategory?.name || "Choose"}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveField("account")}
              aria-expanded={activeField === "account"}
              aria-label={`From Account: ${selectedAccount?.name || "Select source"}`}
              className={`p-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 ${
                activeField === "account"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="min-w-0">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  From
                </span>
                <span className="text-xs font-bold text-[var(--text)] block truncate">
                  {selectedAccount?.name || "Source"}
                </span>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={handleSwapTransferAccounts}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    handleSwapTransferAccounts(e as unknown as React.MouseEvent);
                  }
                }}
                className="w-7 h-7 rounded-lg bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0"
                title="Swap From and To"
                aria-label="Swap From and To accounts"
              >
                <ArrowUpDown size={13} />
              </span>
            </button>
          )}

          {/* Pill 2: Account OR Transfer Destination */}
          {type !== "TRANSFER" ? (
            <button
              type="button"
              onClick={() => setActiveField("account")}
              aria-expanded={activeField === "account"}
              aria-label={`Account: ${selectedAccount?.name || "Select account"}`}
              className={`p-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center gap-2.5 min-w-0 ${
                activeField === "account"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                  : "border-[var(--border)]"
              }`}
            >
              <span className="w-8 h-8 rounded-xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center justify-center shrink-0">
                {selectedAccount?.type === "CREDIT_CARD" ? (
                  <CreditCard size={15} />
                ) : selectedAccount?.type === "BANK_SAVINGS" ? (
                  <Building2 size={15} />
                ) : (
                  <Wallet size={15} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  Account
                </span>
                <span className="text-xs font-bold text-[var(--text)] block truncate">
                  {selectedAccount?.name || "Choose"}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveField("toAccount")}
              aria-expanded={activeField === "toAccount"}
              aria-label={`To Account: ${selectedToAccount?.name || "Select destination"}`}
              className={`p-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center gap-2.5 min-w-0 ${
                activeField === "toAccount"
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                  : "border-[var(--border)]"
              }`}
            >
              <span className="w-8 h-8 rounded-xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center justify-center shrink-0">
                <Wallet size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
                  To
                </span>
                <span className="text-xs font-bold text-[var(--text)] block truncate">
                  {selectedToAccount?.name || "Destination"}
                </span>
              </div>
            </button>
          )}

          {/* Pill 3: Date */}
          <button
            type="button"
            onClick={() => setActiveField("date")}
            aria-expanded={activeField === "date"}
            aria-label={`Date: ${formatDisplayDate(date)}`}
            className={`p-2.5 px-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center gap-2.5 min-w-0 ${
              activeField === "date"
                ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                : "border-[var(--border)]"
            }`}
          >
            <Calendar size={15} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--text)] truncate">
              {date === todayStr ? "Today" : formatDisplayDate(date)}
            </span>
          </button>

          {/* Pill 4: Note */}
          <button
            type="button"
            onClick={() => setActiveField("note")}
            aria-expanded={activeField === "note"}
            aria-label={`Note: ${note.trim() ? note : "None"}`}
            className={`p-2.5 px-3 rounded-2xl bg-[var(--surface)] border text-left transition-all cursor-pointer flex items-center gap-2.5 min-w-0 ${
              activeField === "note"
                ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15"
                : "border-[var(--border)]"
            }`}
          >
            <Tag size={15} className="text-[var(--text-muted)] shrink-0" />
            <span
              className={`text-xs truncate ${
                note.trim() ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"
              }`}
            >
              {note.trim() || "Add note..."}
            </span>
          </button>
        </div>

        {/* Inline Error Message */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-xs text-[var(--expense)] font-semibold"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Spacious Bottom Contextual Sheet */}
      <div className="flex-1 flex flex-col bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl min-h-0 overflow-hidden shadow-lg">
        {/* Sheet Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)]">
          <span className="text-2xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {activeField === "amount" && "Calculator Keypad"}
            {activeField === "category" && "Select Category"}
            {activeField === "account" &&
              (type === "TRANSFER" ? "Select Source Account" : "Select Account")}
            {activeField === "toAccount" && "Select Destination Account"}
            {activeField === "date" && "Select Date"}
            {activeField === "note" && "Note & Options"}
          </span>

          <div className="flex items-center gap-2">
            {activeField === "amount" && (
              <span aria-live="polite" className="text-xs font-mono font-semibold text-[var(--text-muted)]">
                {evalResult.isValid ? evalResult.displayValue : "Error"}
              </span>
            )}
            {activeField !== "amount" && (
              <button
                type="button"
                onClick={() => setActiveField("amount")}
                aria-label="Close panel"
                className="w-7 h-7 rounded-xl bg-[var(--bg)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Sheet Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* A. Spacious Rounded-2xl Calculator Keypad */}
          {activeField === "amount" && (
            <div
              className="h-full grid grid-cols-4 grid-rows-5 gap-2 p-3 bg-[var(--surface)]"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            >
              {/* Row 1: Operators */}
              {[
                { label: "+", aria: "Add", token: "+" },
                { label: "-", aria: "Subtract", token: "-" },
                { label: "×", aria: "Multiply", token: "×" },
                { label: "÷", aria: "Divide", token: "÷" },
              ].map((op) => (
                <button
                  key={op.token}
                  type="button"
                  aria-label={op.aria}
                  onClick={() => onKeypadClick(op.token)}
                  className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--accent)] text-lg font-bold active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
                >
                  {op.label}
                </button>
              ))}

              {/* Row 2: 7, 8, 9, = */}
              {["7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={d}
                  onClick={() => onKeypadClick(d)}
                  className="rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)] text-[var(--text)] text-xl font-bold font-mono active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                aria-label="Equals"
                onClick={() => onKeypadClick("=")}
                className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--accent)] text-lg font-bold active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
              >
                =
              </button>

              {/* Row 3: 4, 5, 6, . */}
              {["4", "5", "6"].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={d}
                  onClick={() => onKeypadClick(d)}
                  className="rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)] text-[var(--text)] text-xl font-bold font-mono active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                aria-label="Decimal point"
                onClick={() => onKeypadClick(".")}
                className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-xl font-bold active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
              >
                .
              </button>

              {/* Row 4: 1, 2, 3, Backspace */}
              {["1", "2", "3"].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={d}
                  onClick={() => onKeypadClick(d)}
                  className="rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)] text-[var(--text)] text-xl font-bold font-mono active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                aria-label="Backspace"
                onClick={() => onKeypadClick("⌫")}
                className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-lg font-bold active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
              >
                ⌫
              </button>

              {/* Row 5: Clear (C), 0, 00, OK */}
              <button
                type="button"
                aria-label="Clear"
                onClick={() => onKeypadClick("C")}
                className="rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-[var(--expense)] text-base font-bold active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                C
              </button>
              <button
                type="button"
                aria-label="0"
                onClick={() => onKeypadClick("0")}
                className="rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)] text-[var(--text)] text-xl font-bold font-mono active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Double zero"
                onClick={() => {
                  onKeypadClick("0");
                  onKeypadClick("0");
                }}
                className="rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)] text-[var(--text)] text-base font-bold font-mono active:scale-95 hover:bg-[var(--surface-hover)] transition-all flex items-center justify-center cursor-pointer"
              >
                00
              </button>
              <button
                type="button"
                aria-label="Confirm amount"
                onClick={handleKeypadOk}
                className={`rounded-2xl font-bold text-base shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer ${typeTone.ctaBg}`}
              >
                OK
              </button>
            </div>
          )}

          {/* B. Category Grid */}
          {activeField === "category" && (
            <div
              className="p-4 grid grid-cols-3 gap-2.5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
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
                .map((group, gi) => (
                  <React.Fragment key={group.label}>
                    <div
                      className={`col-span-3 text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1 ${
                        gi > 0 ? "pt-3" : ""
                      }`}
                    >
                      {group.label}
                    </div>
                    {group.items.map((cat) => {
                      const isSelected = categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat.id)}
                          className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[var(--accent)]/12 border-[var(--accent)] text-[var(--text)] ring-1 ring-[var(--accent)] shadow-xs"
                              : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] active:scale-95"
                          }`}
                        >
                          <span
                            className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2 shrink-0 text-white shadow-xs"
                            style={{ backgroundColor: cat.color || "#64748B" }}
                          >
                            <CategoryIcon name={cat.icon} size={18} className="text-white" />
                          </span>
                          <span className="text-xs font-semibold truncate max-w-full leading-tight">
                            {cat.name}
                          </span>
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    try {
                      sessionStorage.setItem(
                        "hardmoney_quick_add_draft",
                        JSON.stringify({
                          type,
                          date,
                          expression,
                          accountId,
                          toAccountId,
                          categoryId,
                          note,
                          excludeFromBudget,
                        })
                      );
                    } catch {
                      // ignore
                    }
                  }
                  closeQuickAdd();
                  router.push("/more/categories", { transitionTypes: ["nav-forward"] });
                }}
                className="flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] active:scale-95 transition-all cursor-pointer"
              >
                <span className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-2 shrink-0">
                  <Plus size={18} />
                </span>
                <span className="text-xs font-semibold">Add New</span>
              </button>
            </div>
          )}

          {/* C. Account Selection */}
          {(activeField === "account" || activeField === "toAccount") && (
            <div
              className="p-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              {[
                { label: "Cash Wallets", items: cashAccounts, icon: Wallet },
                { label: "Bank Savings & Deposits", items: bankAccounts, icon: Building2 },
                { label: "Credit Cards", items: cardAccounts, icon: CreditCard },
              ]
                .filter((group) => group.items.length > 0)
                .map(({ label, items, icon: GroupIcon }) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center gap-1.5 text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
                      <GroupIcon size={13} className="text-[var(--accent)]" />
                      <span>{label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {items.map((acc) => {
                        const isSelected =
                          activeField === "account"
                            ? accountId === acc.id
                            : toAccountId === acc.id;
                        const isOther = activeField === "toAccount" && accountId === acc.id;
                        if (isOther) return null;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() =>
                              activeField === "account"
                                ? handleSelectAccount(acc.id)
                                : handleSelectToAccount(acc.id)
                            }
                            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[var(--accent)]/12 border-[var(--accent)] ring-1 ring-[var(--accent)] text-[var(--text)]"
                                : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] active:scale-95"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold truncate">{acc.name}</span>
                              {isSelected && (
                                <Check size={15} className="text-[var(--accent)] shrink-0" />
                              )}
                            </div>
                            <span className="text-2xs text-[var(--text-muted)] font-mono mt-1.5">
                              {acc.currency}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* D. Date Selection */}
          {activeField === "date" && (
            <div
              className="p-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Today", value: todayStr },
                  { label: "Yesterday", value: yesterdayStr },
                  { label: "2 Days Ago", value: twoDaysAgoStr },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setDate(preset.value);
                      advance();
                    }}
                    className={`py-3.5 px-2 rounded-2xl border text-center transition-all cursor-pointer ${
                      date === preset.value
                        ? "bg-[var(--accent)]/12 border-[var(--accent)] text-[var(--accent)] font-bold"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <span className="block text-xs font-bold">{preset.label}</span>
                    <span className="block text-2xs text-[var(--text-muted)] mt-0.5">
                      {formatDisplayDate(preset.value)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-[var(--border)]">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  Custom Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          {/* E. Note & Tags */}
          {activeField === "note" && (
            <div
              className="p-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)] block">
                  Transaction Note
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Lunch with team, monthly salary, Uber ride"
                  rows={3}
                  className="w-full p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-[var(--text-muted)] block">
                  Quick Tags
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Lunch",
                    "Dinner",
                    "Groceries",
                    "Coffee",
                    "Fuel",
                    "Uber",
                    "Salary",
                    "Gift",
                    "Utility",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const current = note.trim();
                        if (!current) {
                          setNote(tag);
                        } else if (!current.includes(tag)) {
                          setNote(`${current}, ${tag}`);
                        }
                      }}
                      className="px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] active:scale-95 transition-all cursor-pointer"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-2.5 border-t border-[var(--border)]">
                <span className="text-xs font-semibold text-[var(--text)]">
                  Exclude from budget
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={excludeFromBudget}
                  aria-label="Exclude from budget"
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

              <button
                type="button"
                data-testid="quick-add-mobile-note-save"
                disabled={isDivisionByZero || isSubmitting}
                onClick={submitOrFocusMissing}
                className={`w-full h-12 rounded-2xl font-bold text-sm shadow-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${typeTone.ctaBg}`}
              >
                {isSubmitting ? "Saving..." : "Save Transaction"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
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
}: MobileQuickAddProps) {
  const router = useRouter();
  // Mobile active field: amount | category | account | toAccount | date | note
  const [activeField, setActiveField] = useState<MobileActiveField>("amount");
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Styling accents based on type
  const themeStyles = useMemo(() => {
    switch (type) {
      case "EXPENSE":
        return {
          title: "Expense",
          accentColor: "#EF4444",
          borderActive: "border-[#EF4444]",
          bgActive: "bg-[#EF4444]/15",
          textActive: "text-[#EF4444]",
          okBtnBg: "bg-[#EF4444] hover:bg-[#DC2626] text-white",
          tagActive: "border-[#EF4444] text-[#EF4444]",
        };
      case "INCOME":
        return {
          title: "Income",
          accentColor: "#3B82F6",
          borderActive: "border-[#3B82F6]",
          bgActive: "bg-[#3B82F6]/15",
          textActive: "text-[#3B82F6]",
          okBtnBg: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white",
          tagActive: "border-[#3B82F6] text-[#3B82F6]",
        };
      case "TRANSFER":
        return {
          title: "Transfer",
          accentColor: "#94A3B8",
          borderActive: "border-slate-300",
          bgActive: "bg-slate-700/40",
          textActive: "text-slate-200",
          okBtnBg: "bg-slate-700 hover:bg-slate-600 text-white",
          tagActive: "border-slate-300 text-slate-200",
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

  // Accounts grouped by type
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

  // Expense/Income categories for the picker (the current type's group is shown first)
  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);

  /**
   * Returns the first required field that is still empty, in entry order.
   * `overrides` lets callers account for a value they've just set (state isn't updated yet).
   */
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

  /** Move to the next empty required field; when everything is filled, open the note panel. */
  const advance = (overrides?: Parameters<typeof firstMissingField>[0]) => {
    setActiveField(firstMissingField(overrides) ?? "note");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Save if complete, otherwise jump to the first missing required field. */
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

  // Keypad OK: amount must be valid, then go to the next required field
  const handleKeypadOk = () => {
    if (!evalResult.isValid || !evalResult.value || evalResult.value <= 0) {
      setErrorMsg("Please enter a valid amount");
      return;
    }
    setErrorMsg("");
    advance();
  };

  const handleSelectCategory = (catId: string) => {
    // Picking a category from the other group switches Expense <-> Income
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Transaction"
      data-testid="quick-add-mobile"
      className="flex md:hidden flex-col fixed inset-0 z-50 bg-[var(--bg)] text-[var(--text)] select-none overflow-hidden"
    >
      {/* 1. Mobile Header with Safe Area Inset Top */}
      <div
        className="shrink-0 flex items-center justify-between px-3 pb-2.5 border-b border-hairline"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 7px)" }}
      >
        <button
          type="button"
          data-testid="quick-add-mobile-back"
          aria-label="Back to Transactions"
          onClick={closeQuickAdd}
          className="flex items-center gap-0.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] active:opacity-75 py-1 px-1.5 -ml-1 rounded transition-colors"
        >
          <ChevronLeft size={20} />
          <span>Trans.</span>
        </button>

        <span className="text-base font-semibold tracking-wide text-[var(--text)]">
          {themeStyles.title}
        </span>

        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <button
              type="button"
              data-testid="quick-add-mobile-bookmarks-btn"
              onClick={() => setShowBookmarks(!showBookmarks)}
              className={`p-1.5 rounded-full transition-colors ${
                showBookmarks
                  ? "bg-amber-400/20 text-amber-300"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              title="Templates"
            >
              <Star size={18} fill={showBookmarks ? "currentColor" : "none"} />
            </button>
          )}

          <button
            type="button"
            data-testid="quick-add-mobile-save"
            disabled={isDivisionByZero || isSubmitting}
            onClick={submitOrFocusMissing}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-xs"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Templates Drawer/Bar */}
      {showBookmarks && templates.length > 0 && (
        <div
          data-testid="quick-add-mobile-bookmarks"
          className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-hairline bg-[var(--surface)] no-scrollbar shrink-0"
        >
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => {
                handleApplyTemplate(tmpl);
                setShowBookmarks(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-hairline bg-[var(--surface-hover)] text-xs text-[var(--text)] whitespace-nowrap shrink-0 hover:opacity-90 active:scale-95 transition-all"
            >
              <span>{tmpl.name}</span>
              {tmpl.defaultAmountMinor && (
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {(tmpl.defaultAmountMinor / 100).toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 2. Top Half: Form Fields */}
      <div className="shrink-0 px-4 pt-3.5 pb-3 bg-[var(--bg)] space-y-2.5">
        {/* Type Switcher: Income | Expense | Transfer */}
        <div
          role="radiogroup"
          aria-label="Transaction type"
          className="grid grid-cols-3 gap-2 p-1 bg-[var(--surface)] rounded-xl text-xs font-semibold border border-hairline mb-3"
        >
          <button
            type="button"
            role="radio"
            aria-checked={type === "INCOME"}
            data-testid="quick-add-mobile-type-income"
            onClick={() => {
              setType("INCOME");
              setErrorMsg("");
            }}
            className={`py-2 rounded-lg transition-all text-center ${
              type === "INCOME"
                ? "bg-[#2563EB]/20 text-[#3B82F6] border border-[#3B82F6] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Income
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "EXPENSE"}
            data-testid="quick-add-mobile-type-expense"
            onClick={() => {
              setType("EXPENSE");
              setErrorMsg("");
            }}
            className={`py-2 rounded-lg transition-all text-center ${
              type === "EXPENSE"
                ? "bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Expense
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
            className={`py-2 rounded-lg transition-all text-center ${
              type === "TRANSFER"
                ? "bg-[var(--border)] text-[var(--text)] border border-[var(--border)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Transfer
          </button>
        </div>

        {/* Form Rows */}
        <div className="space-y-2 text-sm">
          {/* Row: Date */}
          <button
            type="button"
            onClick={() => setActiveField("date")}
            aria-expanded={activeField === "date"}
            aria-label={`Date: ${formatDisplayDate(date)}`}
            className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
              activeField === "date"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-hairline"
            }`}
          >
            <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">Date</span>
            <div className="flex-1 flex items-center justify-between pl-2">
              <span className="text-[var(--text)] font-mono text-xs">
                {formatDisplayDate(date)}
              </span>
              <Calendar size={15} className="text-[var(--text-muted)]" />
            </div>
          </button>

          {/* Row: Amount */}
          <button
            type="button"
            onClick={() => setActiveField("amount")}
            aria-expanded={activeField === "amount"}
            aria-label={`Amount: ${expression || "0"}`}
            className={`w-full flex items-center justify-between py-3 min-h-[50px] cursor-pointer transition-colors text-left ${
              activeField === "amount"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-hairline"
            }`}
          >
            <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">Amount</span>
            <div className="flex-1 flex items-center justify-end pl-2">
              <div className="text-right">
                <span className="text-xl font-bold font-mono tracking-tight text-[var(--text)]">
                  {expression || "0"}
                </span>
                {expression && evalResult.isValid && evalResult.value !== null && (
                  <span className="ml-2.5 text-xs font-mono text-[var(--text-muted)]">
                    ≈ {evalResult.displayValue}
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Row: Category (Only for Expense & Income) */}
          {type !== "TRANSFER" && (
            <button
              type="button"
              onClick={() => setActiveField("category")}
              aria-expanded={activeField === "category"}
              aria-label={`Category: ${selectedCategory?.name || "Select category"}`}
              className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
                activeField === "category"
                  ? `border-b-2 ${themeStyles.borderActive}`
                  : "border-b border-hairline"
              }`}
            >
              <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">Category</span>
              <div className="flex-1 flex items-center justify-between pl-2">
                {selectedCategory ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5.5 h-5.5 rounded-full flex items-center justify-center shrink-0 text-white shadow-xs"
                      style={{ backgroundColor: selectedCategory.color || "#888" }}
                    >
                      <CategoryIcon name={selectedCategory.icon} size={12} className="text-white" />
                    </span>
                    <span className="text-xs font-medium text-[var(--text)] truncate">
                      {selectedCategory.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-muted)] italic">Select category</span>
                )}
              </div>
            </button>
          )}

          {/* Row: Account (for Expense/Income) OR From/To (for Transfer) */}
          {type !== "TRANSFER" ? (
            <button
              type="button"
              onClick={() => setActiveField("account")}
              aria-expanded={activeField === "account"}
              aria-label={`Account: ${selectedAccount?.name || "Select account"}`}
              className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
                activeField === "account"
                  ? `border-b-2 ${themeStyles.borderActive}`
                  : "border-b border-hairline"
              }`}
            >
              <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">Account</span>
              <div className="flex-1 flex items-center justify-between pl-2">
                {selectedAccount ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
                    {selectedAccount.type === "CASH" && <Wallet size={14} className="text-emerald-400" />}
                    {selectedAccount.type === "BANK_SAVINGS" && (
                      <Building2 size={14} className="text-blue-400" />
                    )}
                    {selectedAccount.type === "CREDIT_CARD" && (
                      <CreditCard size={14} className="text-amber-400" />
                    )}
                    <span>{selectedAccount.name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-muted)] italic">Select account</span>
                )}
              </div>
            </button>
          ) : (
            <>
              {/* Transfer: From Account */}
              <button
                type="button"
                onClick={() => setActiveField("account")}
                aria-expanded={activeField === "account"}
                aria-label={`From Account: ${selectedAccount?.name || "Select source"}`}
                className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
                  activeField === "account"
                    ? `border-b-2 ${themeStyles.borderActive}`
                    : "border-b border-hairline"
                }`}
              >
                <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">From</span>
                <div className="flex-1 flex items-center justify-between pl-2">
                  <span className="text-xs font-medium text-[var(--text)]">
                    {selectedAccount?.name || "Select source"}
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleSwapTransferAccounts}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        handleSwapTransferAccounts(e as unknown as React.MouseEvent);
                      }
                    }}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                    title="Swap From and To"
                    aria-label="Swap From and To accounts"
                  >
                    <ArrowUpDown size={15} />
                  </div>
                </div>
              </button>

              {/* Transfer: To Account */}
              <button
                type="button"
                onClick={() => setActiveField("toAccount")}
                aria-expanded={activeField === "toAccount"}
                aria-label={`To Account: ${selectedToAccount?.name || "Select destination"}`}
                className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
                  activeField === "toAccount"
                    ? `border-b-2 ${themeStyles.borderActive}`
                    : "border-b border-hairline"
                }`}
              >
                <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">To</span>
                <div className="flex-1 flex items-center justify-between pl-2">
                  <span className="text-xs font-medium text-[var(--text)]">
                    {selectedToAccount?.name || "Select destination"}
                  </span>
                </div>
              </button>
            </>
          )}

          {/* Row: Note */}
          <button
            type="button"
            onClick={() => setActiveField("note")}
            aria-expanded={activeField === "note"}
            aria-label={`Note: ${note.trim() ? note : "None"}`}
            className={`w-full flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors text-left ${
              activeField === "note"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-hairline"
            }`}
          >
            <span className="text-xs font-medium text-[var(--text-muted)] w-24 tracking-wide">Note</span>
            <div className="flex-1 flex items-center justify-between pl-2">
              <span className="text-xs text-[var(--text)] truncate max-w-[200px]">
                {note.trim() ? note : <span className="text-[var(--text-muted)] italic">Add note...</span>}
              </span>
              <Tag size={14} className="text-[var(--text-muted)]" />
            </div>
          </button>
        </div>

        {/* Inline Error Message */}
        {errorMsg && (
          <div role="alert" className="flex items-center gap-1.5 text-xs text-rose-500 font-medium py-1">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Bottom Half: Dedicated Contextual Input Surface */}
      <div className="flex-1 flex flex-col bg-[var(--surface)] border-t border-hairline min-h-0 overflow-hidden">
        {/* Panel Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-hairline bg-[var(--surface-hover)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {activeField === "amount" && "Amount Keypad"}
            {activeField === "category" && "Select Category"}
            {activeField === "account" && (type === "TRANSFER" ? "Select Source Account" : "Select Account")}
            {activeField === "toAccount" && "Select Destination Account"}
            {activeField === "date" && "Select Date"}
            {activeField === "note" && "Add Note & Tags"}
          </span>

          <div className="flex items-center gap-2">
            {activeField === "amount" && (
              <span aria-live="polite" className="text-xs font-mono text-[var(--text-muted)]">
                {evalResult.isValid ? evalResult.displayValue : "Error"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setActiveField("amount")}
              aria-label="Close panel"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Panel Dynamic Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* A. Amount Keypad */}
          {activeField === "amount" && (
            <div
              className="h-full grid grid-cols-4 grid-rows-5 gap-1.5 p-2 bg-[var(--bg)]"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
            >
              {/* Row 1: Operators */}
              <button
                type="button"
                aria-label="Add"
                onClick={() => onKeypadClick("+")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Subtract"
                onClick={() => onKeypadClick("-")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                -
              </button>
              <button
                type="button"
                aria-label="Multiply"
                onClick={() => onKeypadClick("×")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                ×
              </button>
              <button
                type="button"
                aria-label="Divide"
                onClick={() => onKeypadClick("÷")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                ÷
              </button>

              {/* Row 2: 7, 8, 9, = */}
              <button
                type="button"
                aria-label="7"
                onClick={() => onKeypadClick("7")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                7
              </button>
              <button
                type="button"
                aria-label="8"
                onClick={() => onKeypadClick("8")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                8
              </button>
              <button
                type="button"
                aria-label="9"
                onClick={() => onKeypadClick("9")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                9
              </button>
              <button
                type="button"
                aria-label="Equals"
                onClick={() => onKeypadClick("=")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                =
              </button>

              {/* Row 3: 4, 5, 6, . */}
              <button
                type="button"
                aria-label="4"
                onClick={() => onKeypadClick("4")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                4
              </button>
              <button
                type="button"
                aria-label="5"
                onClick={() => onKeypadClick("5")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                5
              </button>
              <button
                type="button"
                aria-label="6"
                onClick={() => onKeypadClick("6")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                6
              </button>
              <button
                type="button"
                aria-label="Decimal point"
                onClick={() => onKeypadClick(".")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-semibold active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                .
              </button>

              {/* Row 4: 1, 2, 3, Backspace */}
              <button
                type="button"
                aria-label="1"
                onClick={() => onKeypadClick("1")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                1
              </button>
              <button
                type="button"
                aria-label="2"
                onClick={() => onKeypadClick("2")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                2
              </button>
              <button
                type="button"
                aria-label="3"
                onClick={() => onKeypadClick("3")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                3
              </button>
              <button
                type="button"
                aria-label="Backspace"
                onClick={() => onKeypadClick("⌫")}
                className="rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-lg font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                ⌫
              </button>

              {/* Row 5: Clear (C), 0, 00, OK */}
              <button
                type="button"
                aria-label="Clear"
                onClick={() => onKeypadClick("C")}
                className="rounded-lg bg-[var(--surface-hover)] text-rose-400 text-base font-semibold active:opacity-75 hover:bg-[var(--border)] transition-colors flex items-center justify-center"
              >
                C
              </button>
              <button
                type="button"
                aria-label="0"
                onClick={() => onKeypadClick("0")}
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-xl font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
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
                className="rounded-lg bg-[var(--surface)] text-[var(--text)] text-base font-medium active:opacity-75 hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-center"
              >
                00
              </button>
              <button
                type="button"
                aria-label="Confirm amount"
                onClick={handleKeypadOk}
                className={`rounded-lg font-bold text-base shadow-md active:scale-95 transition-all flex items-center justify-center ${themeStyles.okBtnBg}`}
              >
                OK
              </button>
            </div>
          )}

          {/* B. Category Grid */}
          {activeField === "category" && (
            <div
              className="p-3 grid grid-cols-3 gap-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              {(type === "INCOME"
                ? [{ label: "Income", items: categoryGroups.income }, { label: "Expense", items: categoryGroups.expense }]
                : [{ label: "Expense", items: categoryGroups.expense }, { label: "Income", items: categoryGroups.income }]
              )
                .filter((g) => g.items.length > 0)
                .map((group, gi) => (
                  <React.Fragment key={group.label}>
                    <div
                      className={`col-span-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${
                        gi > 0 ? "pt-2" : ""
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
                          className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-center transition-all ${
                            isSelected
                              ? "bg-[#202734] border-[#3B82F6] text-white ring-1 ring-[#3B82F6] shadow-sm"
                              : "bg-[#1B2028] border-slate-800 text-slate-300 hover:bg-[#222933] active:scale-95"
                          }`}
                        >
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center mb-1.5 shrink-0 text-white shadow-sm"
                            style={{ backgroundColor: cat.color || "#64748B" }}
                          >
                            <CategoryIcon name={cat.icon} size={18} className="text-white" />
                          </span>
                          <span className="text-xs font-medium truncate max-w-full leading-tight">{cat.name}</span>
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}

              {/* Add Category Tile */}
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
                className="flex flex-col items-center justify-center py-3 px-2 rounded-xl border border-dashed border-slate-700 bg-[#161B22] text-slate-400 hover:text-white hover:border-slate-500 active:scale-95 transition-all"
              >
                <span className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center mb-1.5 shrink-0 text-slate-400">
                  <Plus size={18} />
                </span>
                <span className="text-xs font-medium">Add New</span>
              </button>
            </div>
          )}

          {/* C. Account Selection */}
          {(activeField === "account" || activeField === "toAccount") && (
            <div
              className="p-3 space-y-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              {/* Cash Section */}
              {cashAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    <Wallet size={12} className="text-emerald-400" />
                    <span>Cash Accounts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {cashAccounts.map((acc) => {
                      const isSelected =
                        activeField === "account"
                          ? accountId === acc.id
                          : toAccountId === acc.id;
                      const isOther =
                        activeField === "toAccount" && accountId === acc.id;
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
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            isSelected
                              ? "bg-[#202734] border-[#3B82F6] ring-1 ring-[#3B82F6] text-white"
                              : "bg-[#1B2028] border-slate-800 text-slate-200 hover:bg-[#222933] active:scale-95"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{acc.name}</span>
                            {isSelected && <Check size={14} className="text-[#3B82F6]" />}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-1">
                            {acc.currency}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bank Accounts Section */}
              {bankAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    <Building2 size={12} className="text-blue-400" />
                    <span>Bank Savings & Deposits</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {bankAccounts.map((acc) => {
                      const isSelected =
                        activeField === "account"
                          ? accountId === acc.id
                          : toAccountId === acc.id;
                      const isOther =
                        activeField === "toAccount" && accountId === acc.id;
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
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            isSelected
                              ? "bg-[#202734] border-[#3B82F6] ring-1 ring-[#3B82F6] text-white"
                              : "bg-[#1B2028] border-slate-800 text-slate-200 hover:bg-[#222933] active:scale-95"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{acc.name}</span>
                            {isSelected && <Check size={14} className="text-[#3B82F6]" />}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-1">
                            {acc.currency}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Credit Cards Section */}
              {cardAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    <CreditCard size={12} className="text-amber-400" />
                    <span>Credit Cards</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {cardAccounts.map((acc) => {
                      const isSelected =
                        activeField === "account"
                          ? accountId === acc.id
                          : toAccountId === acc.id;
                      const isOther =
                        activeField === "toAccount" && accountId === acc.id;
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
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            isSelected
                              ? "bg-[#202734] border-[#3B82F6] ring-1 ring-[#3B82F6] text-white"
                              : "bg-[#1B2028] border-slate-800 text-slate-200 hover:bg-[#222933] active:scale-95"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{acc.name}</span>
                            {isSelected && <Check size={14} className="text-[#3B82F6]" />}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-1">
                            {acc.currency}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* D. Date Selection */}
          {activeField === "date" && (
            <div
              className="p-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDate(todayStr);
                    advance();
                  }}
                  className={`py-3 px-2 rounded-xl border text-center transition-all ${
                    date === todayStr
                      ? "bg-[#202734] border-[#3B82F6] text-white font-semibold"
                      : "bg-[#1B2028] border-slate-800 text-slate-300 hover:bg-[#222933]"
                  }`}
                >
                  <span className="block text-xs">Today</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {formatDisplayDate(todayStr).split(",")[0]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDate(yesterdayStr);
                    advance();
                  }}
                  className={`py-3 px-2 rounded-xl border text-center transition-all ${
                    date === yesterdayStr
                      ? "bg-[#202734] border-[#3B82F6] text-white font-semibold"
                      : "bg-[#1B2028] border-slate-800 text-slate-300 hover:bg-[#222933]"
                  }`}
                >
                  <span className="block text-xs">Yesterday</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {formatDisplayDate(yesterdayStr).split(",")[0]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDate(twoDaysAgoStr);
                    advance();
                  }}
                  className={`py-3 px-2 rounded-xl border text-center transition-all ${
                    date === twoDaysAgoStr
                      ? "bg-[#202734] border-[#3B82F6] text-white font-semibold"
                      : "bg-[#1B2028] border-slate-800 text-slate-300 hover:bg-[#222933]"
                  }`}
                >
                  <span className="block text-xs">2 Days Ago</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {formatDisplayDate(twoDaysAgoStr).split(",")[0]}
                  </span>
                </button>
              </div>

              {/* Custom Date Input */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="text-xs font-medium text-slate-400">Custom Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-[#1B2028] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                />
              </div>
            </div>
          )}

          {/* E. Note & Tags */}
          {activeField === "note" && (
            <div
              className="p-4 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Transaction Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Lunch with team, monthly salary, Uber ride"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#1B2028] text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                />
              </div>

              {/* Quick tags */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Quick Tags</span>
                <div className="flex flex-wrap gap-1.5">
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
                      className="px-2.5 py-1 rounded-full border border-slate-700 bg-[#1B2028] text-xs text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exclude from Budget Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-hairline">
                <span className="text-xs text-[var(--text)]">Exclude from budget</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={excludeFromBudget}
                  aria-label="Exclude from budget"
                  onClick={() => setExcludeFromBudget(!excludeFromBudget)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    excludeFromBudget ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)] border border-hairline"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      excludeFromBudget ? "left-5" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Primary action: save (or jump to the first missing required field) */}
              <button
                type="button"
                data-testid="quick-add-mobile-note-save"
                disabled={isDivisionByZero || isSubmitting}
                onClick={submitOrFocusMissing}
                className={`w-full py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none ${themeStyles.okBtnBg}`}
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

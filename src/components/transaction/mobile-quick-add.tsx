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

  // Step transitions
  const handleKeypadOk = () => {
    // If division by zero or negative, error is handled
    if (!evalResult.isValid || !evalResult.value || evalResult.value <= 0) {
      setErrorMsg("Please enter a valid amount");
      return;
    }

    if (type === "TRANSFER") {
      if (!accountId) {
        setActiveField("account");
      } else if (!toAccountId) {
        setActiveField("toAccount");
      } else {
        validateAndSubmit();
      }
    } else {
      if (!categoryId) {
        setActiveField("category");
      } else if (!accountId) {
        setActiveField("account");
      } else {
        validateAndSubmit();
      }
    }
  };

  const handleSelectCategory = (catId: string) => {
    setCategoryId(catId);
    setErrorMsg("");
    // Auto-advance to Account
    setActiveField("account");
  };

  const handleSelectAccount = (accId: string) => {
    setAccountId(accId);
    setErrorMsg("");
    if (type === "TRANSFER") {
      setActiveField("toAccount");
    } else {
      // If amount and category are filled, can stay or advance to note
      if (!evalResult.value || evalResult.value <= 0) {
        setActiveField("amount");
      } else {
        setActiveField("note");
      }
    }
  };

  const handleSelectToAccount = (accId: string) => {
    setToAccountId(accId);
    setErrorMsg("");
    if (!evalResult.value || evalResult.value <= 0) {
      setActiveField("amount");
    } else {
      setActiveField("note");
    }
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
      data-testid="quick-add-mobile"
      className="flex md:hidden flex-col fixed inset-0 z-50 bg-[#12161A] text-white select-none overflow-hidden"
    >
      {/* 1. Mobile Header with Safe Area Inset Top */}
      <div
        className="shrink-0 flex items-center justify-between px-3 pb-2.5 border-b border-[#222831]"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 7px)" }}
      >
        <button
          type="button"
          data-testid="quick-add-mobile-back"
          onClick={closeQuickAdd}
          className="flex items-center gap-0.5 text-sm font-medium text-slate-300 hover:text-white active:opacity-75 py-1 px-1.5 -ml-1 rounded transition-colors"
        >
          <ChevronLeft size={20} />
          <span>Trans.</span>
        </button>

        <span className="text-base font-semibold tracking-wide text-white">
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
                  : "text-slate-400 hover:text-white"
              }`}
              title="Templates"
            >
              <Star size={18} fill={showBookmarks ? "currentColor" : "none"} />
            </button>
          )}

          <button
            type="button"
            data-testid="quick-add-mobile-save"
            disabled={isDivisionByZero || !evalResult.value || evalResult.value <= 0}
            onClick={() => validateAndSubmit(false)}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-white text-black hover:bg-slate-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-xs"
          >
            Save
          </button>
        </div>
      </div>

      {/* Templates Drawer/Bar */}
      {showBookmarks && templates.length > 0 && (
        <div
          data-testid="quick-add-mobile-bookmarks"
          className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-[#222831] bg-[#181D24] no-scrollbar shrink-0"
        >
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => {
                handleApplyTemplate(tmpl);
                setShowBookmarks(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-700 bg-[#202630] text-xs text-white whitespace-nowrap shrink-0 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <span>{tmpl.name}</span>
              {tmpl.defaultAmountMinor && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {(tmpl.defaultAmountMinor / 100).toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 2. Top Half: Form Fields */}
      <div className="shrink-0 px-4 pt-3.5 pb-3 bg-[#12161A] space-y-2.5">
        {/* Type Switcher: Income | Expense | Transfer */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#1A1F26] rounded-xl text-xs font-semibold border border-hairline/30 mb-3">
          <button
            type="button"
            data-testid="quick-add-mobile-type-income"
            onClick={() => {
              setType("INCOME");
              setErrorMsg("");
            }}
            className={`py-2 rounded-lg transition-all text-center ${
              type === "INCOME"
                ? "bg-[#2563EB]/20 text-[#3B82F6] border border-[#3B82F6] shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Income
          </button>
          <button
            type="button"
            data-testid="quick-add-mobile-type-expense"
            onClick={() => {
              setType("EXPENSE");
              setErrorMsg("");
            }}
            className={`py-2 rounded-lg transition-all text-center ${
              type === "EXPENSE"
                ? "bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444] shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            data-testid="quick-add-mobile-type-transfer"
            onClick={() => {
              setType("TRANSFER");
              setErrorMsg("");
            }}
            className={`py-2 rounded-lg transition-all text-center ${
              type === "TRANSFER"
                ? "bg-slate-700/50 text-white border border-slate-300 shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Transfer
          </button>
        </div>

        {/* Form Rows */}
        <div className="space-y-2 text-sm">
          {/* Row: Date */}
          <div
            onClick={() => setActiveField("date")}
            className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
              activeField === "date"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-[#222831]"
            }`}
          >
            <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">Date</span>
            <div className="flex-1 flex items-center justify-between pl-2">
              <span className="text-slate-200 font-mono text-xs">
                {formatDisplayDate(date)}
              </span>
              <Calendar size={15} className="text-slate-500" />
            </div>
          </div>

          {/* Row: Amount */}
          <div
            onClick={() => setActiveField("amount")}
            className={`flex items-center justify-between py-3 min-h-[50px] cursor-pointer transition-colors ${
              activeField === "amount"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-[#222831]"
            }`}
          >
            <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">Amount</span>
            <div className="flex-1 flex items-center justify-end pl-2">
              <div className="text-right">
                <span className="text-xl font-bold font-mono tracking-tight text-white">
                  {expression || "0"}
                </span>
                {expression && evalResult.isValid && evalResult.value !== null && (
                  <span className="ml-2.5 text-xs font-mono text-slate-400">
                    ≈ {evalResult.displayValue}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row: Category (Only for Expense & Income) */}
          {type !== "TRANSFER" && (
            <div
              onClick={() => setActiveField("category")}
              className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
                activeField === "category"
                  ? `border-b-2 ${themeStyles.borderActive}`
                  : "border-b border-[#222831]"
              }`}
            >
              <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">Category</span>
              <div className="flex-1 flex items-center justify-between pl-2">
                {selectedCategory ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5.5 h-5.5 rounded-full flex items-center justify-center shrink-0 text-white shadow-xs"
                      style={{ backgroundColor: selectedCategory.color || "#888" }}
                    >
                      <CategoryIcon name={selectedCategory.icon} size={12} className="text-white" />
                    </span>
                    <span className="text-xs font-medium text-white truncate">
                      {selectedCategory.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">Select category</span>
                )}
              </div>
            </div>
          )}

          {/* Row: Account (for Expense/Income) OR From/To (for Transfer) */}
          {type !== "TRANSFER" ? (
            <div
              onClick={() => setActiveField("account")}
              className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
                activeField === "account"
                  ? `border-b-2 ${themeStyles.borderActive}`
                  : "border-b border-[#222831]"
              }`}
            >
              <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">Account</span>
              <div className="flex-1 flex items-center justify-between pl-2">
                {selectedAccount ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-white">
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
                  <span className="text-xs text-slate-500 italic">Select account</span>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Transfer: From Account */}
              <div
                onClick={() => setActiveField("account")}
                className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
                  activeField === "account"
                    ? `border-b-2 ${themeStyles.borderActive}`
                    : "border-b border-[#222831]"
                }`}
              >
                <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">From</span>
                <div className="flex-1 flex items-center justify-between pl-2">
                  <span className="text-xs font-medium text-white">
                    {selectedAccount?.name || "Select source"}
                  </span>
                  <button
                    type="button"
                    onClick={handleSwapTransferAccounts}
                    className="p-1 rounded text-slate-400 hover:text-white"
                    title="Swap From and To"
                  >
                    <ArrowUpDown size={15} />
                  </button>
                </div>
              </div>

              {/* Transfer: To Account */}
              <div
                onClick={() => setActiveField("toAccount")}
                className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
                  activeField === "toAccount"
                    ? `border-b-2 ${themeStyles.borderActive}`
                    : "border-b border-[#222831]"
                }`}
              >
                <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">To</span>
                <div className="flex-1 flex items-center justify-between pl-2">
                  <span className="text-xs font-medium text-white">
                    {selectedToAccount?.name || "Select destination"}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Row: Note */}
          <div
            onClick={() => setActiveField("note")}
            className={`flex items-center justify-between py-3 min-h-[46px] cursor-pointer transition-colors ${
              activeField === "note"
                ? `border-b-2 ${themeStyles.borderActive}`
                : "border-b border-[#222831]"
            }`}
          >
            <span className="text-xs font-medium text-slate-400 w-24 tracking-wide">Note</span>
            <div className="flex-1 flex items-center justify-between pl-2">
              <span className="text-xs text-slate-300 truncate max-w-[200px]">
                {note.trim() ? note : <span className="text-slate-600 italic">Add note...</span>}
              </span>
              <Tag size={14} className="text-slate-500" />
            </div>
          </div>
        </div>

        {/* Inline Error Message */}
        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium py-1">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Bottom Half: Dedicated Contextual Input Surface */}
      <div className="flex-1 flex flex-col bg-[#161B22] border-t border-[#262D37] min-h-0 overflow-hidden">
        {/* Panel Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[#222831] bg-[#1A2029]">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {activeField === "amount" && "Amount Keypad"}
            {activeField === "category" && "Select Category"}
            {activeField === "account" && (type === "TRANSFER" ? "Select Source Account" : "Select Account")}
            {activeField === "toAccount" && "Select Destination Account"}
            {activeField === "date" && "Select Date"}
            {activeField === "note" && "Add Note & Tags"}
          </span>

          <div className="flex items-center gap-2">
            {activeField === "amount" && (
              <span className="text-xs font-mono text-slate-400">
                {evalResult.isValid ? evalResult.displayValue : "Error"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setActiveField("amount")}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
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
              className="h-full grid grid-cols-4 grid-rows-5 gap-1.5 p-2 bg-[#14181F]"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
            >
              {/* Row 1: Operators */}
              <button
                type="button"
                onClick={() => onKeypadClick("+")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("-")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("×")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                ×
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("÷")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                ÷
              </button>

              {/* Row 2: 7, 8, 9, = */}
              <button
                type="button"
                onClick={() => onKeypadClick("7")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("8")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("9")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("=")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                =
              </button>

              {/* Row 3: 4, 5, 6, . */}
              <button
                type="button"
                onClick={() => onKeypadClick("4")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("5")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("6")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick(".")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-semibold active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                .
              </button>

              {/* Row 4: 1, 2, 3, Backspace */}
              <button
                type="button"
                onClick={() => onKeypadClick("1")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("2")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("3")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("⌫")}
                className="rounded-lg bg-[#222834] text-slate-200 text-lg font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                ⌫
              </button>

              {/* Row 5: Clear (C), 0, 00, OK */}
              <button
                type="button"
                onClick={() => onKeypadClick("C")}
                className="rounded-lg bg-[#222834] text-rose-300 text-base font-semibold active:bg-slate-700 hover:bg-[#2A3240] transition-colors flex items-center justify-center"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => onKeypadClick("0")}
                className="rounded-lg bg-[#1B212A] text-white text-xl font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  onKeypadClick("0");
                  onKeypadClick("0");
                }}
                className="rounded-lg bg-[#1B212A] text-slate-300 text-base font-medium active:bg-[#252D3A] hover:bg-[#222834] transition-colors flex items-center justify-center"
              >
                00
              </button>
              <button
                type="button"
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
              {categories.map((cat) => {
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
                    <span className="text-xs font-medium truncate max-w-full leading-tight">
                      {cat.name}
                    </span>
                  </button>
                );
              })}

              {/* Add Category Tile */}
              <button
                type="button"
                onClick={() => {
                  closeQuickAdd();
                  router.push("/more/categories");
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
                    setActiveField("amount");
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
                    setActiveField("amount");
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
                    setActiveField("amount");
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
                  autoFocus
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
              <div className="flex items-center justify-between py-2 border-t border-slate-800">
                <span className="text-xs text-slate-300">Exclude from budget</span>
                <button
                  type="button"
                  onClick={() => setExcludeFromBudget(!excludeFromBudget)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    excludeFromBudget ? "bg-[#3B82F6]" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      excludeFromBudget ? "left-5" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Done button */}
              <button
                type="button"
                onClick={() => setActiveField("amount")}
                className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs active:scale-98 transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

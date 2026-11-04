"use client";

import { groupCategoriesByType } from "@/lib/categories-data";
import React, { useState, useMemo } from "react";
import { X, Trash2, Split, Plus, AlertCircle, Ban } from "lucide-react";
import { useAccounts, useCategories, useTransactions, useSync } from "@/components/sync-provider";
import {
  localUpdateTransaction,
  localDeleteTransaction,
  localCreateInstallmentPlan,
} from "@/lib/sync/client";
import { LocalTransaction, LocalSplitItem } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { useModalHistory } from "@/hooks/use-modal-history";
import {
  calculateConvertedMinor,
  calculateExchangeRateMicros,
  rateMicrosToNumber,
  rateNumberToMicros,
} from "@/lib/finance-core/currency";

interface TransactionEditModalProps {
  transaction: LocalTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (tx: LocalTransaction) => void;
}

export function TransactionEditModal({
  transaction,
  isOpen,
  onClose,
  onDeleted,
}: TransactionEditModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <TransactionEditContent
      transaction={transaction}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

function TransactionEditContent({
  transaction,
  onClose,
  onDeleted,
}: {
  transaction: LocalTransaction;
  onClose: () => void;
  onDeleted?: (tx: LocalTransaction) => void;
}) {
  useModalHistory(true, onClose, "transaction-edit");
  const { db } = useSync();
  const accounts = useAccounts();
  const categories = useCategories();
  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);
  const transactions = useTransactions();

  const [amountStr, setAmountStr] = useState((transaction.amountMinor / 100).toFixed(2));
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [toAccountId, setToAccountId] = useState(transaction.toAccountId || "");
  const [destinationAmountStr, setDestinationAmountStr] = useState(
    transaction.destinationAmountMinor
      ? (transaction.destinationAmountMinor / 100).toFixed(2)
      : ""
  );
  const [exchangeRateStr, setExchangeRateStr] = useState(
    transaction.exchangeRateMicros
      ? rateMicrosToNumber(transaction.exchangeRateMicros).toFixed(6)
      : ""
  );
  const [categoryId, setCategoryId] = useState(transaction.categoryId || "");
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10));
  const [note, setNote] = useState(transaction.note || "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(transaction.excludeFromBudget);

  const [isSplit, setIsSplit] = useState(transaction.isSplit || false);
  const [splitItems, setSplitItems] = useState<LocalSplitItem[]>(() => {
    if (transaction.splitItems && transaction.splitItems.length > 0) {
      return [...transaction.splitItems];
    }
    return [
      {
        id: "split-1",
        categoryId: transaction.categoryId || categories[0]?.id || "",
        amountMinor: transaction.amountMinor,
        note: "",
      },
    ];
  });

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertTenure, setConvertTenure] = useState(12);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const targetAccount = useMemo(
    () => accounts.find((a) => a.id === transaction.accountId),
    [accounts, transaction.accountId]
  );
  const selectedSourceAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );
  const selectedDestinationAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );
  const isUsdToLkrTransfer =
    transaction.type === "TRANSFER" &&
    selectedSourceAccount?.currency === "USD" &&
    selectedDestinationAccount?.currency === "LKR";
  const isCardExpense =
    targetAccount?.type === "CREDIT_CARD" &&
    transaction.type === "EXPENSE" &&
    transaction.subType !== "CC_INSTALLMENT" &&
    !transaction.excludeFromBalance;
  const isSystemInstallment = transaction.subType === "CC_INSTALLMENT";

  const handleConvertConfirm = async () => {
    const tenure = Number(convertTenure) || 12;
    const monthly = Math.floor(transaction.amountMinor / tenure);
    const remainder = transaction.amountMinor - monthly * (tenure - 1);

    const txDate = new Date(transaction.transactionDate);
    const cutoffDay = targetAccount?.statementCutoffDay || 20;
    const { getColomboEndOfDay } = await import("@/lib/finance-core/credit-card");
    let nextM = txDate.getMonth() + 1;
    let nextY = txDate.getFullYear();
    if (txDate.getDate() >= cutoffDay) {
      nextM += 1;
      if (nextM > 12) {
        nextM = 1;
        nextY += 1;
      }
    }
    const firstStatementDate = getColomboEndOfDay(nextY, nextM, cutoffDay);

    await localUpdateTransaction(db, transaction.id, {
      excludeFromBalance: true,
      excludeFromStats: true,
    });

    await localCreateInstallmentPlan(db, {
      userId: transaction.userId || "current-user",
      accountId: transaction.accountId,
      categoryId: transaction.categoryId || null,
      merchantName: transaction.note || "Converted Purchase",
      totalAmountMinor: transaction.amountMinor,
      tenureMonths: tenure,
      monthlyAmountMinor: monthly,
      finalInstallmentAmountMinor: remainder,
      initialPaidInstallments: 0,
      processingFeeMinor: 0,
      processingFeeBilled: false,
      startDate: transaction.transactionDate,
      firstStatementDate: firstStatementDate.toISOString(),
      isOngoingSetup: false,
      status: "ACTIVE",
      originalTransactionId: transaction.id,
      note: transaction.note || null,
    });

    onClose();
  };

  const hasActiveReversal = useMemo(() => {
    return transactions.some(
      (t) => !t.deletedAt && t.reversalOfTransactionId === transaction.id
    );
  }, [transactions, transaction.id]);

  const targetAmountMinor = useMemo(() => {
    return parseMoneyToMinor(amountStr);
  }, [amountStr]);

  const splitSumMinor = useMemo(() => {
    return splitItems.reduce((sum, item) => sum + (item.amountMinor || 0), 0);
  }, [splitItems]);

  const splitRemainingMinor = targetAmountMinor - splitSumMinor;
  const isSplitMismatch = isSplit && splitRemainingMinor !== 0;

  const [splitAmountStrings, setSplitAmountStrings] = useState<string[]>(() => {
    if (transaction.splitItems && transaction.splitItems.length > 0) {
      return transaction.splitItems.map((item) => (item.amountMinor / 100).toFixed(2));
    }
    return [(transaction.amountMinor / 100).toFixed(2)];
  });

  const handleAddSplitItem = () => {
    const remaining = Math.max(0, splitRemainingMinor);
    setSplitItems((prev) => [
      ...prev,
      {
        id: `split-${Date.now()}`,
        categoryId: categories[0]?.id || "",
        amountMinor: remaining,
        note: "",
      },
    ]);
    setSplitAmountStrings((prev) => [...prev, (remaining / 100).toFixed(2)]);
  };

  const handleRemoveSplitItem = (idx: number) => {
    setSplitItems((prev) => prev.filter((_, i) => i !== idx));
    setSplitAmountStrings((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSplitAmountChange = (idx: number, rawVal: string) => {
    setSplitAmountStrings((prev) => prev.map((val, i) => (i === idx ? rawVal : val)));
    const minor = parseMoneyToMinor(rawVal);
    setSplitItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, amountMinor: minor } : item))
    );
  };

  const handleUpdateSplitItem = (idx: number, patch: Partial<LocalSplitItem>) => {
    setSplitItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    );
  };

  const handleSave = async () => {
    setErrorMsg("");

    if (targetAmountMinor <= 0) {
      setErrorMsg("Amount must be greater than 0");
      return;
    }

    if (isSplit && isSplitMismatch) {
      setErrorMsg(`LKR ${(Math.abs(splitRemainingMinor) / 100).toFixed(2)} remaining`);
      return;
    }

    try {
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
          destinationAmountMinor = calculateConvertedMinor(targetAmountMinor, exchangeRateMicros);
        } else {
          destinationAmountMinor = enteredDestinationMinor;
          exchangeRateMicros = calculateExchangeRateMicros(
            targetAmountMinor,
            destinationAmountMinor
          );
        }
      }
      await localUpdateTransaction(db, transaction.id, {
        amountMinor: targetAmountMinor,
        accountId,
        toAccountId: transaction.type === "TRANSFER" ? toAccountId : null,
        destinationAmountMinor: isUsdToLkrTransfer
          ? destinationAmountMinor
          : (transaction.destinationAmountMinor ?? null),
        exchangeRateMicros: isUsdToLkrTransfer
          ? exchangeRateMicros
          : (transaction.exchangeRateMicros ?? null),
        categoryId: isSplit ? null : categoryId,
        transactionDate: date,
        note: note.trim() || null,
        excludeFromBudget,
        isSplit,
        splitItems: isSplit ? splitItems : [],
      });

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update transaction");
    }
  };

  const handleDelete = async () => {
    if (hasActiveReversal) {
      setErrorMsg("Cannot delete transaction: an active reversal exists.");
      return;
    }

    try {
      await localDeleteTransaction(db, transaction.id);
      onDeleted?.(transaction);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  };

  return (
    <div
      data-testid="transaction-edit-sheet"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 select-none overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit Transaction"
        data-testid="transaction-edit-modal"
        className="w-full md:max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col modal-sheet-dialog overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-base text-[var(--text)]">Edit Transaction</span>
            <span className="text-2xs px-2.5 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] font-mono font-bold uppercase">
              {transaction.type}
            </span>
          </div>
          <button
            type="button"
            data-testid="transaction-edit-close"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {/* Hero Amount input */}
          <div className="p-4 rounded-3xl bg-[var(--bg)] border border-[var(--border)] space-y-1.5">
            <label className="text-2xs font-bold uppercase tracking-wider text-[var(--text-muted)] block text-center">
              Amount ({selectedSourceAccount?.currency || "LKR"})
            </label>
            <input
              type="text"
              data-testid="transaction-edit-amount"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full bg-transparent text-[var(--text)] font-mono text-3xl font-bold tabular-nums text-center focus:outline-none py-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Account select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Account
              </label>
              <select
                data-testid="transaction-edit-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Date input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">Date</label>
              <input
                type="date"
                data-testid="transaction-edit-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Transfer Destination Account */}
          {transaction.type === "TRANSFER" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                To Account
              </label>
              <select
                data-testid="transaction-edit-to-account"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  Final LKR amount
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={destinationAmountStr}
                  onChange={(e) => {
                    setDestinationAmountStr(e.target.value);
                    const destinationMinor = Math.round(Number(e.target.value) * 100);
                    setExchangeRateStr(
                      targetAmountMinor > 0 && destinationMinor > 0
                        ? (
                            calculateExchangeRateMicros(targetAmountMinor, destinationMinor) /
                            1_000_000
                          ).toFixed(6)
                        : ""
                    );
                  }}
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
                  value={exchangeRateStr}
                  onChange={(e) => {
                    setExchangeRateStr(e.target.value);
                    setDestinationAmountStr("");
                  }}
                  className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
          )}

          {/* Category Picker */}
          {transaction.type !== "TRANSFER" && !isSplit && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Category
              </label>
              <select
                data-testid="transaction-edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                {(["EXPENSE", "INCOME"] as const).map((g) => {
                  const items = g === "EXPENSE" ? categoryGroups.expense : categoryGroups.income;
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={g} label={g === "EXPENSE" ? "Expense" : "Income"}>
                      {items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}

          {/* Note input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)] block">Note</label>
            <input
              type="text"
              data-testid="transaction-edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add note..."
              className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Split Transaction Section */}
          {transaction.type !== "TRANSFER" && (
            <div className="pt-3 border-t border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-2 text-[var(--text)]">
                  <Split size={15} className="text-[var(--accent)]" />
                  <span>Split into multiple categories</span>
                </span>
                <button
                  type="button"
                  data-testid="split-toggle"
                  onClick={() => setIsSplit(!isSplit)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isSplit ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                      isSplit ? "left-5.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {isSplit && (
                <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)] font-semibold">Split breakdown</span>
                    <span
                      data-testid="split-remaining"
                      className={`font-mono font-bold tabular-nums ${
                        splitRemainingMinor === 0 ? "text-[var(--income)]" : "text-amber-500"
                      }`}
                    >
                      {splitRemainingMinor === 0
                        ? "Balanced (0.00)"
                        : `LKR ${(Math.abs(splitRemainingMinor) / 100).toFixed(2)} remaining`}
                    </span>
                  </div>

                  {splitItems.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        data-testid={`split-category-${idx}`}
                        value={item.categoryId}
                        onChange={(e) => handleUpdateSplitItem(idx, { categoryId: e.target.value })}
                        className="col-span-6 h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-xs"
                      >
                        {(["EXPENSE", "INCOME"] as const).map((g) => {
                          const items =
                            g === "EXPENSE" ? categoryGroups.expense : categoryGroups.income;
                          if (items.length === 0) return null;
                          return (
                            <optgroup key={g} label={g === "EXPENSE" ? "Expense" : "Income"}>
                              {items.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>

                      <input
                        type="text"
                        inputMode="decimal"
                        data-testid={`split-amount-${idx}`}
                        value={splitAmountStrings[idx] ?? ""}
                        onChange={(e) => handleSplitAmountChange(idx, e.target.value)}
                        onBlur={() => {
                          const minor = splitItems[idx]?.amountMinor || 0;
                          setSplitAmountStrings((prev) =>
                            prev.map((val, i) => (i === idx ? (minor / 100).toFixed(2) : val))
                          );
                        }}
                        className="col-span-5 h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-mono text-xs tabular-nums text-right"
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveSplitItem(idx)}
                        disabled={splitItems.length <= 1}
                        className="col-span-1 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--expense)] disabled:opacity-20 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    data-testid="add-split-item-btn"
                    onClick={handleAddSplitItem}
                    className="w-full h-10 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add Split Item</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Exclude from Budget Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-2">
              <Ban size={15} className="text-[var(--text-muted)]" />
              <span>Exclude from budget calculations</span>
            </span>
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
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-xs text-[var(--expense)] font-semibold">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Convert to 0% Installment Option */}
          {isCardExpense && (
            <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
              {!showConvertForm ? (
                <button
                  type="button"
                  data-testid="convert-to-installment-btn"
                  onClick={() => setShowConvertForm(true)}
                  className="w-full h-11 px-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] font-bold text-xs hover:bg-[var(--accent)]/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Convert to 0% Installment
                </button>
              ) : (
                <div
                  data-testid="convert-section"
                  className="p-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/6 space-y-3"
                >
                  <div className="font-bold text-xs text-[var(--text)]">
                    Convert to 0% Installment Plan
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-muted)] block">
                      Tenure
                    </label>
                    <select
                      data-testid="convert-tenure-select"
                      value={convertTenure}
                      onChange={(e) => setConvertTenure(Number(e.target.value))}
                      className="w-full h-11 px-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)]"
                    >
                      {[3, 6, 12, 18, 24, 36].map((m) => (
                        <option key={m} value={m}>
                          {m} Months ({formatMoney(Math.floor(transaction.amountMinor / m))}/mo)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      data-testid="confirm-convert-btn"
                      onClick={handleConvertConfirm}
                      className="flex-1 h-10 px-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      Confirm Conversion
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConvertForm(false)}
                      className="h-10 px-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSystemInstallment && (
            <div
              data-testid="cannot-delete-installment-msg"
              className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs"
            >
              System-generated installment rows cannot be deleted manually.
            </div>
          )}

          {hasActiveReversal && (
            <div
              data-testid="delete-blocked-msg"
              className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs"
            >
              Cannot delete transaction: an active reversal exists.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3 pb-sheet-safe shrink-0">
          {showConfirmDelete ? (
            <div className="flex items-center gap-2.5 w-full">
              <button
                type="button"
                data-testid="confirm-delete-btn"
                onClick={handleDelete}
                className="flex-1 h-12 px-4 rounded-2xl bg-[var(--expense)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                data-testid="cancel-delete-btn"
                onClick={() => setShowConfirmDelete(false)}
                className="h-12 px-5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {!isSystemInstallment && (
                <button
                  type="button"
                  data-testid="transaction-delete-btn"
                  disabled={hasActiveReversal || isSystemInstallment}
                  onClick={() => setShowConfirmDelete(true)}
                  className="w-12 h-12 rounded-2xl border border-[var(--expense)]/25 bg-[var(--expense)]/8 flex items-center justify-center text-[var(--expense)] hover:bg-[var(--expense)]/15 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer shrink-0"
                  title="Delete transaction"
                >
                  <Trash2 size={17} />
                </button>
              )}

              <button
                type="button"
                data-testid="transaction-save-btn"
                disabled={isSplitMismatch}
                onClick={handleSave}
                className="flex-1 h-12 px-5 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

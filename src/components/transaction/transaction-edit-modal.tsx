"use client";

import { groupCategoriesByType } from "@/lib/categories-data";
import React, { useState, useMemo } from "react";
import { X, Trash2, Split, Plus, AlertCircle, Ban } from "lucide-react";
import { useAccounts, useCategories, useTransactions, useSync } from "@/components/sync-provider";
import { localUpdateTransaction, localDeleteTransaction, localCreateInstallmentPlan } from "@/lib/sync/client";
import { LocalTransaction, LocalSplitItem } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
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
  const { db } = useSync();
  const accounts = useAccounts();
  const categories = useCategories();
  const categoryGroups = useMemo(() => groupCategoriesByType(categories), [categories]);
  const transactions = useTransactions();

  const [amountStr, setAmountStr] = useState(
    (transaction.amountMinor / 100).toFixed(2)
  );
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [toAccountId, setToAccountId] = useState(transaction.toAccountId || "");
  const [destinationAmountStr, setDestinationAmountStr] = useState(
    transaction.destinationAmountMinor ? (transaction.destinationAmountMinor / 100).toFixed(2) : "",
  );
  const [exchangeRateStr, setExchangeRateStr] = useState(
    transaction.exchangeRateMicros ? rateMicrosToNumber(transaction.exchangeRateMicros).toFixed(6) : "",
  );
  const [categoryId, setCategoryId] = useState(transaction.categoryId || "");
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10));
  const [note, setNote] = useState(transaction.note || "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    transaction.excludeFromBudget
  );

  // Split state
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
  const targetAccount = useMemo(() => accounts.find((a) => a.id === transaction.accountId), [accounts, transaction.accountId]);
  const selectedSourceAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const selectedDestinationAccount = useMemo(() => accounts.find((a) => a.id === toAccountId), [accounts, toAccountId]);
  const isUsdToLkrTransfer =
    transaction.type === "TRANSFER" &&
    selectedSourceAccount?.currency === "USD" &&
    selectedDestinationAccount?.currency === "LKR";
  const isCardExpense = targetAccount?.type === "CREDIT_CARD" && transaction.type === "EXPENSE" && transaction.subType !== "CC_INSTALLMENT" && !transaction.excludeFromBalance;
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

  // Check if active reversal exists
  const hasActiveReversal = useMemo(() => {
    return transactions.some(
      (t) => !t.deletedAt && t.reversalOfTransactionId === transaction.id
    );
  }, [transactions, transaction.id]);

  const targetAmountMinor = useMemo(() => {
    return parseMoneyToMinor(amountStr);
  }, [amountStr]);

  // Split calculation
  const splitSumMinor = useMemo(() => {
    return splitItems.reduce((sum, item) => sum + (item.amountMinor || 0), 0);
  }, [splitItems]);

  const splitRemainingMinor = targetAmountMinor - splitSumMinor;
  const isSplitMismatch = isSplit && splitRemainingMinor !== 0;

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
  };

  const handleRemoveSplitItem = (idx: number) => {
    setSplitItems((prev) => prev.filter((_, i) => i !== idx));
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
          exchangeRateMicros = calculateExchangeRateMicros(targetAmountMinor, destinationAmountMinor);
        }
      }
      await localUpdateTransaction(db, transaction.id, {
        amountMinor: targetAmountMinor,
        accountId,
        toAccountId: transaction.type === "TRANSFER" ? toAccountId : null,
        destinationAmountMinor: isUsdToLkrTransfer
          ? destinationAmountMinor
          : transaction.destinationAmountMinor ?? null,
        exchangeRateMicros: isUsdToLkrTransfer
          ? exchangeRateMicros
          : transaction.exchangeRateMicros ?? null,
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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 select-none overflow-y-auto"
    >
      <div
        data-testid="transaction-edit-modal"
        className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-2xl md:rounded-xl shadow-2xl flex flex-col modal-sheet-dialog overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[var(--text)]">Edit Transaction</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)] font-mono uppercase">
              {transaction.type}
            </span>
          </div>
          <button
            type="button"
            data-testid="transaction-edit-close"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 text-xs">
          {/* Amount input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">
              Amount ({selectedSourceAccount?.currency || "LKR"})
            </label>
            <input
              type="text"
              data-testid="transaction-edit-amount"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono text-base font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>

          {/* Account select */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Account</label>
            <select
              data-testid="transaction-edit-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Transfer Destination Account */}
          {transaction.type === "TRANSFER" && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">To Account</label>
              <select
                data-testid="transaction-edit-to-account"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
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
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Final LKR amount</span>
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
                        ? (calculateExchangeRateMicros(targetAmountMinor, destinationMinor) / 1_000_000).toFixed(6)
                        : "",
                    );
                  }}
                  className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Rate (LKR / USD)</span>
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={exchangeRateStr}
                  onChange={(e) => {
                    setExchangeRateStr(e.target.value);
                    setDestinationAmountStr("");
                  }}
                  className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                />
              </label>
            </div>
          )}

          {/* Date input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Date</label>
            <input
              type="date"
              data-testid="transaction-edit-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>

          {/* Note input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Note</label>
            <input
              type="text"
              data-testid="transaction-edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add note..."
              className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>

          {/* Category Picker (if not split and not transfer) */}
          {transaction.type !== "TRANSFER" && !isSplit && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Category</label>
              <select
                data-testid="transaction-edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                {(["EXPENSE", "INCOME"] as const).map((g) => {
                  const items = g === "EXPENSE" ? categoryGroups.expense : categoryGroups.income;
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={g} label={g === "EXPENSE" ? "Expense" : "Income"}>
                      {items.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}

          {/* Split Transaction Section */}
          {transaction.type !== "TRANSFER" && (
            <div className="pt-2 border-t border-hairline space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs flex items-center gap-1.5 text-[var(--text)]">
                  <Split size={14} />
                  <span>Split into multiple categories</span>
                </span>
                <button
                  type="button"
                  data-testid="split-toggle"
                  onClick={() => setIsSplit(!isSplit)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    isSplit ? "bg-[var(--text)]" : "bg-[var(--border)]"
                  }`}
                >
                  <span
                    className={`block w-3.5 h-3.5 rounded-full bg-[var(--bg)] transition-transform absolute top-0.5 ${
                      isSplit ? "left-4.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {isSplit && (
                <div className="p-2.5 rounded bg-[var(--bg)] border border-hairline space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">Split breakdown</span>
                    <span
                      data-testid="split-remaining"
                      className={`font-mono font-semibold tabular-nums ${
                        splitRemainingMinor === 0
                          ? "text-income"
                          : "text-amber-500 font-bold"
                      }`}
                    >
                      {splitRemainingMinor === 0
                        ? "Balanced (0.00)"
                        : `LKR ${(Math.abs(splitRemainingMinor) / 100).toFixed(2)} remaining`}
                    </span>
                  </div>

                  {splitItems.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-12 gap-1.5 items-center">
                      <select
                        data-testid={`split-category-${idx}`}
                        value={item.categoryId}
                        onChange={(e) => handleUpdateSplitItem(idx, { categoryId: e.target.value })}
                        className="col-span-6 px-2 py-1.5 rounded border border-hairline bg-[var(--surface)] text-[var(--text)] text-[11px]"
                      >
                        {(["EXPENSE", "INCOME"] as const).map((g) => {
                          const items = g === "EXPENSE" ? categoryGroups.expense : categoryGroups.income;
                          if (items.length === 0) return null;
                          return (
                            <optgroup key={g} label={g === "EXPENSE" ? "Expense" : "Income"}>
                              {items.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>

                      <input
                        type="text"
                        data-testid={`split-amount-${idx}`}
                        value={(item.amountMinor / 100).toFixed(2)}
                        onChange={(e) =>
                          handleUpdateSplitItem(idx, {
                            amountMinor: parseMoneyToMinor(e.target.value),
                          })
                        }
                        className="col-span-5 px-2 py-1.5 rounded border border-hairline bg-[var(--surface)] text-[var(--text)] font-mono text-[11px] tabular-nums text-right"
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveSplitItem(idx)}
                        disabled={splitItems.length <= 1}
                        className="col-span-1 p-1 text-[var(--text-muted)] hover:text-red-500 disabled:opacity-20"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    data-testid="add-split-item-btn"
                    onClick={handleAddSplitItem}
                    className="w-full py-1 rounded border border-dashed border-hairline text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center gap-1 font-medium"
                  >
                    <Plus size={12} />
                    <span>Add Split Item</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Exclude from Budget Toggle */}
          <div className="flex items-center justify-between py-1 border-t border-hairline">
            <span className="text-xs text-[var(--text)] flex items-center gap-1.5">
              <Ban size={14} className="text-[var(--text-muted)]" />
              <span>Exclude from budget calculations</span>
            </span>
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

          {/* Inline Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium py-1">
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Convert to 0% Installment Option */}
          {isCardExpense && (
            <div className="pt-2 border-t border-hairline space-y-2">
              {!showConvertForm ? (
                <button
                  type="button"
                  data-testid="convert-to-installment-btn"
                  onClick={() => setShowConvertForm(true)}
                  className="w-full py-1.5 px-3 rounded border border-purple-500/30 bg-purple-500/10 text-purple-600 font-semibold text-xs hover:bg-purple-500/20 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                >
                  Convert to 0% Installment
                </button>
              ) : (
                <div
                  data-testid="convert-section"
                  className="p-3 rounded border border-purple-500/30 bg-purple-500/5 space-y-2.5"
                >
                  <div className="font-semibold text-xs text-[var(--text)]">Convert to 0% Installment Plan</div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-muted)]">Tenure</label>
                    <select
                      data-testid="convert-tenure-select"
                      value={convertTenure}
                      onChange={(e) => setConvertTenure(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded border border-hairline bg-[var(--bg)] text-xs"
                    >
                      <option value={3}>3 Months ({formatMoney(Math.floor(transaction.amountMinor / 3))}/mo)</option>
                      <option value={6}>6 Months ({formatMoney(Math.floor(transaction.amountMinor / 6))}/mo)</option>
                      <option value={12}>12 Months ({formatMoney(Math.floor(transaction.amountMinor / 12))}/mo)</option>
                      <option value={18}>18 Months ({formatMoney(Math.floor(transaction.amountMinor / 18))}/mo)</option>
                      <option value={24}>24 Months ({formatMoney(Math.floor(transaction.amountMinor / 24))}/mo)</option>
                      <option value={36}>36 Months ({formatMoney(Math.floor(transaction.amountMinor / 36))}/mo)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="confirm-convert-btn"
                      onClick={handleConvertConfirm}
                      className="flex-1 py-1.5 px-3 rounded bg-purple-600 text-white font-semibold text-xs hover:bg-purple-700 active:scale-98 transition-all"
                    >
                      Confirm Conversion
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConvertForm(false)}
                      className="py-1.5 px-3 rounded border border-hairline text-xs hover:bg-[var(--border)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Blocking message if system installment */}
          {isSystemInstallment && (
            <div
              data-testid="cannot-delete-installment-msg"
              className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[11px]"
            >
              System-generated installment rows cannot be deleted manually.
            </div>
          )}

          {/* Blocking message if reversal exists */}
          {hasActiveReversal && (
            <div
              data-testid="delete-blocked-msg"
              className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[11px]"
            >
              Cannot delete transaction: an active reversal exists.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-hairline bg-[var(--surface)] flex items-center justify-between gap-2 pb-sheet-safe shrink-0">
          {showConfirmDelete ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                data-testid="confirm-delete-btn"
                onClick={handleDelete}
                className="flex-1 py-2 px-3 rounded bg-red-600 text-white font-semibold text-xs hover:bg-red-700 active:scale-98 transition-all"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                data-testid="cancel-delete-btn"
                onClick={() => setShowConfirmDelete(false)}
                className="py-2 px-3 rounded border border-hairline text-xs hover:bg-[var(--border)] transition-colors"
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
                  className="p-2 rounded text-red-500 hover:bg-red-500/10 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                  title="Delete transaction"
                >
                  <Trash2 size={16} />
                </button>
              )}

              <button
                type="button"
                data-testid="transaction-save-btn"
                disabled={isSplitMismatch}
                onClick={handleSave}
                className="flex-1 py-2 px-4 rounded bg-[var(--text)] text-[var(--bg)] font-semibold text-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none"
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

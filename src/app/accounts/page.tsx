"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Wallet, Plus, CreditCard, Building2, Banknote, Edit2, Archive, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccounts, useTransactions, useSync, SyncIndicator } from "@/components/sync-provider";
import { localCreateAccount, localUpdateAccount, localDeleteAccount } from "@/lib/sync/client";
import { LocalAccount } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { calculateLedgerBalance, LedgerTransaction } from "@/lib/finance-core/ledger";

export default function AccountsPage() {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const { db } = useSync();

  const [showArchived, setShowArchived] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LocalAccount | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [type, setType] = useState<"CASH" | "BANK_SAVINGS" | "CREDIT_CARD">("CASH");
  const [openingBalanceStr, setOpeningBalanceStr] = useState("0.00");
  const [accountNumberLast4, setAccountNumberLast4] = useState("");
  const [bankSender, setBankSender] = useState("");
  const [creditLimitStr, setCreditLimitStr] = useState("");
  const [cutoffDay, setCutoffDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ledger-derived balances for each account
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    const ledgerTxList: LedgerTransaction[] = transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      amountMinor: t.amountMinor,
      type: t.type,
      direction: t.direction,
      transactionDate: t.transactionDate,
      excludeFromBalance: t.excludeFromBalance,
      deletedAt: t.deletedAt,
    }));

    for (const acc of accounts) {
      balances[acc.id] = calculateLedgerBalance(
        {
          id: acc.id,
          type: acc.type,
          openingBalanceMinor: acc.openingBalanceMinor,
        },
        ledgerTxList
      );
    }
    return balances;
  }, [accounts, transactions]);

  // Filtered accounts
  const visibleAccounts = useMemo(() => {
    return accounts.filter((a) => (showArchived ? true : !a.isArchived));
  }, [accounts, showArchived]);

  // Grouped accounts
  const cashAccounts = useMemo(() => visibleAccounts.filter((a) => a.type === "CASH"), [visibleAccounts]);
  const bankAccounts = useMemo(() => visibleAccounts.filter((a) => a.type === "BANK_SAVINGS"), [visibleAccounts]);
  const creditAccounts = useMemo(() => visibleAccounts.filter((a) => a.type === "CREDIT_CARD"), [visibleAccounts]);

  // Group Subtotals
  const cashSubtotal = useMemo(
    () => cashAccounts.reduce((sum, a) => sum + (accountBalances[a.id] ?? a.openingBalanceMinor), 0),
    [cashAccounts, accountBalances]
  );
  const bankSubtotal = useMemo(
    () => bankAccounts.reduce((sum, a) => sum + (accountBalances[a.id] ?? a.openingBalanceMinor), 0),
    [bankAccounts, accountBalances]
  );
  const creditSubtotal = useMemo(
    () => creditAccounts.reduce((sum, a) => sum + (accountBalances[a.id] ?? a.openingBalanceMinor), 0),
    [creditAccounts, accountBalances]
  );

  // Net Worth Totals
  const { assetsTotal, liabilitiesTotal, netWorthTotal } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;

    for (const acc of visibleAccounts) {
      const bal = accountBalances[acc.id] ?? acc.openingBalanceMinor;
      if (acc.type === "CREDIT_CARD") {
        if (bal < 0) {
          liabilities += Math.abs(bal);
        } else {
          assets += bal;
        }
      } else {
        if (bal >= 0) {
          assets += bal;
        } else {
          liabilities += Math.abs(bal);
        }
      }
    }

    return {
      assetsTotal: assets,
      liabilitiesTotal: liabilities,
      netWorthTotal: assets - liabilities,
    };
  }, [visibleAccounts, accountBalances]);

  const openCreateForm = () => {
    setEditingAccount(null);
    setName("");
    setType("CASH");
    setOpeningBalanceStr("0.00");
    setAccountNumberLast4("");
    setBankSender("");
    setCreditLimitStr("");
    setCutoffDay("");
    setDueDay("");
    setSettlementAccountId("");
    setErrors({});
    setIsFormOpen(true);
  };

  const openEditForm = (acc: LocalAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setOpeningBalanceStr((acc.openingBalanceMinor / 100).toFixed(2));
    setAccountNumberLast4(acc.accountNumberLast4 || "");
    setBankSender(acc.bankSenderIds?.[0] || "");
    setCreditLimitStr(acc.creditLimitMinor ? (acc.creditLimitMinor / 100).toFixed(2) : "");
    setCutoffDay(acc.statementCutoffDay ? String(acc.statementCutoffDay) : "");
    setDueDay(acc.paymentDueDay ? String(acc.paymentDueDay) : "");
    setSettlementAccountId(acc.linkedSettlementAccountId || "");
    setErrors({});
    setIsFormOpen(true);
  };

  const handleArchiveToggle = async (acc: LocalAccount) => {
    await localUpdateAccount(db, acc.id, { isArchived: !acc.isArchived });
  };

  const handleDelete = async (acc: LocalAccount) => {
    await localDeleteAccount(db, acc.id);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Account name is required";
    }

    let cutoffNum: number | null = null;
    let dueNum: number | null = null;
    let limitMinor: number | null = null;

    if (type === "CREDIT_CARD") {
      if (!creditLimitStr.trim()) {
        newErrors.creditLimit = "Credit limit is required for credit cards";
      } else {
        limitMinor = parseMoneyToMinor(creditLimitStr);
        if (limitMinor <= 0) {
          newErrors.creditLimit = "Credit limit must be greater than zero";
        }
      }

      cutoffNum = parseInt(cutoffDay, 10);
      if (isNaN(cutoffNum) || cutoffNum < 1 || cutoffNum > 31) {
        newErrors.cutoffDay = "Cutoff day must be between 1 and 31";
      }

      dueNum = parseInt(dueDay, 10);
      if (isNaN(dueNum) || dueNum < 1 || dueNum > 31) {
        newErrors.dueDay = "Due day must be between 1 and 31";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const openingMinor = parseMoneyToMinor(openingBalanceStr);
    const bankSenderIds = bankSender.trim() ? [bankSender.trim()] : [];

    if (editingAccount) {
      await localUpdateAccount(db, editingAccount.id, {
        name: name.trim(),
        type,
        openingBalanceMinor: openingMinor,
        accountNumberLast4: accountNumberLast4.trim() || null,
        bankSenderIds,
        creditLimitMinor: limitMinor,
        statementCutoffDay: cutoffNum,
        paymentDueDay: dueNum,
        linkedSettlementAccountId: settlementAccountId || null,
      });
    } else {
      await localCreateAccount(db, {
        userId: "current-user",
        name: name.trim(),
        type,
        openingBalanceMinor: openingMinor,
        currency: "LKR",
        accountNumberLast4: accountNumberLast4.trim() || null,
        bankSenderIds,
        accessScope: "PRIVATE",
        creditLimitMinor: limitMinor,
        statementCutoffDay: cutoffNum,
        paymentDueDay: dueNum,
        linkedSettlementAccountId: settlementAccountId || null,
        isArchived: false,
      });
    }

    setIsFormOpen(false);
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header & Controls */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">Accounts</h1>
          <div className="mobile-only">
            <SyncIndicator isMobile={true} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="show-archived-checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-hairline"
            />
            <span>Show archived</span>
          </label>

          <button
            type="button"
            data-testid="add-account-btn"
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--text)] text-[var(--bg)] hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Net Worth Summary Header */}
      <div
        data-testid="net-worth-header"
        className="grid grid-cols-3 divide-x divide-hairline border border-hairline flat-card py-3 text-center text-xs"
      >
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Assets</span>
          <p data-testid="net-worth-assets" className="text-income font-semibold tabular-nums mt-0.5">
            {formatMoney(assetsTotal)}
          </p>
        </div>
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Liabilities</span>
          <p data-testid="net-worth-liabilities" className="text-expense font-semibold tabular-nums mt-0.5">
            {formatMoney(liabilitiesTotal)}
          </p>
        </div>
        <div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Net Worth</span>
          <p data-testid="net-worth-total" className="text-[var(--text)] font-semibold tabular-nums mt-0.5">
            {formatMoney(netWorthTotal)}
          </p>
        </div>
      </div>

      {/* Account Groups */}
      {visibleAccounts.length === 0 ? (
        <EmptyState
          title="No accounts created"
          description="Add cash, bank accounts, or credit cards to begin tracking balances and net worth."
          icon={<Wallet size={24} />}
        />
      ) : (
        <div className="space-y-4">
          {/* Cash Group */}
          {cashAccounts.length > 0 && (
            <section data-testid="group-cash" className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-1.5">
                  <Banknote size={14} />
                  <span>Cash</span>
                </span>
                <span data-testid="subtotal-cash" className="tabular-nums font-semibold text-[var(--text)]">
                  {formatMoney(cashSubtotal)}
                </span>
              </div>
              <div className="grid gap-2">
                {cashAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    onEdit={() => openEditForm(acc)}
                    onArchive={() => handleArchiveToggle(acc)}
                    onDelete={() => handleDelete(acc)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Bank Accounts Group */}
          {bankAccounts.length > 0 && (
            <section data-testid="group-bank" className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} />
                  <span>Bank accounts</span>
                </span>
                <span data-testid="subtotal-bank" className="tabular-nums font-semibold text-[var(--text)]">
                  {formatMoney(bankSubtotal)}
                </span>
              </div>
              <div className="grid gap-2">
                {bankAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    onEdit={() => openEditForm(acc)}
                    onArchive={() => handleArchiveToggle(acc)}
                    onDelete={() => handleDelete(acc)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Credit Cards Group */}
          {creditAccounts.length > 0 && (
            <section data-testid="group-credit" className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-1.5">
                  <CreditCard size={14} />
                  <span>Credit Cards</span>
                </span>
                <span data-testid="subtotal-credit" className="tabular-nums font-semibold text-[var(--text)]">
                  {formatMoney(creditSubtotal)}
                </span>
              </div>
              <div className="grid gap-2">
                {creditAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    onEdit={() => openEditForm(acc)}
                    onArchive={() => handleArchiveToggle(acc)}
                    onDelete={() => handleDelete(acc)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Account Creation & Edit Modal / Drawer */}
      {isFormOpen && (
        <div
          data-testid="account-form-modal"
          className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs"
        >
          <div
            data-testid="account-dialog"
            className="w-full md:max-w-md bg-[var(--surface)] border border-hairline rounded-t-xl md:rounded-lg shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div data-testid="account-drawer" className="contents">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  {editingAccount ? "Edit Account" : "Add Account"}
                </h2>
                <button
                  type="button"
                  data-testid="account-cancel"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} noValidate className="space-y-3 text-xs">
                {/* Name */}
                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-muted)]">Account Name</label>
                  <input
                    type="text"
                    data-testid="account-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Wallet, ComBank Savings, Apex Visa"
                    className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                  />
                  {errors.name && (
                    <p data-testid="error-account-name" className="text-red-500 text-[11px]">
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-muted)]">Account Type</label>
                  <select
                    data-testid="account-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as "CASH" | "BANK_SAVINGS" | "CREDIT_CARD")}
                    className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_SAVINGS">Bank Savings</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                  </select>
                </div>

                {/* Opening Balance */}
                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-muted)]">
                    {type === "CREDIT_CARD" ? "Opening Balance / Debt (≤ 0)" : "Opening Balance"}
                  </label>
                  <input
                    type="text"
                    data-testid="account-opening-balance"
                    value={openingBalanceStr}
                    onChange={(e) => setOpeningBalanceStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                  />
                </div>

                {/* Bank / Credit Card Metadata */}
                {type !== "CASH" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-medium text-[var(--text-muted)]">Last 4 Digits</label>
                      <input
                        type="text"
                        maxLength={4}
                        data-testid="account-number-last4"
                        value={accountNumberLast4}
                        onChange={(e) => setAccountNumberLast4(e.target.value)}
                        placeholder="1234"
                        className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium text-[var(--text-muted)]">Bank Sender ID</label>
                      <input
                        type="text"
                        data-testid="account-bank-sender"
                        value={bankSender}
                        onChange={(e) => setBankSender(e.target.value)}
                        placeholder="COMBANK"
                        className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] uppercase focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                      />
                    </div>
                  </div>
                )}

                {/* Credit Card Specific Fields */}
                {type === "CREDIT_CARD" && (
                  <div className="space-y-3 pt-2 border-t border-hairline">
                    <div className="space-y-1">
                      <label className="font-medium text-[var(--text-muted)]">Credit Limit</label>
                      <input
                        type="text"
                        data-testid="account-credit-limit"
                        value={creditLimitStr}
                        onChange={(e) => setCreditLimitStr(e.target.value)}
                        placeholder="e.g. 500000.00"
                        className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                      />
                      {errors.creditLimit && (
                        <p data-testid="error-credit-limit" className="text-red-500 text-[11px]">
                          {errors.creditLimit}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="font-medium text-[var(--text-muted)]">Cutoff Day (1-31)</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          data-testid="account-cutoff-day"
                          value={cutoffDay}
                          onChange={(e) => setCutoffDay(e.target.value)}
                          placeholder="20"
                          className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                        />
                        {errors.cutoffDay && (
                          <p data-testid="error-cutoff-day" className="text-red-500 text-[11px]">
                            {errors.cutoffDay}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="font-medium text-[var(--text-muted)]">Due Day (1-31)</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          data-testid="account-due-day"
                          value={dueDay}
                          onChange={(e) => setDueDay(e.target.value)}
                          placeholder="10"
                          className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                        />
                        {errors.dueDay && (
                          <p data-testid="error-due-day" className="text-red-500 text-[11px]">
                            {errors.dueDay}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-medium text-[var(--text-muted)]">Linked Settlement Account</label>
                      <select
                        data-testid="account-settlement-id"
                        value={settlementAccountId}
                        onChange={(e) => setSettlementAccountId(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                      >
                        <option value="">None</option>
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    data-testid="account-submit"
                    className="w-full py-2.5 rounded bg-[var(--text)] text-[var(--bg)] font-medium hover:opacity-90 transition-opacity"
                  >
                    {editingAccount ? "Save Changes" : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AccountCard({
  account,
  balance,
  onEdit,
  onArchive,
  onDelete,
}: {
  account: LocalAccount;
  balance: number;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-testid={`account-item-${account.id}`}
      className={`flex items-center justify-between p-3 rounded border border-hairline flat-card transition-colors ${
        account.isArchived ? "opacity-60 bg-[var(--border)]" : ""
      }`}
    >
      <Link
        href={`/accounts/${account.id}`}
        data-testid="account-detail-link"
        className="space-y-0.5 min-w-0 flex-1 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span data-testid="account-card-name" className="text-xs font-semibold text-[var(--text)] truncate">
            {account.name}
          </span>
          {account.isArchived && (
            <span className="text-[10px] px-1 rounded bg-[var(--border)] text-[var(--text-muted)]">Archived</span>
          )}
        </div>
        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
          {account.accountNumberLast4 && <span>•••• {account.accountNumberLast4}</span>}
          {account.bankSenderIds?.[0] && <span>{account.bankSenderIds[0]}</span>}
          {account.type === "CREDIT_CARD" && (
            <>
              {account.creditLimitMinor && <span>Limit: {formatMoney(account.creditLimitMinor)}</span>}
              {account.statementCutoffDay && <span>Cutoff: Day {account.statementCutoffDay}</span>}
              {account.paymentDueDay && <span>Due: Day {account.paymentDueDay}</span>}
            </>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-3 shrink-0">
        {account.type === "CREDIT_CARD" && balance < 0 ? (
          <div className="text-right">
            <div data-testid="card-outstanding" className="font-semibold text-xs tabular-nums text-expense">
              Outstanding {formatMoney(Math.abs(balance))}
            </div>
            <div data-testid="account-card-balance" className="text-[10px] text-[var(--text-muted)] tabular-nums">
              {formatMoney(balance)}
            </div>
          </div>
        ) : (
          <span
            data-testid="account-card-balance"
            className={`font-semibold text-xs tabular-nums ${
              balance < 0 ? "text-expense" : balance > 0 ? "text-income" : "text-[var(--text)]"
            }`}
          >
            {formatMoney(balance)}
          </span>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="account-edit-btn"
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            data-testid="account-archive-btn"
            onClick={onArchive}
            title={account.isArchived ? "Unarchive" : "Archive"}
            className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <Archive size={13} />
          </button>
          <button
            type="button"
            data-testid="account-delete-btn"
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

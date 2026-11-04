"use client";

import React, { memo, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  Wallet,
  Plus,
  CreditCard,
  Building2,
  Banknote,
  Edit2,
  Archive,
  Trash2,
  X,
  AlertTriangle,
  PiggyBank,
  Landmark,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  localCreateAccount,
  localUpdateAccount,
  localDeleteAccount,
  localUpdateTransaction,
  localDeleteInstallmentPlan,
  localUpdateFixedDeposit,
} from "@/lib/sync/client";
import {
  LocalAccount,
  LocalInstallmentPlan,
  LocalFixedDeposit,
  LocalLoan,
} from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { LedgerTransaction } from "@/lib/finance-core/ledger";
import { calculateStatementCycle } from "@/lib/finance-core/credit-card";
import {
  calculateMonthlyPayout,
  calculateCompoundMaturity,
} from "@/lib/finance-core/investments";
import { SettleModal } from "@/components/account/settle-modal";
import { InstallmentPlanModal } from "@/components/account/installment-plan-modal";
import { EarlyPayoffModal } from "@/components/account/early-payoff-modal";
import { FixedDepositModal } from "@/components/account/fixed-deposit-modal";
import { FdCloseModal } from "@/components/account/fd-close-modal";
import { LoanModal } from "@/components/account/loan-modal";
import { LoanDetailModal } from "@/components/account/loan-detail-modal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useAccountPortfolio } from "@/hooks/use-account-portfolio";
import { useModalHistory } from "@/hooks/use-modal-history";

export default function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "cash_bank" | "liabilities" | "investments"
  >("cash_bank");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LocalAccount | null>(
    null
  );

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingAccount(null);
  }, []);

  useModalHistory(isFormOpen, closeForm, "account-form");
  const [settlingCard, setSettlingCard] = useState<LocalAccount | null>(null);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [editingInstallmentPlan, setEditingInstallmentPlan] =
    useState<LocalInstallmentPlan | null>(null);
  const [payoffPlan, setPayoffPlan] = useState<LocalInstallmentPlan | null>(
    null
  );
  const [payoffRemainingMinor, setPayoffRemainingMinor] = useState(0);

  const [isFdModalOpen, setIsFdModalOpen] = useState(false);
  const [editingFd, setEditingFd] = useState<LocalFixedDeposit | null>(null);
  const [closeFd, setCloseFd] = useState<LocalFixedDeposit | null>(null);

  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LocalLoan | null>(null);
  const portfolio = useAccountPortfolio(showArchived, settlingCard);
  const {
    accounts,
    installmentPlans,
    fixedDeposits,
    loans,
    db,
    sync,
    ledgerTxList,
    planProgressMap,
    accountBlockedPrincipalMap,
    totalBlockedPrincipal,
    accountBalances,
    visibleAccounts,
    cashAccounts,
    bankAccounts,
    creditAccounts,
    cashSubtotal,
    bankSubtotalByCurrency,
    creditSubtotal,
    fixedDepositsSubtotal,
    loanRemainingMap,
    loansSubtotal,
    assetsByCurrency,
    liabilitiesByCurrency,
    settlingCardCycle,
    householdRoleMap,
    activeHouseholdId,
  } = portfolio;

  const [name, setName] = useState("");
  const [type, setType] = useState<"CASH" | "BANK_SAVINGS" | "CREDIT_CARD">(
    "CASH"
  );
  const [currency, setCurrency] = useState<"LKR" | "USD">("LKR");
  const [openingBalanceStr, setOpeningBalanceStr] = useState("0.00");
  const [accountNumberLast4, setAccountNumberLast4] = useState("");
  const [bankSender, setBankSender] = useState("");
  const [creditLimitStr, setCreditLimitStr] = useState("");
  const [cutoffDay, setCutoffDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [accessScope, setAccessScope] = useState<
    "PRIVATE" | "SHARED_HOUSEHOLD"
  >("PRIVATE");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDepositProceeds = async (fd: LocalFixedDeposit) => {
    const targetAccountId =
      fd.linkedPayoutAccountId ||
      fd.fundingAccountId ||
      visibleAccounts.find(
        (a) => a.type === "BANK_SAVINGS" || a.type === "CASH"
      )?.id;

    try {
      const response = await fetch(
        `/api/fixed-deposits/${fd.id}/deposit-proceeds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetAccountId }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to deposit fixed-deposit proceeds");
      }
      await localUpdateFixedDeposit(db, fd.id, {
        status: "CLOSED",
        closedAt: new Date().toISOString(),
      });
      await sync();
    } catch (error) {
      console.error("Failed to deposit fixed-deposit proceeds:", error);
    }
  };

  const openCreateForm = () => {
    setEditingAccount(null);
    setName("");
    setType("CASH");
    setCurrency("LKR");
    setAccessScope("PRIVATE");
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
    setCurrency(
      acc.currency === "USD" && acc.type === "BANK_SAVINGS" ? "USD" : "LKR"
    );
    setAccessScope(acc.accessScope || "PRIVATE");
    setOpeningBalanceStr((acc.openingBalanceMinor / 100).toFixed(2));
    setAccountNumberLast4(acc.accountNumberLast4 || "");
    setBankSender(acc.bankSenderIds?.[0] || "");
    setCreditLimitStr(
      acc.creditLimitMinor ? (acc.creditLimitMinor / 100).toFixed(2) : ""
    );
    setCutoffDay(
      acc.statementCutoffDay ? String(acc.statementCutoffDay) : ""
    );
    setDueDay(acc.paymentDueDay ? String(acc.paymentDueDay) : "");
    setSettlementAccountId(acc.linkedSettlementAccountId || "");
    setErrors({});
    setIsFormOpen(true);
  };

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "default";
    icon?: "trash" | "archive" | "alert";
    action: () => Promise<void>;
  } | null>(null);

  const handleArchiveToggle = (acc: LocalAccount) => {
    if (acc.isArchived) {
      setConfirmModal({
        title: "Unarchive Account",
        message: `Are you sure you want to unarchive "${acc.name}"? It will become active and visible in your accounts list.`,
        confirmText: "Unarchive",
        variant: "default",
        icon: "archive",
        action: async () => {
          await localUpdateAccount(db, acc.id, { isArchived: false });
        },
      });
    } else {
      setConfirmModal({
        title: "Archive Account",
        message: `Are you sure you want to archive "${acc.name}"? It will be hidden from your active list unless "Show archived" is enabled.`,
        confirmText: "Archive",
        variant: "warning",
        icon: "archive",
        action: async () => {
          await localUpdateAccount(db, acc.id, { isArchived: true });
        },
      });
    }
  };

  const handleDelete = (acc: LocalAccount) => {
    setConfirmModal({
      title: "Delete Account",
      message: `Are you sure you want to delete "${acc.name}"? This action cannot be undone and will permanently remove this account from your device.`,
      confirmText: "Delete",
      variant: "danger",
      icon: "trash",
      action: async () => {
        await localDeleteAccount(db, acc.id);
      },
    });
  };

  const handleCancelPlan = (plan: LocalInstallmentPlan) => {
    setConfirmModal({
      title: "Cancel Installment Plan",
      message: `Are you sure you want to cancel the installment plan for "${plan.merchantName}"? Remaining installments will be cancelled and the original transaction will be restored to your active ledger.`,
      confirmText: "Cancel Plan",
      variant: "danger",
      icon: "alert",
      action: async () => {
        if (plan.originalTransactionId) {
          await localUpdateTransaction(db, plan.originalTransactionId, {
            excludeFromBalance: false,
            excludeFromStats: false,
            installmentPlanId: null,
          });
        }
        await localDeleteInstallmentPlan(db, plan.id);
      },
    });
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
    const chosenHouseholdId =
      accessScope === "SHARED_HOUSEHOLD"
        ? editingAccount?.householdId || activeHouseholdId
        : null;

    if (editingAccount) {
      await localUpdateAccount(db, editingAccount.id, {
        name: name.trim(),
        type,
        currency: type === "BANK_SAVINGS" ? currency : "LKR",
        openingBalanceMinor: openingMinor,
        accountNumberLast4: accountNumberLast4.trim() || null,
        bankSenderIds,
        accessScope,
        householdId: chosenHouseholdId,
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
        currency: type === "BANK_SAVINGS" ? currency : "LKR",
        accountNumberLast4: accountNumberLast4.trim() || null,
        bankSenderIds,
        accessScope,
        householdId: chosenHouseholdId,
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Accounts"
        subtitle="Treasury & Portfolio"
        rightSlot={
          <button
            type="button"
            data-testid="add-account-btn"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-4 text-xs font-bold rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add Account</span>
          </button>
        }
      />

      {/* Executive Net Worth Summary Hero Card */}
      <div
        data-testid="net-worth-header"
        className="rounded-3xl bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#022C22] text-white p-6 space-y-5 shadow-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/15">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white/75">
              Total Net Worth
            </p>
            <div
              data-testid="net-worth-total"
              className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums mt-1"
            >
              <span className="block">
                {formatMoney(
                  assetsByCurrency.LKR - liabilitiesByCurrency.LKR,
                  "LKR"
                )}
              </span>
              {(assetsByCurrency.USD !== 0 ||
                liabilitiesByCurrency.USD !== 0) && (
                <span className="block text-sm text-emerald-200 mt-0.5">
                  {formatMoney(
                    assetsByCurrency.USD - liabilitiesByCurrency.USD,
                    "USD"
                  )}
                </span>
              )}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/12 text-xs font-semibold text-white cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="show-archived-checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-400 cursor-pointer"
            />
            <span>Show archived</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="rounded-2xl bg-white/10 p-4 space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-white/75">
              Total Assets
            </span>
            <div
              data-testid="net-worth-assets"
              className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-emerald-200"
            >
              <span className="block">
                {formatMoney(assetsByCurrency.LKR, "LKR")}
              </span>
              {assetsByCurrency.USD !== 0 && (
                <span className="block text-xs mt-0.5">
                  {formatMoney(assetsByCurrency.USD, "USD")}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-4 space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-white/75">
              Total Liabilities
            </span>
            <div
              data-testid="net-worth-liabilities"
              className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-rose-200"
            >
              <span className="block">
                {formatMoney(liabilitiesByCurrency.LKR, "LKR")}
              </span>
              {liabilitiesByCurrency.USD !== 0 && (
                <span className="block text-xs mt-0.5">
                  {formatMoney(liabilitiesByCurrency.USD, "USD")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Account Category Tabs */}
      <div
        data-testid="accounts-tab-bar"
        className="flex items-center gap-1.5 p-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-xs sm:text-sm font-semibold select-none"
      >
        <button
          type="button"
          data-testid="tab-cash-bank"
          onClick={() => setActiveTab("cash_bank")}
          className={`flex-1 py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer ${
            activeTab === "cash_bank"
              ? "bg-[var(--accent)] text-[var(--accent-fg)] font-bold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Cash &amp; Bank
        </button>
        <button
          type="button"
          data-testid="tab-liabilities"
          onClick={() => setActiveTab("liabilities")}
          className={`flex-1 py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer ${
            activeTab === "liabilities"
              ? "bg-[var(--accent)] text-[var(--accent-fg)] font-bold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Liabilities
        </button>
        <button
          type="button"
          data-testid="tab-investments"
          onClick={() => setActiveTab("investments")}
          className={`flex-1 py-2.5 px-2 rounded-xl text-center transition-all cursor-pointer ${
            activeTab === "investments"
              ? "bg-[var(--accent)] text-[var(--accent-fg)] font-bold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Investments
        </button>
      </div>

      {/* Account Groups */}
      <div className="space-y-6">
        {/* Tab 1: Cash & Bank Accounts */}
        <div
          className={`space-y-6 ${
            activeTab === "cash_bank" ? "block" : "hidden"
          }`}
        >
          {cashAccounts.length === 0 && bankAccounts.length === 0 && (
            <EmptyState
              title="No cash or bank accounts"
              description="Add cash or bank accounts to track your liquid money and transactions."
              icon={<Wallet size={26} />}
              actionLabel="Add Account"
              onAction={openCreateForm}
            />
          )}

          {/* Cash Group */}
          {cashAccounts.length > 0 && (
            <section data-testid="group-cash" className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-2">
                  <Banknote size={15} className="text-[var(--accent)]" />
                  <span>Cash Wallets</span>
                </span>
                <span
                  data-testid="subtotal-cash"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)]"
                >
                  {formatMoney(cashSubtotal)}
                </span>
              </div>
              <div className="grid gap-3">
                {cashAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    householdRoleMap={householdRoleMap}
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
            <section data-testid="group-bank" className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-2">
                  <Building2 size={15} className="text-[var(--accent)]" />
                  <span>Bank Accounts</span>
                </span>
                <span
                  data-testid="subtotal-bank"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)] text-right"
                >
                  <span className="block">
                    {formatMoney(bankSubtotalByCurrency.LKR, "LKR")}
                  </span>
                  {bankSubtotalByCurrency.USD !== 0 && (
                    <span className="block text-xs text-[var(--text-muted)]">
                      {formatMoney(bankSubtotalByCurrency.USD, "USD")}
                    </span>
                  )}
                </span>
              </div>
              <div className="grid gap-3">
                {bankAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    householdRoleMap={householdRoleMap}
                    onEdit={() => openEditForm(acc)}
                    onArchive={() => handleArchiveToggle(acc)}
                    onDelete={() => handleDelete(acc)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Tab 2: Liabilities (Credit Cards, Installments & Loans) */}
        <div
          className={`space-y-6 ${
            activeTab === "liabilities" ? "block" : "hidden"
          }`}
        >
          {creditAccounts.length === 0 &&
            installmentPlans.length === 0 &&
            loans.length === 0 && (
              <EmptyState
                title="No liabilities"
                description="Add credit cards, installment plans, or loans to track your debts and repayments."
                icon={<CreditCard size={26} />}
              />
            )}

          {/* Credit Cards Group */}
          {creditAccounts.length > 0 && (
            <section data-testid="group-credit" className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
                <span className="flex items-center gap-2">
                  <CreditCard size={15} className="text-expense" />
                  <span>Credit Cards</span>
                </span>
                <span
                  data-testid="subtotal-credit"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)]"
                >
                  {formatMoney(creditSubtotal)}
                </span>
              </div>
              <div className="grid gap-3.5">
                {creditAccounts.map((acc) => (
                  <CreditCardAccountCard
                    key={acc.id}
                    account={acc}
                    balance={accountBalances[acc.id] ?? acc.openingBalanceMinor}
                    blockedPrincipal={accountBlockedPrincipalMap[acc.id] || 0}
                    transactions={ledgerTxList}
                    householdRoleMap={householdRoleMap}
                    onEdit={() => openEditForm(acc)}
                    onArchive={() => handleArchiveToggle(acc)}
                    onDelete={() => handleDelete(acc)}
                    onSettle={() => setSettlingCard(acc)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 0% Installment Plans Group */}
          <section data-testid="group-installments" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
              <span className="flex items-center gap-2">
                <CreditCard size={15} className="text-[var(--accent)]" />
                <span>0% Installment Plans</span>
              </span>
              <div className="flex items-center gap-3">
                <span
                  data-testid="subtotal-installments"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)]"
                >
                  {formatMoney(totalBlockedPrincipal)}
                </span>
                <button
                  type="button"
                  data-testid="add-installment-plan-btn"
                  onClick={() => setIsInstallmentModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text)] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--text-muted)] transition-colors cursor-pointer normal-case tracking-normal"
                >
                  <Plus size={14} />
                  <span>Add Plan</span>
                </button>
              </div>
            </div>

            {installmentPlans.length === 0 ? (
              <div className="p-6 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 text-center text-sm text-[var(--text-muted)]">
                No installment plans active.
              </div>
            ) : (
              <div className="grid gap-3.5">
                {installmentPlans.map((plan) => {
                  const prog = planProgressMap.get(plan.id) || {
                    paidInstallments: plan.initialPaidInstallments || 0,
                    remainingInstallments: plan.tenureMonths,
                    remainingPrincipalMinor: plan.totalAmountMinor,
                  };
                  const account = accounts.find((a) => a.id === plan.accountId);
                  const percent = Math.min(
                    100,
                    Math.round(
                      (prog.paidInstallments / plan.tenureMonths) * 100
                    )
                  );

                  return (
                    <div
                      key={plan.id}
                      data-testid={`installment-plan-card-${plan.id}`}
                      className="p-4 sm:p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] space-y-4 shadow-2xs"
                    >
                      {/* Tier 1: Merchant Identity */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            data-testid="installment-merchant"
                            className="text-base font-bold text-[var(--text)] leading-snug"
                          >
                            {plan.merchantName}
                          </span>
                          {plan.status === "COMPLETED" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-2xs">
                              COMPLETED
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2">
                          {account && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] font-medium text-[var(--text)]">
                              {account.name}
                            </span>
                          )}
                          <span className="font-mono">
                            Total: {formatMoney(plan.totalAmountMinor)}
                          </span>
                        </div>
                      </div>

                      {/* Tier 2: 2-Column KPI Tiles */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Monthly Installment
                          </span>
                          <span
                            data-testid="installment-monthly-amount"
                            className="font-mono font-extrabold text-sm tabular-nums text-[var(--text)] block truncate"
                          >
                            {formatMoney(plan.monthlyAmountMinor)} / mo
                          </span>
                        </div>
                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Remaining Principal
                          </span>
                          <span
                            data-testid="installment-remaining-amount"
                            className="font-mono font-extrabold text-sm tabular-nums text-[var(--text)] block truncate"
                          >
                            {formatMoney(prog.remainingPrincipalMinor)}
                          </span>
                        </div>
                      </div>

                      {/* Tier 3: Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            data-testid="installment-progress-text"
                            className="text-[var(--text-muted)] font-medium"
                          >
                            {prog.paidInstallments} of {plan.tenureMonths} installments paid
                          </span>
                          <span className="font-mono font-bold text-[var(--text)] tabular-nums">
                            {percent}%
                          </span>
                        </div>
                        <div
                          data-testid="installment-progress-bar"
                          className="w-full bg-[var(--bg)] border border-[var(--border)] h-2.5 rounded-full overflow-hidden"
                        >
                          <div
                            className="bg-[var(--accent)] h-full rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Tier 4: Actions */}
                      {plan.status === "ACTIVE" && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
                          <button
                            type="button"
                            data-testid="edit-installment-plan-btn"
                            onClick={() => {
                              setEditingInstallmentPlan(plan);
                              setIsInstallmentModalOpen(true);
                            }}
                            className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold hover:border-[var(--text-muted)] text-[var(--text)] transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            data-testid="installment-early-payoff-btn"
                            onClick={() => {
                              setPayoffPlan(plan);
                              setPayoffRemainingMinor(
                                prog.remainingPrincipalMinor
                              );
                            }}
                            className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold hover:border-[var(--text-muted)] text-[var(--text)] transition-colors cursor-pointer"
                          >
                            Early Payoff
                          </button>
                          <button
                            type="button"
                            data-testid="cancel-plan-btn"
                            onClick={() => handleCancelPlan(plan)}
                            className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-rose-500/10 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/18 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Loans & Leases Group */}
          <section data-testid="group-loans" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
              <span className="flex items-center gap-2">
                <Landmark size={15} className="text-[var(--accent)]" />
                <span>Loans &amp; Leases</span>
              </span>
              <div className="flex items-center gap-3">
                <span
                  data-testid="subtotal-loans"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)]"
                >
                  {formatMoney(loansSubtotal)}
                </span>
                <button
                  type="button"
                  data-testid="add-loan-btn"
                  onClick={() => setIsLoanModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text)] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--text-muted)] transition-colors cursor-pointer normal-case tracking-normal"
                >
                  <Plus size={14} />
                  <span>Add Loan / Lease</span>
                </button>
              </div>
            </div>

            {loans.length === 0 ? (
              <div className="p-6 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 text-center text-sm text-[var(--text-muted)]">
                No loans or leases active.
              </div>
            ) : (
              <div className="grid gap-3.5">
                {loans.map((loan) => {
                  const remPrincipal =
                    loanRemainingMap.get(loan.id) ??
                    loan.originalPrincipalMinor;
                  return (
                    <div
                      key={loan.id}
                      data-testid={`loan-item-${loan.id}`}
                      className="p-4 sm:p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] space-y-4 shadow-2xs"
                    >
                      {/* Tier 1: Lender Identity & Badges */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            data-testid="loan-lender-name"
                            className="text-base font-bold text-[var(--text)] leading-snug"
                          >
                            {loan.lenderName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-2xs ${
                              loan.kind === "LEASE"
                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {loan.kind}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-2xs ${
                              loan.status === "ACTIVE"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-slate-500/15 text-[var(--text-muted)]"
                            }`}
                          >
                            {loan.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-full font-bold text-2xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]">
                            {loan.calculationType === "FLAT_RATE"
                              ? "FLAT RATE"
                              : "REDUCING BAL"}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
                          <span>APR: {(loan.annualInterestRateBps / 100).toFixed(2)}%</span>
                          <span>•</span>
                          <span>Tenure: {loan.tenureMonths} mo</span>
                          <span>•</span>
                          <span>Paid: {loan.paidInstallments || 0}</span>
                        </div>
                      </div>

                      {/* Tier 2: 2x2 / 3-col KPI Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Monthly EMI
                          </span>
                          <span
                            data-testid="loan-monthly-emi"
                            className="text-sm font-extrabold font-mono tabular-nums text-[var(--text)] block truncate"
                          >
                            {formatMoney(loan.monthlyEmiAmountMinor)}
                          </span>
                        </div>

                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Remaining Principal
                          </span>
                          <span
                            data-testid="loan-remaining-principal"
                            className="text-sm font-extrabold font-mono tabular-nums text-expense block truncate"
                          >
                            {formatMoney(remPrincipal)}
                          </span>
                        </div>

                        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Original Principal
                          </span>
                          <span className="text-sm font-bold font-mono tabular-nums text-[var(--text)] block truncate">
                            {formatMoney(loan.originalPrincipalMinor)}
                          </span>
                        </div>
                      </div>

                      {/* Tier 3: Schedule Action */}
                      <div className="pt-1">
                        <button
                          type="button"
                          data-testid="loan-details-btn"
                          onClick={() => setSelectedLoan(loan)}
                          className="w-full sm:w-auto h-10 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                        >
                          <span>Details &amp; Schedule</span>
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Tab 3: Investments (Fixed Deposits) */}
        <div
          className={`space-y-6 ${
            activeTab === "investments" ? "block" : "hidden"
          }`}
        >
          <section data-testid="group-fixed-deposits" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
              <span className="flex items-center gap-2">
                <PiggyBank size={15} className="text-[var(--accent)]" />
                <span>Fixed Deposits</span>
              </span>
              <div className="flex items-center gap-3">
                <span
                  data-testid="subtotal-fixed-deposits"
                  className="font-mono tabular-nums font-extrabold text-sm text-[var(--text)]"
                >
                  {formatMoney(fixedDepositsSubtotal)}
                </span>
                <button
                  type="button"
                  data-testid="add-fd-btn"
                  onClick={() => {
                    setEditingFd(null);
                    setIsFdModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text)] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--text-muted)] transition-colors cursor-pointer normal-case tracking-normal"
                >
                  <Plus size={14} />
                  <span>Add FD</span>
                </button>
              </div>
            </div>

            {fixedDeposits.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 text-center text-sm text-[var(--text-muted)]">
                No fixed deposits created yet.
              </div>
            ) : (
              <div className="grid gap-3.5">
                {fixedDeposits.map((fd) => {
                  const isMonthly =
                    fd.payoutMode === "MONTHLY_PAYOUT_TO_ACCOUNT";
                  const monthlyPayout = calculateMonthlyPayout(
                    fd.principalAmountMinor,
                    fd.annualInterestRateBps,
                    fd.withholdingTaxRateBps
                  );
                  const compoundMaturity = calculateCompoundMaturity(
                    fd.principalAmountMinor,
                    fd.annualInterestRateBps,
                    fd.tenureMonths,
                    fd.compoundingFrequency,
                    fd.withholdingTaxRateBps
                  );
                  const paidPeriods = Math.min(
                    fd.tenureMonths,
                    Math.max(0, fd.paidPeriods || 0)
                  );
                  const progressPercent =
                    fd.tenureMonths > 0
                      ? Math.min(
                          100,
                          Math.round((paidPeriods / fd.tenureMonths) * 100)
                        )
                      : 0;

                  return (
                    <div
                      key={fd.id}
                      data-testid={`fd-item-${fd.id}`}
                      className="p-4 sm:p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] space-y-4 shadow-2xs"
                    >
                      {/* Tier 1: Bank Identity & Badges */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-[var(--text)] leading-snug">
                            {fd.bankName}
                          </span>
                          {fd.accountNumber && (
                            <span className="text-xs text-[var(--text-muted)] font-mono">
                              #{fd.accountNumber}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-2xs ${
                              fd.status === "ACTIVE"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : fd.status === "MATURED"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-slate-500/15 text-[var(--text-muted)]"
                            }`}
                          >
                            {fd.status}
                          </span>
                          {fd.autoRenew && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold text-2xs">
                              AUTO-RENEW
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
                          <span>APR: {(fd.annualInterestRateBps / 100).toFixed(2)}%</span>
                          <span>•</span>
                          <span>WHT: {(fd.withholdingTaxRateBps / 100).toFixed(1)}%</span>
                          <span>•</span>
                          <span>
                            Maturity: {new Date(fd.maturityDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Tier 2: 2-Column KPI Tiles */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                            Principal
                          </span>
                          <span className="text-sm font-extrabold font-mono text-[var(--text)] tabular-nums block truncate">
                            {formatMoney(fd.principalAmountMinor)}
                          </span>
                        </div>

                        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
                          {isMonthly ? (
                            <>
                              <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                                Monthly Net
                              </span>
                              <span
                                data-testid="fd-monthly-net"
                                className="text-sm font-extrabold font-mono text-[var(--income)] tabular-nums block truncate"
                              >
                                {formatMoney(monthlyPayout.netInterestMinor)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
                                Maturity Net
                              </span>
                              <span
                                data-testid="fd-maturity-net"
                                className="text-sm font-extrabold font-mono text-[var(--income)] tabular-nums block truncate"
                              >
                                {formatMoney(
                                  compoundMaturity.maturityNetAmountMinor
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Tier 3: Tenure Progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            data-testid="fd-progress-text"
                            className="text-[var(--text-muted)] font-medium"
                          >
                            {paidPeriods} of {fd.tenureMonths} months elapsed
                          </span>
                          <span className="font-mono font-bold tabular-nums text-[var(--text)]">
                            {progressPercent}%
                          </span>
                        </div>
                        <div
                          data-testid="fd-progress-bar"
                          className="w-full bg-[var(--bg)] border border-[var(--border)] h-2.5 rounded-full overflow-hidden"
                        >
                          <div
                            className="bg-[var(--accent)] h-full rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Tier 4: Actions */}
                      {fd.status !== "CLOSED" && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
                          {fd.status === "MATURED" && (
                            <button
                              type="button"
                              data-testid="fd-deposit-proceeds-btn"
                              onClick={() => handleDepositProceeds(fd)}
                              className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                            >
                              Deposit proceeds
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditingFd(fd);
                              setIsFdModalOpen(true);
                            }}
                            className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold hover:border-[var(--text-muted)] cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            data-testid="fd-close-btn"
                            onClick={() => setCloseFd(fd)}
                            className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-rose-500/10 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/18 transition-colors cursor-pointer"
                          >
                            Premature Close
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Account Creation & Edit Sheet / Dialog */}
      {isFormOpen && (
        <div
          data-testid="account-form-modal"
          className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => setIsFormOpen(false)}
        >
          <div
            data-testid="account-dialog"
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-lg bg-[var(--surface)] border-t md:border border-[var(--border)] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 pb-sheet-safe md:pb-6 space-y-5 modal-sheet-dialog overflow-y-auto"
          >
            <div data-testid="account-drawer" className="contents">
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
                <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
                  {editingAccount ? "Edit Account" : "Add New Account"}
                </h2>
                <button
                  type="button"
                  data-testid="account-cancel"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Close"
                  className="w-9 h-9 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>

              <form
                onSubmit={handleFormSubmit}
                noValidate
                className="space-y-4 text-sm"
              >
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Account Name
                  </label>
                  <input
                    type="text"
                    data-testid="account-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Wallet, ComBank Savings, Apex Visa"
                    className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {errors.name && (
                    <p
                      data-testid="error-account-name"
                      className="text-rose-500 text-xs font-medium"
                    >
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Account Type
                  </label>
                  <select
                    data-testid="account-type"
                    value={type}
                    onChange={(e) =>
                      setType(
                        e.target.value as
                          | "CASH"
                          | "BANK_SAVINGS"
                          | "CREDIT_CARD"
                      )
                    }
                    className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="CASH">Cash Wallet</option>
                    <option value="BANK_SAVINGS">Bank Savings</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                  </select>
                </div>

                {/* Currency */}
                {type === "BANK_SAVINGS" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Currency
                    </label>
                    <select
                      data-testid="account-currency"
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value as "LKR" | "USD")
                      }
                      className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="LKR">LKR — Sri Lankan Rupee</option>
                      <option value="USD">USD — US Dollar</option>
                    </select>
                  </div>
                )}

                {/* Access Scope */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Access Scope
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-testid="account-scope-private"
                      onClick={() => setAccessScope("PRIVATE")}
                      className={`h-11 px-3 rounded-2xl border text-xs font-bold transition-colors cursor-pointer ${
                        accessScope === "PRIVATE"
                          ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                          : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      Private
                    </button>
                    <button
                      type="button"
                      data-testid="account-scope-shared"
                      onClick={() => setAccessScope("SHARED_HOUSEHOLD")}
                      className={`h-11 px-3 rounded-2xl border text-xs font-bold transition-colors cursor-pointer ${
                        accessScope === "SHARED_HOUSEHOLD"
                          ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                          : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      Shared Household
                    </button>
                  </div>
                </div>

                {/* Opening Balance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {type === "CREDIT_CARD"
                      ? "Opening Balance / Debt (≤ 0)"
                      : "Opening Balance"}
                  </label>
                  <input
                    type="text"
                    data-testid="account-opening-balance"
                    value={openingBalanceStr}
                    onChange={(e) => setOpeningBalanceStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono font-bold tabular-nums focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                {/* Bank / Credit Card Metadata */}
                {type !== "CASH" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Last 4 Digits
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        data-testid="account-number-last4"
                        value={accountNumberLast4}
                        onChange={(e) => setAccountNumberLast4(e.target.value)}
                        placeholder="1234"
                        className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Bank Sender ID
                      </label>
                      <input
                        type="text"
                        data-testid="account-bank-sender"
                        value={bankSender}
                        onChange={(e) => setBankSender(e.target.value)}
                        placeholder="COMBANK"
                        className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] uppercase focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}

                {/* Credit Card Specific Fields */}
                {type === "CREDIT_CARD" && (
                  <div className="space-y-4 pt-3 border-t border-[var(--border)]">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Credit Limit
                      </label>
                      <input
                        type="text"
                        data-testid="account-credit-limit"
                        value={creditLimitStr}
                        onChange={(e) => setCreditLimitStr(e.target.value)}
                        placeholder="e.g. 500000.00"
                        className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono font-bold tabular-nums focus:outline-none focus:border-[var(--accent)]"
                      />
                      {errors.creditLimit && (
                        <p
                          data-testid="error-credit-limit"
                          className="text-rose-500 text-xs font-medium"
                        >
                          {errors.creditLimit}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Cutoff Day (1–31)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          data-testid="account-cutoff-day"
                          value={cutoffDay}
                          onChange={(e) => setCutoffDay(e.target.value)}
                          placeholder="20"
                          className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                        />
                        {errors.cutoffDay && (
                          <p
                            data-testid="error-cutoff-day"
                            className="text-rose-500 text-xs font-medium"
                          >
                            {errors.cutoffDay}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Due Day (1–31)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          data-testid="account-due-day"
                          value={dueDay}
                          onChange={(e) => setDueDay(e.target.value)}
                          placeholder="10"
                          className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                        />
                        {errors.dueDay && (
                          <p
                            data-testid="error-due-day"
                            className="text-rose-500 text-xs font-medium"
                          >
                            {errors.dueDay}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Linked Settlement Account
                      </label>
                      <select
                        data-testid="account-settlement-id"
                        value={settlementAccountId}
                        onChange={(e) => setSettlementAccountId(e.target.value)}
                        className="w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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

                <div className="pt-2">
                  <button
                    type="submit"
                    data-testid="account-submit"
                    className="w-full h-12 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
                  >
                    {editingAccount ? "Save Changes" : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {settlingCard && settlingCardCycle && (
        <SettleModal
          card={settlingCard}
          billedBalanceMinor={settlingCardCycle.billedBalanceMinor}
          totalDebtMinor={settlingCardCycle.outstandingDebtMinor}
          isOpen={!!settlingCard}
          onClose={() => setSettlingCard(null)}
        />
      )}

      {isInstallmentModalOpen && (
        <InstallmentPlanModal
          isOpen={isInstallmentModalOpen}
          onClose={() => {
            setIsInstallmentModalOpen(false);
            setEditingInstallmentPlan(null);
          }}
          accounts={accounts}
          installmentPlan={editingInstallmentPlan}
        />
      )}

      {payoffPlan && (
        <EarlyPayoffModal
          plan={payoffPlan}
          remainingPrincipalMinor={payoffRemainingMinor}
          isOpen={!!payoffPlan}
          onClose={() => {
            setPayoffPlan(null);
            setPayoffRemainingMinor(0);
          }}
        />
      )}

      {isFdModalOpen && (
        <FixedDepositModal
          isOpen={isFdModalOpen}
          onClose={() => {
            setIsFdModalOpen(false);
            setEditingFd(null);
          }}
          accounts={accounts}
          fixedDeposit={editingFd}
        />
      )}

      {closeFd && (
        <FdCloseModal
          fd={closeFd}
          isOpen={!!closeFd}
          onClose={() => setCloseFd(null)}
          accounts={accounts}
        />
      )}

      {isLoanModalOpen && (
        <LoanModal
          isOpen={isLoanModalOpen}
          onClose={() => setIsLoanModalOpen(false)}
          accounts={accounts}
        />
      )}

      {selectedLoan && (
        <LoanDetailModal
          loan={selectedLoan}
          isOpen={!!selectedLoan}
          onClose={() => setSelectedLoan(null)}
          accounts={accounts}
        />
      )}

      {confirmModal && (
        <ConfirmationModal
          isOpen={!!confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.action}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          variant={confirmModal.variant}
          icon={confirmModal.icon}
        />
      )}
    </main>
  );
}

const AccountCard = memo(function AccountCard({
  account,
  balance,
  householdRoleMap,
  onEdit,
  onArchive,
  onDelete,
}: {
  account: LocalAccount;
  balance: number;
  householdRoleMap?: Map<string, string>;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const role =
    account.householdId && householdRoleMap
      ? householdRoleMap.get(account.householdId)
      : null;
  const isContributor = role === "CONTRIBUTOR_ADD_ONLY";
  const isViewer = role === "VIEWER";
  const isCash = account.type === "CASH";

  return (
    <div
      data-testid={`account-item-${account.id}`}
      className={`p-4 sm:p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-muted)]/60 transition-all space-y-3.5 shadow-2xs ${
        account.isArchived ? "opacity-60" : ""
      }`}
    >
      {/* Tier 1: Full-Width Account Identity Link */}
      <Link
        href={`/accounts/${account.id}`}
        transitionTypes={["nav-forward"]}
        data-testid="account-detail-link"
        className="flex items-start justify-between gap-3 w-full group cursor-pointer"
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
            {isCash ? <Banknote size={20} /> : <Building2 size={20} />}
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="account-card-name"
                className="text-base font-bold text-[var(--text)] leading-snug break-words group-hover:text-[var(--accent)] transition-colors"
              >
                {account.name}
              </span>
              {account.accessScope === "SHARED_HOUSEHOLD" && (
                <span
                  data-testid="account-scope-badge"
                  className="text-2xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] shrink-0"
                >
                  Shared
                </span>
              )}
              {account.isArchived && (
                <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] shrink-0">
                  Archived
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
              <span className="font-semibold text-[var(--text)]/80">
                {account.currency || "LKR"}
              </span>
              {account.accountNumberLast4 && (
                <>
                  <span className="opacity-50">•</span>
                  <span>•••• {account.accountNumberLast4}</span>
                </>
              )}
              {account.bankSenderIds?.[0] && (
                <span className="px-2 py-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-2xs font-medium text-[var(--text-muted)] max-w-full truncate">
                  {account.bankSenderIds[0]}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:bg-[var(--bg)] transition-colors shrink-0 mt-0.5">
          <ChevronRight size={18} />
        </div>
      </Link>

      {/* Tier 2: Recessed Balance & Action Bar */}
      <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
            {isCash ? "Cash Balance" : "Available Balance"}
          </span>
          <span
            data-testid="account-balance"
            className={`font-extrabold font-mono text-lg sm:text-xl tabular-nums block truncate mt-0.5 ${
              isContributor
                ? "text-[var(--text-muted)]"
                : balance < 0
                  ? "text-expense"
                  : balance > 0
                    ? "text-income"
                    : "text-[var(--text)]"
            }`}
          >
            <span data-testid="account-card-balance">
              {isContributor ? "—" : formatMoney(balance, account.currency)}
            </span>
          </span>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="account-edit-btn"
              onClick={onEdit}
              title="Edit"
              aria-label={`Edit ${account.name}`}
              className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              data-testid="account-archive-btn"
              onClick={onArchive}
              title={account.isArchived ? "Unarchive" : "Archive"}
              aria-label={account.isArchived ? `Unarchive ${account.name}` : `Archive ${account.name}`}
              className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
            >
              <Archive size={14} />
            </button>
            <button
              type="button"
              data-testid="account-delete-btn"
              onClick={onDelete}
              title="Delete"
              aria-label={`Delete ${account.name}`}
              className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 hover:border-rose-500/40 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tier 3: Balance Mismatch Calibration Banner */}
      {account.balanceMismatchHint && (
        <div
          data-testid="balance-mismatch-hint"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Balance mismatch detected from SMS</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono flex flex-wrap gap-x-3 gap-y-0.5">
              <span>
                SMS: {formatMoney(account.balanceMismatchHint.statedBalanceMinor, account.currency)}
              </span>
              <span>
                Ledger: {formatMoney(account.balanceMismatchHint.ledgerBalanceMinor, account.currency)}
              </span>
            </div>
          </div>
          <Link
            href={`/accounts/${account.id}?calibrate=true`}
            transitionTypes={["nav-forward"]}
            data-testid="calibrate-btn"
            className="h-9 px-4 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors inline-flex items-center justify-center shrink-0"
          >
            Calibrate
          </Link>
        </div>
      )}
    </div>
  );
});

const CreditCardAccountCard = memo(function CreditCardAccountCard({
  account,
  balance,
  blockedPrincipal,
  transactions,
  householdRoleMap,
  onEdit,
  onArchive,
  onDelete,
  onSettle,
}: {
  account: LocalAccount;
  balance: number;
  blockedPrincipal: number;
  transactions: LedgerTransaction[];
  householdRoleMap?: Map<string, string>;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSettle: () => void;
}) {
  const role =
    account.householdId && householdRoleMap
      ? householdRoleMap.get(account.householdId)
      : null;
  const isContributor = role === "CONTRIBUTOR_ADD_ONLY";
  const isViewer = role === "VIEWER";

  const cycle = useMemo(() => {
    return calculateStatementCycle({
      account: {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      transactions,
      creditLimitMinor: account.creditLimitMinor || 0,
      statementCutoffDay: account.statementCutoffDay || 20,
      paymentDueDay: account.paymentDueDay || 10,
      blockedPrincipalMinor: blockedPrincipal,
    });
  }, [account, transactions, blockedPrincipal]);

  const isOverpaid = balance > 0;

  return (
    <div
      data-testid={`account-item-${account.id}`}
      className={`p-4 sm:p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] space-y-4 transition-all shadow-2xs ${
        account.isArchived ? "opacity-60" : ""
      }`}
    >
      {/* Tier 1: Full-Width Card Identity Link */}
      <Link
        href={`/accounts/${account.id}`}
        transitionTypes={["nav-forward"]}
        data-testid="account-detail-link"
        className="flex items-start justify-between gap-3 w-full group cursor-pointer"
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-[var(--expense)]/12 text-expense flex items-center justify-center shrink-0 mt-0.5">
            <CreditCard size={20} />
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="account-card-name"
                className="text-base font-bold text-[var(--text)] leading-snug break-words group-hover:text-[var(--accent)] transition-colors"
              >
                {account.name}
              </span>
              {account.accessScope === "SHARED_HOUSEHOLD" && (
                <span
                  data-testid="account-scope-badge"
                  className="text-2xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] shrink-0"
                >
                  Shared
                </span>
              )}
              <span
                data-testid="credit-due-countdown"
                className="text-2xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] shrink-0"
              >
                {cycle.dueCountdownText}
              </span>
            </div>

            <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              {account.accountNumberLast4 && (
                <span>•••• {account.accountNumberLast4}</span>
              )}
              {!isContributor && account.creditLimitMinor && (
                <span>Limit: {formatMoney(account.creditLimitMinor)}</span>
              )}
              {account.statementCutoffDay && (
                <span>Cutoff: Day {account.statementCutoffDay}</span>
              )}
              {account.paymentDueDay && (
                <span>Due: Day {account.paymentDueDay}</span>
              )}
            </div>
          </div>
        </div>

        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:bg-[var(--bg)] transition-colors shrink-0 mt-0.5">
          <ChevronRight size={18} />
        </div>
      </Link>

      {/* Tier 2: Credit Card 2x2 / 4-col Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
          <span className="text-2xs uppercase tracking-wider text-[var(--text-muted)] font-semibold block">
            Billed Due
          </span>
          <div
            data-testid="credit-billed-amount"
            className="font-mono font-bold text-xs sm:text-sm tabular-nums text-expense truncate"
          >
            {isContributor ? "—" : formatMoney(cycle.billedBalanceMinor)}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
          <span className="text-2xs uppercase tracking-wider text-[var(--text-muted)] font-semibold block">
            Unbilled
          </span>
          <div
            data-testid="credit-unbilled-amount"
            className="font-mono font-bold text-xs sm:text-sm tabular-nums text-[var(--text)] truncate"
          >
            {isContributor ? "—" : formatMoney(cycle.unbilledBalanceMinor)}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
          <span className="text-2xs uppercase tracking-wider text-[var(--text-muted)] font-semibold block">
            Blocked
          </span>
          <div
            data-testid="credit-blocked-amount"
            className="font-mono font-bold text-xs sm:text-sm tabular-nums text-amber-600 dark:text-amber-400 truncate"
          >
            {isContributor ? "—" : formatMoney(blockedPrincipal)}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-3 space-y-1">
          <span className="text-2xs uppercase tracking-wider text-[var(--text-muted)] font-semibold block">
            Available
          </span>
          <div
            data-testid="credit-available-amount"
            className="font-mono font-bold text-xs sm:text-sm tabular-nums text-income truncate"
          >
            {isContributor ? "—" : formatMoney(cycle.availableCreditMinor)}
          </div>
        </div>
      </div>

      {/* Tier 3: Outstanding Balance & Action Bar */}
      <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between sm:block gap-2">
          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] block">
              {isOverpaid ? "Credit Balance" : "Total Outstanding"}
            </span>
            {isOverpaid ? (
              <span
                data-testid="credit-card-credit"
                className="text-income font-extrabold font-mono text-base sm:text-lg tabular-nums block mt-0.5"
              >
                {isContributor ? "—" : `+${formatMoney(balance)}`}
              </span>
            ) : (
              <span
                data-testid="card-outstanding"
                className="font-extrabold font-mono text-base sm:text-lg text-expense tabular-nums block mt-0.5"
              >
                {isContributor ? "—" : formatMoney(cycle.outstandingDebtMinor)}
              </span>
            )}
          </div>

          <div
            data-testid="account-card-balance"
            className="text-right sm:text-left font-mono text-xs text-[var(--text-muted)] tabular-nums sm:mt-0.5"
          >
            <span className="sm:hidden block text-2xs uppercase tracking-wider">Ledger</span>
            <span data-testid="account-balance">
              {isContributor ? "—" : formatMoney(balance)}
            </span>
          </div>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
            {!isContributor && (
              <button
                type="button"
                data-testid="credit-settle-btn"
                onClick={onSettle}
                className="flex-1 sm:flex-initial h-9 px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold hover:opacity-95 active:scale-95 transition-all cursor-pointer"
              >
                Settle Card
              </button>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                data-testid="account-edit-btn"
                onClick={onEdit}
                title="Edit"
                className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                data-testid="account-archive-btn"
                onClick={onArchive}
                title={account.isArchived ? "Unarchive" : "Archive"}
                className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <Archive size={14} />
              </button>
              <button
                type="button"
                data-testid="account-delete-btn"
                onClick={onDelete}
                title="Delete"
                className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {account.balanceMismatchHint && (
        <div
          data-testid="balance-mismatch-hint"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Balance mismatch detected from SMS</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono flex flex-wrap gap-x-3 gap-y-0.5">
              <span>
                SMS: {formatMoney(account.balanceMismatchHint.statedBalanceMinor)}
              </span>
              <span>
                Ledger: {formatMoney(account.balanceMismatchHint.ledgerBalanceMinor)}
              </span>
            </div>
          </div>
          <Link
            href={`/accounts/${account.id}?calibrate=true`}
            transitionTypes={["nav-forward"]}
            data-testid="calibrate-btn"
            className="h-9 px-4 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors inline-flex items-center justify-center shrink-0"
          >
            Calibrate
          </Link>
        </div>
      )}
    </div>
  );
});

"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Wallet,
  Building2,
  CreditCard,
  ArrowLeftRight,
  Scale,
  AlertTriangle,
} from "lucide-react";
import {
  useAccounts,
  useTransactions,
  useCategories,
  useCreditCardStatements,
  useInstallmentPlans,
  useSync,
} from "@/components/sync-provider";
import {
  calculateLedgerBalance,
  LedgerTransaction,
} from "@/lib/finance-core/ledger";
import { formatMoney } from "@/lib/finance-core/money";
import {
  calculateStatementCycle,
  calculateInstallmentProgress,
} from "@/lib/finance-core/credit-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalibrationModal } from "@/components/transaction/calibration-modal";
import { TransactionEditModal } from "@/components/transaction/transaction-edit-modal";
import { SettleModal } from "@/components/account/settle-modal";
import { EarlyPayoffModal } from "@/components/account/early-payoff-modal";
import { InstallmentPlanModal } from "@/components/account/installment-plan-modal";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { CategoryIcon } from "@/components/ui/category-icon";
import { LocalTransaction, LocalInstallmentPlan } from "@/lib/db";
import {
  localUpdateTransaction,
  localDeleteInstallmentPlan,
} from "@/lib/sync/client";

export default function AccountDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-4xl mx-auto px-5 sm:px-7 py-6 space-y-4">
          <p className="text-sm text-[var(--text-muted)]">Loading account...</p>
        </main>
      }
    >
      <AccountDetailContent />
    </Suspense>
  );
}

function AccountDetailContent() {
  const params = useParams();
  const accountId = params?.id as string;

  const accounts = useAccounts();
  const transactions = useTransactions();
  const categories = useCategories();
  const statements = useCreditCardStatements();
  const installmentPlans = useInstallmentPlans();

  const { db } = useSync();
  const searchParams = useSearchParams();
  const [isCalibrateOpen, setIsCalibrateOpen] = useState(
    () => searchParams?.get("calibrate") === "true"
  );
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [selectedTxForEdit, setSelectedTxForEdit] =
    useState<LocalTransaction | null>(null);
  const [payoffPlan, setPayoffPlan] = useState<LocalInstallmentPlan | null>(
    null
  );
  const [payoffRemainingMinor, setPayoffRemainingMinor] = useState(0);
  const [editingPlan, setEditingPlan] = useState<LocalInstallmentPlan | null>(
    null
  );
  const [cancellingPlan, setCancellingPlan] =
    useState<LocalInstallmentPlan | null>(null);

  const account = useMemo(() => {
    return accounts.find((a) => a.id === accountId);
  }, [accounts, accountId]);

  const ledgerTxList: LedgerTransaction[] = useMemo(() => {
    return transactions.map((t) => ({
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
  }, [transactions]);

  const cardPlans = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return [];
    return installmentPlans.filter((p) => p.accountId === account.id);
  }, [account, installmentPlans]);

  const planProgressMap = useMemo(() => {
    const map = new Map<
      string,
      {
        paidInstallments: number;
        remainingInstallments: number;
        remainingPrincipalMinor: number;
      }
    >();
    for (const plan of cardPlans) {
      const planTxBilled = transactions
        .filter(
          (t) =>
            !t.deletedAt &&
            t.installmentPlanId === plan.id &&
            t.type === "EXPENSE" &&
            t.subType === "CC_INSTALLMENT"
        )
        .map((t) => t.amountMinor);

      const prog = calculateInstallmentProgress(
        plan.totalAmountMinor,
        plan.tenureMonths,
        plan.initialPaidInstallments || 0,
        planTxBilled
      );
      map.set(plan.id, prog);
    }
    return map;
  }, [cardPlans, transactions]);

  const blockedPrincipalMinor = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return 0;
    let total = 0;
    for (const plan of cardPlans) {
      if (plan.status === "ACTIVE") {
        const prog = planProgressMap.get(plan.id);
        if (prog) total += prog.remainingPrincipalMinor;
      }
    }
    return total;
  }, [account, cardPlans, planProgressMap]);

  const balance = useMemo(() => {
    if (!account) return 0;
    return calculateLedgerBalance(
      {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      ledgerTxList
    );
  }, [account, ledgerTxList]);

  const cycle = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return null;
    return calculateStatementCycle({
      account: {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      transactions: ledgerTxList,
      creditLimitMinor: account.creditLimitMinor || 0,
      statementCutoffDay: account.statementCutoffDay || 20,
      paymentDueDay: account.paymentDueDay || 10,
      blockedPrincipalMinor,
    });
  }, [account, ledgerTxList, blockedPrincipalMinor]);

  const cardStatements = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return [];
    return statements
      .filter((s) => s.accountId === account.id)
      .sort(
        (a, b) =>
          new Date(b.cycleCutoffDate).getTime() -
          new Date(a.cycleCutoffDate).getTime()
      );
  }, [statements, account]);

  const accountTransactions = useMemo(() => {
    if (!account) return [];
    return transactions
      .filter(
        (t) =>
          !t.deletedAt &&
          (t.accountId === account.id || t.toAccountId === account.id)
      )
      .sort(
        (a, b) =>
          new Date(b.transactionDate).getTime() -
          new Date(a.transactionDate).getTime()
      );
  }, [account, transactions]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, color: c.color, icon: c.icon });
    }
    return map;
  }, [categories]);

  if (!account) {
    return (
      <main className="max-w-4xl mx-auto px-5 sm:px-7 py-6 space-y-4">
        <Link
          href="/accounts"
          transitionTypes={["nav-back"]}
          data-testid="back-button"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Accounts</span>
        </Link>
        <div className="p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] text-center text-sm text-[var(--text-muted)]">
          Account not found.
        </div>
      </main>
    );
  }

  const isCreditCard = account.type === "CREDIT_CARD";
  const outstandingDebt = isCreditCard && balance < 0 ? Math.abs(balance) : 0;

  return (
    <main className="max-w-4xl mx-auto px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      {/* Sticky Top Navigation Row */}
      <header className="sticky top-0 z-30 -mx-5 sm:-mx-7 -mt-4 sm:-mt-6 px-5 sm:px-7 py-3 sm:py-4 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]/60 flex items-center gap-3 select-none">
        <Link
          href="/accounts"
          transitionTypes={["nav-back"]}
          data-testid="back-button"
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors shrink-0"
          title="Back to Accounts"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <p
            data-testid="account-detail-type"
            className="text-2xs font-bold uppercase tracking-wider text-[var(--text-muted)]"
          >
            {account.type === "CASH"
              ? "Cash Account"
              : account.type === "BANK_SAVINGS"
                ? `Bank Savings ${
                    account.accountNumberLast4
                      ? `• •••• ${account.accountNumberLast4}`
                      : ""
                  }`
                : `Credit Card ${
                    account.accountNumberLast4
                      ? `• •••• ${account.accountNumberLast4}`
                      : ""
                  }`}
          </p>
          <h1
            data-testid="account-detail-name"
            className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)] flex items-center gap-2 truncate"
          >
            <span>{account.name}</span>
          </h1>
        </div>
      </header>

      {/* Wallet Hero Card */}
      <div
        className={`rounded-3xl p-6 text-white shadow-md space-y-5 ${
          isCreditCard
            ? "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950"
            : "bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#022C22]"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/75 block">
              {isCreditCard ? "Current Ledger Balance" : "Available Balance"}
            </span>
            <span
              data-testid="account-detail-balance"
              className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums block"
            >
              {formatMoney(balance, account.currency || "LKR")}
            </span>
            {isCreditCard && (
              <div
                data-testid="account-detail-outstanding"
                className="text-xs font-bold font-mono text-rose-300 pt-0.5"
              >
                Outstanding: {formatMoney(outstandingDebt)}
              </div>
            )}
          </div>

          <div className="w-12 h-12 rounded-2xl bg-white/12 flex items-center justify-center shrink-0">
            {account.type === "CASH" ? (
              <Wallet size={22} />
            ) : account.type === "BANK_SAVINGS" ? (
              <Building2 size={22} />
            ) : (
              <CreditCard size={22} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-white/15">
          {isCreditCard && (
            <button
              type="button"
              data-testid="credit-settle-btn"
              onClick={() => setIsSettleOpen(true)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-white text-slate-950 text-xs font-bold hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              Settle Card
            </button>
          )}

          <button
            type="button"
            data-testid="calibrate-balance-btn"
            onClick={() => setIsCalibrateOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-2xl bg-white/15 hover:bg-white/22 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Scale size={14} />
            <span>Calibrate Balance</span>
          </button>
        </div>
      </div>

      {/* Balance Mismatch Warning Banner */}
      {account.balanceMismatchHint && (
        <div
          data-testid="balance-mismatch-hint"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle size={16} />
              <span>Balance mismatch detected from bank SMS</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono">
              SMS balance:{" "}
              {formatMoney(account.balanceMismatchHint.statedBalanceMinor)} •
              Ledger balance:{" "}
              {formatMoney(account.balanceMismatchHint.ledgerBalanceMinor)}
            </div>
          </div>
          <button
            type="button"
            data-testid="calibrate-btn"
            onClick={() => setIsCalibrateOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors shrink-0 cursor-pointer"
          >
            Calibrate
          </button>
        </div>
      )}

      {/* Credit Card Cycle Metrics */}
      {isCreditCard && cycle && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-3xl text-xs">
          <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Billed Due
            </span>
            <span
              data-testid="credit-billed-amount"
              className="font-mono font-bold text-sm text-expense block truncate"
            >
              {formatMoney(cycle.billedBalanceMinor)}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Unbilled
            </span>
            <span
              data-testid="credit-unbilled-amount"
              className="font-mono font-bold text-sm text-[var(--text)] block truncate"
            >
              {formatMoney(cycle.unbilledBalanceMinor)}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Blocked
            </span>
            <span
              data-testid="credit-blocked-amount"
              className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400 block truncate"
            >
              {formatMoney(blockedPrincipalMinor)}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Available
            </span>
            <span
              data-testid="available-credit-display"
              className="font-mono font-bold text-sm text-income block truncate"
            >
              {formatMoney(cycle.availableCreditMinor)}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
            <span className="text-2xs uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Due Status
            </span>
            <span
              data-testid="credit-due-countdown"
              className="inline-block px-2.5 py-0.5 rounded-full text-2xs font-bold bg-[var(--accent)]/12 text-[var(--accent)]"
            >
              {cycle.dueCountdownText}
            </span>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <section className="space-y-3.5">
        <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Account Ledger ({accountTransactions.length})
        </h2>

        {accountTransactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Transactions recorded to this account will appear here."
            icon={<ArrowLeftRight size={24} />}
          />
        ) : (
          <div className="space-y-2.5">
            {accountTransactions.map((tx) => {
              const isOutgoing = tx.accountId === account.id;
              const isTransfer = tx.type === "TRANSFER";
              const isExpense = tx.type === "EXPENSE";
              const isIncome = tx.type === "INCOME" || tx.type === "REFUND";
              const isCalibration =
                tx.source === "CALIBRATION" || tx.type === "ADJUSTMENT";

              const category = tx.categoryId
                ? categoryMap.get(tx.categoryId)
                : null;
              const accentColor = isCalibration
                ? "#8B5CF6"
                : isTransfer
                  ? "#64748B"
                  : category?.color || (isIncome ? "#059669" : "#E11D48");
              const isAsciiWord = category?.icon
                ? /^[A-Za-z0-9_-]+$/.test(category.icon.trim())
                : true;

              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  onClick={() => setSelectedTxForEdit(tx)}
                  className="flex items-center justify-between gap-3.5 p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--text-muted)]/60 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${accentColor}1C`,
                        color: accentColor,
                      }}
                    >
                      {isCalibration ? (
                        <span
                          data-testid="calibration-icon"
                          title="Balance Calibration"
                        >
                          <Scale size={19} />
                        </span>
                      ) : isTransfer ? (
                        <ArrowLeftRight size={19} />
                      ) : category?.icon && !isAsciiWord ? (
                        <span className="text-base leading-none">
                          {category.icon}
                        </span>
                      ) : (
                        <CategoryIcon
                          name={category?.icon || "Tag"}
                          size={19}
                        />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-[var(--text)] truncate">
                          {isCalibration
                            ? "Balance Calibration"
                            : isTransfer
                              ? isOutgoing
                                ? "Transfer Out"
                                : "Transfer In"
                              : category?.name || tx.type}
                        </span>

                        {isCalibration && (
                          <span
                            data-testid="calibration-badge"
                            className={`inline-flex items-center gap-0.5 text-2xs px-2 py-0.5 rounded-full font-mono font-bold ${
                              tx.direction === "IN"
                                ? "bg-[var(--income)]/12 text-income"
                                : "bg-[var(--expense)]/12 text-expense"
                            }`}
                          >
                            {tx.direction === "IN"
                              ? "+ Calibration"
                              : "- Calibration"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 truncate">
                        <span className="font-mono shrink-0">
                          {tx.transactionDate.slice(0, 10)}
                        </span>
                        {tx.note && (
                          <span className="truncate">• {tx.note}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 pl-2">
                    {isExpense && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-extrabold text-sm sm:text-base tabular-nums text-expense whitespace-nowrap"
                      >
                        -{formatMoney(tx.amountMinor)}
                      </span>
                    )}
                    {isIncome && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-extrabold text-sm sm:text-base tabular-nums text-income whitespace-nowrap"
                      >
                        +{formatMoney(tx.amountMinor)}
                      </span>
                    )}
                    {isTransfer && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-extrabold text-sm sm:text-base tabular-nums text-[var(--text-muted)] whitespace-nowrap"
                      >
                        {isOutgoing
                          ? `-${formatMoney(tx.amountMinor)}`
                          : `+${formatMoney(tx.amountMinor)}`}
                      </span>
                    )}
                    {isCalibration && (
                      <span
                        data-testid="transaction-amount"
                        className={`font-mono font-extrabold text-sm sm:text-base tabular-nums whitespace-nowrap ${
                          tx.direction === "IN" ? "text-income" : "text-expense"
                        }`}
                      >
                        {tx.direction === "IN"
                          ? `+${formatMoney(tx.amountMinor)}`
                          : `-${formatMoney(tx.amountMinor)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Statement History for Credit Cards */}
      {isCreditCard && cardStatements.length > 0 && (
        <section data-testid="statement-list" className="space-y-3">
          <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
            Billing Statements ({cardStatements.length})
          </h2>
          <div className="space-y-2.5">
            {cardStatements.map((stmt) => (
              <div
                key={stmt.id}
                data-testid={`statement-row-${stmt.id}`}
                className="flex items-center justify-between p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-[var(--text)]">
                    Cutoff{" "}
                    {stmt.cycleCutoffDate
                      ? stmt.cycleCutoffDate.slice(0, 10)
                      : ""}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">
                    Due {stmt.dueDate ? stmt.dueDate.slice(0, 10) : ""}
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="font-mono font-extrabold text-sm tabular-nums text-expense">
                    {formatMoney(stmt.billedDebtMinor)}
                  </div>
                  <div className="text-2xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {stmt.isSettled ? "Settled" : "Due"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 0% Installment Plans for this Card */}
      {isCreditCard && cardPlans.length > 0 && (
        <section data-testid="card-installment-plans" className="space-y-3">
          <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
            0% Installment Plans ({cardPlans.length})
          </h2>
          <div className="space-y-3">
            {cardPlans.map((plan) => {
              const prog = planProgressMap.get(plan.id) || {
                paidInstallments: plan.initialPaidInstallments || 0,
                remainingInstallments: plan.tenureMonths,
                remainingPrincipalMinor: plan.totalAmountMinor,
              };
              const percent = Math.min(
                100,
                Math.round((prog.paidInstallments / plan.tenureMonths) * 100)
              );

              return (
                <div
                  key={plan.id}
                  data-testid={`installment-plan-card-${plan.id}`}
                  className="p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span
                        data-testid="installment-merchant"
                        className="text-base font-bold text-[var(--text)] block"
                      >
                        {plan.merchantName}
                      </span>
                      <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 font-mono">
                        <span>Total: {formatMoney(plan.totalAmountMinor)}</span>
                        {plan.status === "COMPLETED" && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-2xs">
                            COMPLETED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPlan(plan)}
                        className="px-3 py-1.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold hover:border-[var(--text-muted)] cursor-pointer"
                      >
                        Edit
                      </button>
                      {plan.status === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            data-testid="installment-early-payoff-btn"
                            onClick={() => {
                              setPayoffPlan(plan);
                              setPayoffRemainingMinor(
                                prog.remainingPrincipalMinor
                              );
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold hover:border-[var(--text-muted)] text-[var(--text)] transition-colors cursor-pointer"
                          >
                            Early Payoff
                          </button>
                          <button
                            type="button"
                            data-testid="cancel-plan-btn"
                            onClick={() => setCancellingPlan(plan)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/18 transition-colors cursor-pointer"
                          >
                            Cancel Plan
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        data-testid="installment-progress-text"
                        className="text-[var(--text-muted)] font-medium"
                      >
                        {prog.paidInstallments} of {plan.tenureMonths} paid
                      </span>
                      <span
                        data-testid="installment-monthly-amount"
                        className="font-mono font-bold tabular-nums text-[var(--text)]"
                      >
                        {formatMoney(plan.monthlyAmountMinor)} / mo
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

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-[var(--border)] text-[var(--text-muted)]">
                    <span>Remaining Principal</span>
                    <span
                      data-testid="installment-remaining-amount"
                      className="font-mono font-extrabold text-sm tabular-nums text-[var(--text)]"
                    >
                      {formatMoney(prog.remainingPrincipalMinor)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isCalibrateOpen && (
        <CalibrationModal
          account={account}
          currentBalanceMinor={balance}
          isOpen={isCalibrateOpen}
          onClose={() => setIsCalibrateOpen(false)}
        />
      )}

      {isSettleOpen && cycle && (
        <SettleModal
          card={account}
          billedBalanceMinor={cycle.billedBalanceMinor}
          totalDebtMinor={cycle.outstandingDebtMinor}
          isOpen={isSettleOpen}
          onClose={() => setIsSettleOpen(false)}
        />
      )}

      {payoffPlan && (
        <EarlyPayoffModal
          plan={payoffPlan}
          remainingPrincipalMinor={payoffRemainingMinor}
          isOpen={!!payoffPlan}
          onClose={() => setPayoffPlan(null)}
        />
      )}

      {editingPlan && (
        <InstallmentPlanModal
          isOpen={!!editingPlan}
          onClose={() => setEditingPlan(null)}
          accounts={accounts}
          installmentPlan={editingPlan}
        />
      )}

      {selectedTxForEdit && (
        <TransactionEditModal
          transaction={selectedTxForEdit}
          isOpen={!!selectedTxForEdit}
          onClose={() => setSelectedTxForEdit(null)}
        />
      )}

      {cancellingPlan && (
        <ConfirmationModal
          isOpen={!!cancellingPlan}
          onClose={() => setCancellingPlan(null)}
          onConfirm={async () => {
            if (cancellingPlan.originalTransactionId) {
              await localUpdateTransaction(
                db,
                cancellingPlan.originalTransactionId,
                {
                  excludeFromBalance: false,
                  excludeFromStats: false,
                  installmentPlanId: null,
                }
              );
            }
            await localDeleteInstallmentPlan(db, cancellingPlan.id);
          }}
          title="Cancel Installment Plan"
          message={`Are you sure you want to cancel the installment plan for "${cancellingPlan.merchantName}"? Remaining installments will be cancelled and the original transaction will be restored to your active ledger.`}
          confirmText="Cancel Plan"
          variant="danger"
          icon="alert"
        />
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccounts,
  useFixedDeposits,
  useInstallmentPlans,
  useLoanPayments,
  useLoans,
  useSync,
  useTransactions,
} from "@/components/sync-provider";
import {
  LocalAccount,
} from "@/lib/db";
import { calculateLedgerBalance, LedgerTransaction } from "@/lib/finance-core/ledger";
import { calculateStatementCycle, calculateInstallmentProgress } from "@/lib/finance-core/credit-card";
import { calculateAccruedFdValue } from "@/lib/finance-core/investments";

export function useAccountPortfolio(showArchived: boolean, settlingCard: LocalAccount | null) {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const installmentPlans = useInstallmentPlans();
  const fixedDeposits = useFixedDeposits();
  const loans = useLoans();
  const loanPayments = useLoanPayments();
  const { db } = useSync();
  const [householdRoleMap, setHouseholdRoleMap] = useState<Map<string, string>>(new Map());
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/households", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.households) return;
        const map = new Map<string, string>();
        for (const household of data.households) {
          map.set(household.id, household.myRole);
        }
        setHouseholdRoleMap(map);
        setActiveHouseholdId(data.households[0]?.id ?? null);
      })
      .catch((error) => {
        console.error("Failed to load household roles:", error);
      });
  }, []);

  const ledgerTxList: LedgerTransaction[] = useMemo(
    () =>
      transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        toAccountId: transaction.toAccountId,
        amountMinor: transaction.amountMinor,
        type: transaction.type,
        direction: transaction.direction,
        transactionDate: transaction.transactionDate,
        excludeFromBalance: transaction.excludeFromBalance,
        deletedAt: transaction.deletedAt,
      })),
    [transactions]
  );

  const planProgressMap = useMemo(() => {
    const map = new Map<
      string,
      { paidInstallments: number; remainingInstallments: number; remainingPrincipalMinor: number }
    >();
    for (const plan of installmentPlans) {
      const billedAmounts = transactions
        .filter(
          (transaction) =>
            !transaction.deletedAt &&
            transaction.installmentPlanId === plan.id &&
            transaction.type === "EXPENSE" &&
            transaction.subType === "CC_INSTALLMENT"
        )
        .map((transaction) => transaction.amountMinor);
      map.set(
        plan.id,
        calculateInstallmentProgress(
          plan.totalAmountMinor,
          plan.tenureMonths,
          plan.initialPaidInstallments || 0,
          billedAmounts
        )
      );
    }
    return map;
  }, [installmentPlans, transactions]);

  const accountBlockedPrincipalMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const plan of installmentPlans) {
      if (plan.status !== "ACTIVE") continue;
      const progress = planProgressMap.get(plan.id);
      map[plan.accountId] = (map[plan.accountId] || 0) + (progress?.remainingPrincipalMinor ?? plan.totalAmountMinor);
    }
    return map;
  }, [installmentPlans, planProgressMap]);

  const totalBlockedPrincipal = useMemo(
    () =>
      installmentPlans.reduce((total, plan) => {
        if (plan.status !== "ACTIVE") return total;
        return total + (planProgressMap.get(plan.id)?.remainingPrincipalMinor ?? plan.totalAmountMinor);
      }, 0),
    [installmentPlans, planProgressMap]
  );

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    for (const account of accounts) {
      balances[account.id] = calculateLedgerBalance(
        {
          id: account.id,
          type: account.type,
          openingBalanceMinor: account.openingBalanceMinor,
        },
        ledgerTxList
      );
    }
    return balances;
  }, [accounts, ledgerTxList]);

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => showArchived || !account.isArchived),
    [accounts, showArchived]
  );
  const cashAccounts = useMemo(
    () => visibleAccounts.filter((account) => account.type === "CASH"),
    [visibleAccounts]
  );
  const bankAccounts = useMemo(
    () => visibleAccounts.filter((account) => account.type === "BANK_SAVINGS"),
    [visibleAccounts]
  );
  const creditAccounts = useMemo(
    () => visibleAccounts.filter((account) => account.type === "CREDIT_CARD"),
    [visibleAccounts]
  );

  const balanceFor = useCallback(
    (account: LocalAccount) => accountBalances[account.id] ?? account.openingBalanceMinor,
    [accountBalances]
  );
  const cashSubtotal = useMemo(
    () => cashAccounts.reduce((total, account) => total + balanceFor(account), 0),
    [cashAccounts, balanceFor]
  );
  const bankSubtotal = useMemo(
    () => bankAccounts.reduce((total, account) => total + balanceFor(account), 0),
    [bankAccounts, balanceFor]
  );
  const creditSubtotal = useMemo(
    () => creditAccounts.reduce((total, account) => total + balanceFor(account), 0),
    [creditAccounts, balanceFor]
  );
  const fixedDepositsSubtotal = useMemo(
    () =>
      fixedDeposits
        .filter((fixedDeposit) => fixedDeposit.status !== "CLOSED")
        .reduce((total, fixedDeposit) => total + calculateAccruedFdValue(fixedDeposit, new Date()), 0),
    [fixedDeposits]
  );
  const loanRemainingMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const loan of loans) {
      const paidPrincipal = loanPayments
        .filter((payment) => payment.loanId === loan.id)
        .reduce((total, payment) => total + payment.principalComponentMinor, 0);
      map.set(loan.id, Math.max(0, loan.originalPrincipalMinor - paidPrincipal));
    }
    return map;
  }, [loans, loanPayments]);
  const loansSubtotal = useMemo(
    () =>
      loans
        .filter((loan) => loan.status === "ACTIVE")
        .reduce((total, loan) => total + (loanRemainingMap.get(loan.id) ?? loan.originalPrincipalMinor), 0),
    [loans, loanRemainingMap]
  );

  const netWorth = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const account of visibleAccounts) {
      const balance = balanceFor(account);
      if (account.type === "CREDIT_CARD") {
        liabilities += (balance < 0 ? Math.abs(balance) : 0) + (accountBlockedPrincipalMap[account.id] || 0);
        if (balance > 0) assets += balance;
      } else if (balance >= 0) {
        assets += balance;
      } else {
        liabilities += Math.abs(balance);
      }
    }
    assets += fixedDepositsSubtotal;
    liabilities += loansSubtotal;
    return { assetsTotal: assets, liabilitiesTotal: liabilities, netWorthTotal: assets - liabilities };
  }, [visibleAccounts, balanceFor, accountBlockedPrincipalMap, fixedDepositsSubtotal, loansSubtotal]);

  const settlingCardCycle = useMemo(() => {
    if (!settlingCard) return null;
    return calculateStatementCycle({
      account: {
        id: settlingCard.id,
        type: settlingCard.type,
        openingBalanceMinor: settlingCard.openingBalanceMinor,
      },
      transactions: ledgerTxList,
      creditLimitMinor: settlingCard.creditLimitMinor || 0,
      statementCutoffDay: settlingCard.statementCutoffDay || 20,
      paymentDueDay: settlingCard.paymentDueDay || 10,
      blockedPrincipalMinor: accountBlockedPrincipalMap[settlingCard.id] || 0,
    });
  }, [settlingCard, ledgerTxList, accountBlockedPrincipalMap]);

  return {
    accounts,
    transactions,
    installmentPlans,
    fixedDeposits,
    loans,
    loanPayments,
    db,
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
    bankSubtotal,
    creditSubtotal,
    fixedDepositsSubtotal,
    loanRemainingMap,
    loansSubtotal,
    ...netWorth,
    settlingCardCycle,
    householdRoleMap,
    activeHouseholdId,
    balanceFor,
  };
}

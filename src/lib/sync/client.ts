import { v4 as uuidv4 } from "uuid";
import {
  HardMoneyDB,
  LocalAccount,
  LocalBudget,
  LocalBudgetMonthSnapshot,
  LocalCategory,
  LocalCreditCardStatement,
  LocalInstallmentPlan,
  LocalFixedDeposit,
  LocalFixedDepositPayout,
  LocalLoan,
  LocalLoanScheduleEntry,
  LocalLoanPayment,
  LocalTemplate,
  LocalTransaction,
  OutboxMutation,
} from "../db";

export type SyncState = "idle" | "syncing" | "offline" | "error";

export async function syncNow(
  db: HardMoneyDB,
  onStateChange: (state: SyncState) => void
): Promise<void> {
  onStateChange("syncing");

  // Step 1: Push pending mutations from outbox
  try {
    const pending = await db.outbox.where("status").equals("pending").toArray();
    if (pending.length > 0) {
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: pending }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          onStateChange("idle");
          return;
        }
        throw new Error(`Push HTTP error: ${res.status}`);
      }

      const data = await res.json();
      for (const result of data.results || []) {
        if (result.status === "accepted") {
          await db.outbox.delete(result.mutationId);
        } else {
          await db.outbox.update(result.mutationId, {
            status: "failed",
            errorReason: result.reason || "Rejected by server",
          });
        }
      }
    }
  } catch (err) {
    console.warn("Sync push failed:", err);
    onStateChange("offline");
    return;
  }

  // Step 2: Pull delta changes from server
  try {
    const cursorMeta = await db.syncMeta.get("cursor");
    const cursor = cursorMeta ? cursorMeta.value : 0;

    const res = await fetch(`/api/sync/pull?cursor=${cursor}`);
    if (!res.ok) {
      if (res.status === 401) {
        onStateChange("idle");
        return;
      }
      throw new Error(`Pull HTTP error: ${res.status}`);
    }

    const data: {
      cursor?: number;
      activeHouseholdIds?: string[];
      contributorHouseholdIds?: string[];
      accounts?: LocalAccount[];
      categories?: LocalCategory[];
      transactions?: LocalTransaction[];
      templates?: LocalTemplate[];
      budgets?: LocalBudget[];
      budgetSnapshots?: LocalBudgetMonthSnapshot[];
      creditCardStatements?: LocalCreditCardStatement[];
      installmentPlans?: LocalInstallmentPlan[];
      fixedDeposits?: LocalFixedDeposit[];
      fixedDepositPayouts?: LocalFixedDepositPayout[];
      loans?: LocalLoan[];
      loanScheduleEntries?: LocalLoanScheduleEntry[];
      loanPayments?: LocalLoanPayment[];
    } = await res.json();

    await db.transaction(
      "rw",
      [
        db.accounts,
        db.categories,
        db.transactions,
        db.templates,
        db.budgets,
        db.budgetSnapshots,
        db.creditCardStatements,
        db.installmentPlans,
        db.fixedDeposits,
        db.fixedDepositPayouts,
        db.loans,
        db.loanScheduleEntries,
        db.loanPayments,
        db.syncMeta,
      ],
      async () => {
        // Accounts
        for (const a of data.accounts || []) {
          if (a.deletedAt) {
            await db.accounts.delete(a.id);
          } else {
            await db.accounts.put(a);
          }
        }
        // Categories
        for (const c of data.categories || []) {
          if (c.deletedAt) {
            await db.categories.delete(c.id);
          } else {
            await db.categories.put(c);
          }
        }
        // Transactions
        for (const t of data.transactions || []) {
          if (t.deletedAt) {
            await db.transactions.delete(t.id);
          } else {
            await db.transactions.put(t);
          }
        }
        // Templates
        for (const tmpl of data.templates || []) {
          if (tmpl.deletedAt) {
            await db.templates.delete(tmpl.id);
          } else {
            await db.templates.put(tmpl);
          }
        }
        // Budgets
        for (const b of data.budgets || []) {
          if (b.deletedAt) {
            await db.budgets.delete(b.id);
          } else {
            await db.budgets.put(b);
          }
        }
        // Budget Snapshots
        for (const bs of data.budgetSnapshots || []) {
          await db.budgetSnapshots.put(bs);
        }
        // Credit Card Statements
        for (const ccs of data.creditCardStatements || []) {
          await db.creditCardStatements.put(ccs);
        }
        // Installment Plans
        for (const plan of data.installmentPlans || []) {
          if (plan.deletedAt) {
            await db.installmentPlans.delete(plan.id);
          } else {
            await db.installmentPlans.put(plan);
          }
        }
        // Fixed Deposits
        for (const fd of data.fixedDeposits || []) {
          if (fd.deletedAt) {
            await db.fixedDeposits.delete(fd.id);
          } else {
            await db.fixedDeposits.put(fd);
          }
        }
        // Fixed Deposit Payouts
        for (const fdp of data.fixedDepositPayouts || []) {
          await db.fixedDepositPayouts.put(fdp);
        }
        // Loans
        for (const l of data.loans || []) {
          if (l.deletedAt) {
            await db.loans.delete(l.id);
          } else {
            await db.loans.put(l);
          }
        }
        // Loan Schedule Entries
        for (const se of data.loanScheduleEntries || []) {
          if (se.deletedAt) {
            await db.loanScheduleEntries.delete(se.id);
          } else {
            await db.loanScheduleEntries.put(se);
          }
        }
        // Loan Payments
        for (const lp of data.loanPayments || []) {
          await db.loanPayments.put(lp);
        }

        // Purge locally cached shared data for households the user is no longer a member of
        if (Array.isArray(data.activeHouseholdIds)) {
          const activeSet = new Set(data.activeHouseholdIds);

          const localAccounts = await db.accounts.toArray();
          for (const a of localAccounts) {
            if (a.householdId && !activeSet.has(a.householdId)) {
              await db.accounts.delete(a.id);
            }
          }

          const localTxs = await db.transactions.toArray();
          for (const t of localTxs) {
            if (t.householdId && !activeSet.has(t.householdId)) {
              await db.transactions.delete(t.id);
            }
          }

          const localFds = await db.fixedDeposits.toArray();
          for (const fd of localFds) {
            if (fd.householdId && !activeSet.has(fd.householdId)) {
              await db.fixedDeposits.delete(fd.id);
            }
          }

          const localLoans = await db.loans.toArray();
          for (const l of localLoans) {
            if (l.householdId && !activeSet.has(l.householdId)) {
              await db.loans.delete(l.id);
            }
          }
        }

        // Purge FDs and Loans for households where the user is CONTRIBUTOR_ADD_ONLY
        if (Array.isArray(data.contributorHouseholdIds)) {
          const contribSet = new Set(data.contributorHouseholdIds);

          const localFds = await db.fixedDeposits.toArray();
          for (const fd of localFds) {
            if (fd.householdId && contribSet.has(fd.householdId)) {
              await db.fixedDeposits.delete(fd.id);
            }
          }

          const localLoans = await db.loans.toArray();
          for (const l of localLoans) {
            if (l.householdId && contribSet.has(l.householdId)) {
              await db.loans.delete(l.id);
            }
          }
        }

        if (data.cursor !== undefined) {
          await db.syncMeta.put({ key: "cursor", value: data.cursor });
        }
        await db.syncMeta.put({ key: "lastSyncedAt", value: new Date().toISOString() });
      }
    );
  } catch (err) {
    console.warn("Sync pull failed:", err);
    onStateChange("offline");
    return;
  }

  // Check if any failed mutations exist
  const failedCount = await db.outbox.where("status").equals("failed").count();
  if (failedCount > 0) {
    onStateChange("error");
  } else {
    onStateChange("idle");
  }
}

// Local entity mutators that write to local store immediately and record outbox mutations

export async function localCreateAccount(
  db: HardMoneyDB,
  account: Omit<LocalAccount, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalAccount> {
  const now = new Date().toISOString();
  const id = account.id || uuidv4();
  const fullAccount: LocalAccount = {
    ...account,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "CREATE",
    id,
    payload: fullAccount,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.put(fullAccount);
    await db.outbox.add(mutation);
  });

  return fullAccount;
}

export async function localUpdateAccount(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalAccount>
): Promise<void> {
  const existing = await db.accounts.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteAccount(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateCategory(
  db: HardMoneyDB,
  category: Omit<LocalCategory, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalCategory> {
  const now = new Date().toISOString();
  const id = category.id || uuidv4();
  const fullCategory: LocalCategory = {
    ...category,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "CREATE",
    id,
    payload: fullCategory,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.put(fullCategory);
    await db.outbox.add(mutation);
  });

  return fullCategory;
}

export async function localUpdateCategory(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalCategory>
): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteCategory(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateTransaction(
  db: HardMoneyDB,
  tx: Omit<LocalTransaction, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalTransaction> {
  const now = new Date().toISOString();
  const id = tx.id || uuidv4();

  let householdId = tx.householdId || null;
  if (!householdId && tx.accountId) {
    const acc = await db.accounts.get(tx.accountId);
    if (acc?.householdId) {
      householdId = acc.householdId;
    }
  }

  const fullTx: LocalTransaction = {
    ...tx,
    id,
    householdId,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "CREATE",
    id,
    payload: fullTx,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(fullTx);
    await db.outbox.add(mutation);
  });

  return fullTx;
}

export async function localUpdateTransaction(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalTransaction>
): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalTransaction = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteTransaction(db: HardMoneyDB, id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  const now = new Date().toISOString();

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    if (existing) {
      await db.transactions.delete(id);
    }
    await db.outbox.add(mutation);
  });
}

export async function localRestoreTransaction(db: HardMoneyDB, tx: LocalTransaction): Promise<void> {
  const now = new Date().toISOString();
  const restoredTx = { ...tx, deletedAt: null, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "CREATE",
    id: tx.id,
    payload: restoredTx,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(restoredTx);
    await db.outbox.add(mutation);
  });
}

export async function localCreateTemplate(
  db: HardMoneyDB,
  tmpl: Omit<LocalTemplate, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalTemplate> {
  const now = new Date().toISOString();
  const id = tmpl.id || uuidv4();
  const fullTmpl: LocalTemplate = {
    ...tmpl,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "CREATE",
    id,
    payload: fullTmpl,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.put(fullTmpl);
    await db.outbox.add(mutation);
  });

  return fullTmpl;
}

export async function localUpdateTemplate(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalTemplate>
): Promise<void> {
  const existing = await db.templates.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalTemplate = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteTemplate(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateBudget(
  db: HardMoneyDB,
  budget: Omit<LocalBudget, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalBudget> {
  const now = new Date().toISOString();
  const id = budget.id || uuidv4();
  const fullBudget: LocalBudget = {
    ...budget,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "CREATE",
    id,
    payload: {
      id,
      userId: budget.userId,
      categoryId: budget.categoryId,
      monthlyLimitMinor: budget.monthlyLimitMinor,
      enableRollover: budget.enableRollover ?? false,
      rolloverStartMonth: budget.rolloverStartMonth || null,
    },
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.put(fullBudget);
    await db.outbox.add(mutation);
  });

  return fullBudget;
}

export async function localUpdateBudget(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalBudget>
): Promise<void> {
  const existing = await db.budgets.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalBudget = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteBudget(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateInstallmentPlan(
  db: HardMoneyDB,
  plan: Omit<LocalInstallmentPlan, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalInstallmentPlan> {
  const now = new Date().toISOString();
  const id = plan.id || uuidv4();
  const fullPlan: LocalInstallmentPlan = {
    ...plan,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "CREATE",
    id,
    payload: fullPlan,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.put(fullPlan);
    await db.outbox.add(mutation);
  });

  return fullPlan;
}

export async function localUpdateInstallmentPlan(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalInstallmentPlan>
): Promise<void> {
  const existing = await db.installmentPlans.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalInstallmentPlan = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteInstallmentPlan(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateFixedDeposit(
  db: HardMoneyDB,
  fd: Omit<import("../db").LocalFixedDeposit, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<import("../db").LocalFixedDeposit> {
  const now = new Date().toISOString();
  const id = fd.id || uuidv4();
  const fullFd: import("../db").LocalFixedDeposit = {
    ...fd,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "fixedDeposit",
    op: "CREATE",
    id,
    payload: fullFd,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.fixedDeposits, db.transactions, db.outbox], async () => {
    await db.fixedDeposits.put(fullFd);
    if (fullFd.fundingAccountId && fullFd.principalAmountMinor > 0) {
      const placementTxId = `${id}-placement`;
      const placementTx: import("../db").LocalTransaction = {
        id: placementTxId,
        userId: fullFd.userId || "",
        accountId: fullFd.fundingAccountId,
        amountMinor: fullFd.principalAmountMinor,
        type: "EXPENSE",
        subType: "FD_PLACEMENT",
        source: "SYSTEM",
        isSplit: false,
        createdByUserId: fullFd.userId || "",
        updatedByUserId: fullFd.userId || "",
        transactionDate: fullFd.startDate || now,
        note: `Fixed Deposit Placement: ${fullFd.bankName}`,
        excludeFromBudget: true,
        excludeFromStats: true,
        excludeFromBalance: false,
        serverSeq: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.put(placementTx);
    }
    await db.outbox.add(mutation);
  });

  return fullFd;
}

export async function localUpdateFixedDeposit(
  db: HardMoneyDB,
  id: string,
  patch: Partial<import("../db").LocalFixedDeposit>
): Promise<void> {
  const existing = await db.fixedDeposits.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: import("../db").LocalFixedDeposit = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "fixedDeposit",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.fixedDeposits, db.outbox], async () => {
    await db.fixedDeposits.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteFixedDeposit(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "fixedDeposit",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.fixedDeposits, db.outbox], async () => {
    await db.fixedDeposits.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateLoan(
  db: HardMoneyDB,
  loan: Omit<import("../db").LocalLoan, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<import("../db").LocalLoan> {
  const now = new Date().toISOString();
  const id = loan.id || uuidv4();

  // Generate schedule rows
  const { generateAmortizationSchedule } = await import("../finance-core/loans");
  const scheduleRows = generateAmortizationSchedule(
    loan.originalPrincipalMinor,
    loan.annualInterestRateBps,
    loan.tenureMonths,
    loan.calculationType,
    loan.residualValueMinor || 0
  );

  const monthlyEmi = loan.monthlyEmiAmountMinor || scheduleRows[0]?.emiAmountMinor || 0;

  const fullLoan: import("../db").LocalLoan = {
    ...loan,
    monthlyEmiAmountMinor: monthlyEmi,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const loanMutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "loan",
    op: "CREATE",
    id,
    payload: fullLoan,
    createdAt: now,
    status: "pending",
  };

  const baseDate = new Date(fullLoan.startDate || now);
  const entries: import("../db").LocalLoanScheduleEntry[] = [];
  const entryMutations: OutboxMutation[] = [];

  for (const row of scheduleRows) {
    const entryId = uuidv4();
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + row.installmentNumber);

    const entry: import("../db").LocalLoanScheduleEntry = {
      id: entryId,
      loanId: id,
      installmentNumber: row.installmentNumber,
      dueDate: dueDate.toISOString(),
      principalComponentMinor: row.principalComponentMinor,
      interestComponentMinor: row.interestComponentMinor,
      openingBalanceMinor: row.openingBalanceMinor,
      closingBalanceMinor: row.closingBalanceMinor,
      status: "SCHEDULED",
      serverSeq: 0,
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);

    entryMutations.push({
      mutationId: uuidv4(),
      entity: "loanScheduleEntry",
      op: "CREATE",
      id: entryId,
      payload: entry,
      createdAt: now,
      status: "pending",
    });
  }

  await db.transaction(
    "rw",
    [db.loans, db.loanScheduleEntries, db.transactions, db.outbox],
    async () => {
      await db.loans.put(fullLoan);
      for (const entry of entries) {
        await db.loanScheduleEntries.put(entry);
      }
      if (fullLoan.linkedDisbursementAccountId && fullLoan.originalPrincipalMinor > 0) {
        const disbursementTxId = `${id}-disbursement`;
        const disbursementTx: import("../db").LocalTransaction = {
          id: disbursementTxId,
          userId: fullLoan.userId || "",
          accountId: fullLoan.linkedDisbursementAccountId,
          amountMinor: fullLoan.originalPrincipalMinor,
          type: "INCOME",
          subType: "LOAN_DISBURSEMENT",
          source: "SYSTEM",
          isSplit: false,
          createdByUserId: fullLoan.userId || "",
          updatedByUserId: fullLoan.userId || "",
          transactionDate: fullLoan.startDate || now,
          note: `${fullLoan.kind === "LEASE" ? "Lease" : "Loan"} Disbursement: ${fullLoan.lenderName}`,
          excludeFromBudget: true,
          excludeFromStats: true,
          excludeFromBalance: false,
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.transactions.put(disbursementTx);
      }
      await db.outbox.add(loanMutation);
      for (const m of entryMutations) {
        await db.outbox.add(m);
      }
    }
  );

  return fullLoan;
}

export async function localUpdateLoan(
  db: HardMoneyDB,
  id: string,
  patch: Partial<import("../db").LocalLoan>
): Promise<void> {
  const existing = await db.loans.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: import("../db").LocalLoan = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "loan",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.loans, db.outbox], async () => {
    await db.loans.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteLoan(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "loan",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.loans, db.loanScheduleEntries, db.outbox], async () => {
    await db.loans.delete(id);
    const entries = await db.loanScheduleEntries.where("loanId").equals(id).toArray();
    for (const e of entries) {
      await db.loanScheduleEntries.delete(e.id);
    }
    await db.outbox.add(mutation);
  });
}

export async function localCreateLoanPayment(
  db: HardMoneyDB,
  payment: Omit<import("../db").LocalLoanPayment, "id" | "serverSeq" | "createdAt"> & { id?: string }
): Promise<import("../db").LocalLoanPayment> {
  const now = new Date().toISOString();
  const id = payment.id || uuidv4();
  const fullPayment: import("../db").LocalLoanPayment = {
    ...payment,
    id,
    serverSeq: 0,
    createdAt: now,
  };

  const paymentMutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "loanPayment",
    op: "CREATE",
    id,
    payload: fullPayment,
    createdAt: now,
    status: "pending",
  };

  await db.transaction(
    "rw",
    [db.loanPayments, db.loanScheduleEntries, db.loans, db.outbox],
    async () => {
      await db.loanPayments.put(fullPayment);
      await db.outbox.add(paymentMutation);

      if (fullPayment.scheduleEntryId) {
        const entry = await db.loanScheduleEntries.get(fullPayment.scheduleEntryId);
        if (entry) {
          const updatedEntry: import("../db").LocalLoanScheduleEntry = {
            ...entry,
            status: "PAID",
            updatedAt: now,
          };
          await db.loanScheduleEntries.put(updatedEntry);

          const entryMutation: OutboxMutation = {
            mutationId: uuidv4(),
            entity: "loanScheduleEntry",
            op: "UPDATE",
            id: entry.id,
            payload: { status: "PAID" },
            createdAt: now,
            status: "pending",
          };
          await db.outbox.add(entryMutation);
        }
      }

      // Check if all entries for this loan are now PAID
      const remainingScheduled = await db.loanScheduleEntries
        .where("loanId")
        .equals(fullPayment.loanId)
        .filter((e) => e.status !== "PAID")
        .count();

      if (remainingScheduled === 0) {
        const loan = await db.loans.get(fullPayment.loanId);
        if (loan && loan.status !== "CLOSED") {
          const updatedLoan: import("../db").LocalLoan = {
            ...loan,
            status: "CLOSED",
            closedAt: now,
            updatedAt: now,
          };
          await db.loans.put(updatedLoan);

          const loanMutation: OutboxMutation = {
            mutationId: uuidv4(),
            entity: "loan",
            op: "UPDATE",
            id: loan.id,
            payload: { status: "CLOSED", closedAt: now },
            createdAt: now,
            status: "pending",
          };
          await db.outbox.add(loanMutation);
        }
      }
    }
  );

  return fullPayment;
}

export async function localUpdateLoanScheduleEntry(
  db: HardMoneyDB,
  id: string,
  patch: Partial<import("../db").LocalLoanScheduleEntry>
): Promise<void> {
  const existing = await db.loanScheduleEntries.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: import("../db").LocalLoanScheduleEntry = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "loanScheduleEntry",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.loanScheduleEntries, db.outbox], async () => {
    await db.loanScheduleEntries.put(updated);
    await db.outbox.add(mutation);
  });
}




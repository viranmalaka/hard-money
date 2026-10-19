import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursorParam = searchParams.get("cursor") || "0";
  const cursor = BigInt(cursorParam);

  // Look up user's active household memberships and capability matrix roles
  const memberships = await prisma.householdMember.findMany({
    where: { userId: user.id },
  });
  const householdRoleMap = new Map<string, string>();
  for (const m of memberships) {
    householdRoleMap.set(m.householdId, m.role);
  }
  const allHouseholdIds = Array.from(householdRoleMap.keys());
  const fullReadHouseholdIds = allHouseholdIds.filter(
    (id) => householdRoleMap.get(id) !== "CONTRIBUTOR_ADD_ONLY"
  );
  const contributorHouseholdIds = allHouseholdIds.filter(
    (id) => householdRoleMap.get(id) === "CONTRIBUTOR_ADD_ONLY"
  );

  const [
    accounts,
    categories,
    transactions,
    templates,
    budgets,
    budgetSnapshots,
    creditCardStatements,
    installmentPlans,
    fixedDeposits,
    fixedDepositPayouts,
    loans,
    loanScheduleEntries,
    loanPayments,
  ] = await Promise.all([
    prisma.account.findMany({
      where: {
        OR: [
          { userId: user.id },
          { householdId: { in: allHouseholdIds }, accessScope: "SHARED_HOUSEHOLD" },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.category.findMany({
      where: {
        OR: [
          { userId: user.id },
          { userId: null },
          { householdId: { in: allHouseholdIds } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        OR: [
          { userId: user.id },
          { householdId: { in: fullReadHouseholdIds } },
          { householdId: { in: contributorHouseholdIds }, createdByUserId: user.id },
        ],
        serverSeq: { gt: cursor },
      },
      include: {
        splitItems: true,
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.transactionTemplate.findMany({
      where: {
        userId: user.id,
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.budget.findMany({
      where: {
        OR: [
          { userId: user.id },
          { category: { householdId: { in: fullReadHouseholdIds } } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.budgetMonthSnapshot.findMany({
      where: {
        OR: [
          { userId: user.id },
          { category: { householdId: { in: fullReadHouseholdIds } } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.creditCardStatement.findMany({
      where: {
        userId: user.id,
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.creditCardInstallmentPlan.findMany({
      where: {
        userId: user.id,
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.fixedDeposit.findMany({
      where: {
        OR: [
          { userId: user.id },
          { householdId: { in: fullReadHouseholdIds } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.fixedDepositPayout.findMany({
      where: {
        OR: [
          { fixedDeposit: { userId: user.id } },
          { fixedDeposit: { householdId: { in: fullReadHouseholdIds } } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.loan.findMany({
      where: {
        OR: [
          { userId: user.id },
          { householdId: { in: fullReadHouseholdIds } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.loanScheduleEntry.findMany({
      where: {
        OR: [
          { loan: { userId: user.id } },
          { loan: { householdId: { in: fullReadHouseholdIds } } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.loanPayment.findMany({
      where: {
        OR: [
          { loan: { userId: user.id } },
          { loan: { householdId: { in: fullReadHouseholdIds } } },
        ],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
  ]);

  let maxSeq = cursor;
  for (const a of accounts) {
    if (a.serverSeq > maxSeq) maxSeq = a.serverSeq;
  }
  for (const c of categories) {
    if (c.serverSeq > maxSeq) maxSeq = c.serverSeq;
  }
  for (const t of transactions) {
    if (t.serverSeq > maxSeq) maxSeq = t.serverSeq;
  }
  for (const tmpl of templates) {
    if (tmpl.serverSeq > maxSeq) maxSeq = tmpl.serverSeq;
  }
  for (const b of budgets) {
    if (b.serverSeq > maxSeq) maxSeq = b.serverSeq;
  }
  for (const bs of budgetSnapshots) {
    if (bs.serverSeq > maxSeq) maxSeq = bs.serverSeq;
  }
  for (const ccs of creditCardStatements) {
    if (ccs.serverSeq > maxSeq) maxSeq = ccs.serverSeq;
  }
  for (const plan of installmentPlans) {
    if (plan.serverSeq > maxSeq) maxSeq = plan.serverSeq;
  }
  for (const fd of fixedDeposits) {
    if (fd.serverSeq > maxSeq) maxSeq = fd.serverSeq;
  }
  for (const fdp of fixedDepositPayouts) {
    if (fdp.serverSeq > maxSeq) maxSeq = fdp.serverSeq;
  }
  for (const l of loans) {
    if (l.serverSeq > maxSeq) maxSeq = l.serverSeq;
  }
  for (const se of loanScheduleEntries) {
    if (se.serverSeq > maxSeq) maxSeq = se.serverSeq;
  }
  for (const lp of loanPayments) {
    if (lp.serverSeq > maxSeq) maxSeq = lp.serverSeq;
  }

  const serializedAccounts = accounts.map((a: any) => {
    const isContributor =
      a.householdId &&
      householdRoleMap.get(a.householdId) === "CONTRIBUTOR_ADD_ONLY" &&
      a.userId !== user.id;

    return {
      ...a,
      serverSeq: Number(a.serverSeq),
      openingBalanceMinor: isContributor ? 0 : a.openingBalanceMinor,
      balanceCacheMinor: isContributor ? null : a.balanceCacheMinor,
      creditLimitMinor: isContributor ? null : a.creditLimitMinor,
    };
  });

  const serializedCategories = categories.map((c: any) => ({
    ...c,
    serverSeq: Number(c.serverSeq),
  }));

  const creatorUserIds = Array.from(
    new Set(transactions.map((t: any) => t.createdByUserId).filter(Boolean))
  ) as string[];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorUserIds } },
    select: { id: true, name: true },
  });
  const creatorMap = new Map<string, string>();
  for (const c of creators) {
    creatorMap.set(c.id, c.name);
  }

  const serializedTransactions = transactions.map((t: any) => ({
    ...t,
    serverSeq: Number(t.serverSeq),
    transactionDate: t.transactionDate.toISOString(),
    splitItems: t.splitItems || [],
    authorName: creatorMap.get(t.createdByUserId) || null,
  }));

  const serializedTemplates = templates.map((tmpl) => ({
    ...tmpl,
    serverSeq: Number(tmpl.serverSeq),
  }));

  const serializedBudgets = budgets.map((b) => ({
    ...b,
    serverSeq: Number(b.serverSeq),
  }));

  const serializedBudgetSnapshots = budgetSnapshots.map((bs) => ({
    ...bs,
    serverSeq: Number(bs.serverSeq),
  }));

  const serializedCreditCardStatements = creditCardStatements.map((ccs) => ({
    ...ccs,
    serverSeq: Number(ccs.serverSeq),
    cycleStartDate: ccs.cycleStartDate.toISOString(),
    cycleCutoffDate: ccs.cycleCutoffDate.toISOString(),
    dueDate: ccs.dueDate.toISOString(),
  }));

  const serializedInstallmentPlans = installmentPlans.map((plan) => ({
    ...plan,
    serverSeq: Number(plan.serverSeq),
    startDate: plan.startDate.toISOString(),
    firstStatementDate: plan.firstStatementDate.toISOString(),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    deletedAt: plan.deletedAt ? plan.deletedAt.toISOString() : null,
  }));

  const serializedFixedDeposits = fixedDeposits.map((fd) => ({
    ...fd,
    serverSeq: Number(fd.serverSeq),
    startDate: fd.startDate.toISOString(),
    maturityDate: fd.maturityDate.toISOString(),
    closedAt: fd.closedAt ? fd.closedAt.toISOString() : null,
    createdAt: fd.createdAt.toISOString(),
    updatedAt: fd.updatedAt.toISOString(),
    deletedAt: fd.deletedAt ? fd.deletedAt.toISOString() : null,
  }));

  const serializedFixedDepositPayouts = fixedDepositPayouts.map((fdp) => ({
    ...fdp,
    serverSeq: Number(fdp.serverSeq),
    periodEnd: fdp.periodEnd.toISOString(),
    createdAt: fdp.createdAt.toISOString(),
  }));

  const serializedLoans = loans.map((l) => ({
    ...l,
    serverSeq: Number(l.serverSeq),
    startDate: l.startDate.toISOString(),
    closedAt: l.closedAt ? l.closedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    deletedAt: l.deletedAt ? l.deletedAt.toISOString() : null,
  }));

  const serializedLoanScheduleEntries = loanScheduleEntries.map((se) => ({
    ...se,
    serverSeq: Number(se.serverSeq),
    dueDate: se.dueDate.toISOString(),
    createdAt: se.createdAt.toISOString(),
    updatedAt: se.updatedAt.toISOString(),
    deletedAt: se.deletedAt ? se.deletedAt.toISOString() : null,
  }));

  const serializedLoanPayments = loanPayments.map((lp) => ({
    ...lp,
    serverSeq: Number(lp.serverSeq),
    paymentDate: lp.paymentDate.toISOString(),
    createdAt: lp.createdAt.toISOString(),
  }));

  return NextResponse.json({
    cursor: Number(maxSeq),
    activeHouseholdIds: allHouseholdIds,
    contributorHouseholdIds,
    accounts: serializedAccounts,
    categories: serializedCategories,
    transactions: serializedTransactions,
    templates: serializedTemplates,
    budgets: serializedBudgets,
    budgetSnapshots: serializedBudgetSnapshots,
    creditCardStatements: serializedCreditCardStatements,
    installmentPlans: serializedInstallmentPlans,
    fixedDeposits: serializedFixedDeposits,
    fixedDepositPayouts: serializedFixedDepositPayouts,
    loans: serializedLoans,
    loanScheduleEntries: serializedLoanScheduleEntries,
    loanPayments: serializedLoanPayments,
  });
}

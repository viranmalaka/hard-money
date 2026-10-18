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

  const [accounts, categories, transactions, templates, budgets, budgetSnapshots, creditCardStatements] = await Promise.all([
    prisma.account.findMany({
      where: {
        userId: user.id,
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.category.findMany({
      where: {
        OR: [{ userId: user.id }, { userId: null }],
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        userId: user.id,
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
        userId: user.id,
        serverSeq: { gt: cursor },
      },
      orderBy: { serverSeq: "asc" },
    }),
    prisma.budgetMonthSnapshot.findMany({
      where: {
        userId: user.id,
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

  const serializedAccounts = accounts.map((a) => ({
    ...a,
    serverSeq: Number(a.serverSeq),
  }));

  const serializedCategories = categories.map((c) => ({
    ...c,
    serverSeq: Number(c.serverSeq),
  }));

  const serializedTransactions = transactions.map((t) => ({
    ...t,
    serverSeq: Number(t.serverSeq),
    transactionDate: t.transactionDate.toISOString(),
    splitItems: t.splitItems || [],
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

  return NextResponse.json({
    cursor: Number(maxSeq),
    accounts: serializedAccounts,
    categories: serializedCategories,
    transactions: serializedTransactions,
    templates: serializedTemplates,
    budgets: serializedBudgets,
    budgetSnapshots: serializedBudgetSnapshots,
    creditCardStatements: serializedCreditCardStatements,
  });
}

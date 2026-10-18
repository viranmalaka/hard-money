import { NextRequest, NextResponse } from "next/server";
import { getServerNow, setServerNow, resetServerClock } from "@/lib/server-clock";
import { resetTestSyncHooks, addFailingMutationEntityId } from "@/lib/test-sync-hook";

// Mock gemini response queue for tests
const queuedGeminiResponses: unknown[] = [];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { slug } = await params;
  const action = slug[0];

  switch (action) {
    case "reset": {
      resetServerClock();
      resetTestSyncHooks();
      queuedGeminiResponses.length = 0;
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.creditCardStatement.deleteMany();
        await prisma.budgetMonthSnapshot.deleteMany();
        await prisma.budget.deleteMany();
        await prisma.transactionSplitItem.deleteMany();
        await prisma.transactionTemplate.deleteMany();
        await prisma.transaction.deleteMany();
        await prisma.account.deleteMany();
        await prisma.householdMember.deleteMany();
        await prisma.household.deleteMany();
        await prisma.category.deleteMany();
        await prisma.appliedMutation.deleteMany();
        await prisma.syncSequence.deleteMany();
        await prisma.user.deleteMany();
        try {
          await prisma.$executeRawUnsafe("ALTER SEQUENCE IF EXISTS global_server_seq RESTART WITH 1");
        } catch {
          // ignore
        }
      } catch (e) {
        console.error("Failed to reset database:", e);
      }
      return NextResponse.json({ ok: true, message: "Reset successful" });
    }

    case "clock": {
      const body = await request.json().catch(() => ({}));
      if (body.now) {
        setServerNow(body.now);
      } else {
        resetServerClock();
      }
      return NextResponse.json({ ok: true, now: getServerNow().toISOString() });
    }

    case "seed": {
      const body = await request.json().catch(() => ({}));
      const { prisma } = await import("@/lib/prisma");
      const { getNextServerSeq } = await import("@/lib/server-seq");

      if (Array.isArray(body.categories)) {
        for (const cat of body.categories) {
          const nextSeq = await getNextServerSeq();
          await prisma.category.upsert({
            where: { id: cat.id },
            create: {
              id: cat.id,
              userId: cat.userId || null,
              name: cat.name,
              icon: cat.icon || "📁",
              color: cat.color || "#10b981",
              serverSeq: nextSeq,
            },
            update: {
              name: cat.name,
              icon: cat.icon || "📁",
              color: cat.color || "#10b981",
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.accounts)) {
        for (const acc of body.accounts) {
          const nextSeq = await getNextServerSeq();
          await prisma.account.upsert({
            where: { id: acc.id },
            create: {
              id: acc.id,
              userId: acc.userId,
              name: acc.name,
              type: acc.type || "CASH",
              openingBalanceMinor: acc.openingBalanceMinor ?? 0,
              currency: acc.currency || "LKR",
              creditLimitMinor: acc.creditLimitMinor ?? null,
              statementCutoffDay: acc.statementCutoffDay ?? null,
              paymentDueDay: acc.paymentDueDay ?? null,
              serverSeq: nextSeq,
            },
            update: {
              name: acc.name,
              type: acc.type || "CASH",
              openingBalanceMinor: acc.openingBalanceMinor ?? 0,
              currency: acc.currency || "LKR",
              creditLimitMinor: acc.creditLimitMinor ?? null,
              statementCutoffDay: acc.statementCutoffDay ?? null,
              paymentDueDay: acc.paymentDueDay ?? null,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.budgets)) {
        for (const b of body.budgets) {
          const nextSeq = await getNextServerSeq();
          // Ensure category exists
          if (b.categoryId) {
            await prisma.category.upsert({
              where: { id: b.categoryId },
              create: {
                id: b.categoryId,
                userId: b.userId,
                name: "Budgeted Category",
                icon: "🛒",
                color: "#10b981",
                serverSeq: nextSeq,
              },
              update: {},
            });
          }
          await prisma.budget.upsert({
            where: {
              userId_categoryId: {
                userId: b.userId,
                categoryId: b.categoryId,
              },
            },
            create: {
              id: b.id,
              userId: b.userId,
              categoryId: b.categoryId,
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: b.enableRollover ?? false,
              rolloverStartMonth: b.rolloverStartMonth || null,
              serverSeq: nextSeq,
            },
            update: {
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: b.enableRollover ?? false,
              rolloverStartMonth: b.rolloverStartMonth || null,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.transactions)) {
        for (const t of body.transactions) {
          const nextSeq = await getNextServerSeq();
          // Ensure account exists
          if (t.accountId) {
            await prisma.account.upsert({
              where: { id: t.accountId },
              create: {
                id: t.accountId,
                userId: t.userId,
                name: "Cash Wallet",
                type: "CASH",
                openingBalanceMinor: 0,
                serverSeq: nextSeq,
              },
              update: {},
            });
          }
          await prisma.transaction.upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              userId: t.userId,
              accountId: t.accountId,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              amountMinor: t.amountMinor,
              type: t.type || "EXPENSE",
              direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
              source: t.source || "MANUAL",
              createdByUserId: t.userId,
              updatedByUserId: t.userId,
              transactionDate: new Date(t.transactionDate),
              note: t.note || null,
              isSplit: t.isSplit || false,
              excludeFromBudget: t.excludeFromBudget || false,
              excludeFromStats: t.excludeFromStats || false,
              excludeFromBalance: t.excludeFromBalance || false,
              serverSeq: nextSeq,
            },
            update: {
              amountMinor: t.amountMinor,
              type: t.type || "EXPENSE",
              transactionDate: new Date(t.transactionDate),
              excludeFromBudget: t.excludeFromBudget || false,
              serverSeq: nextSeq,
            },
          });
        }
      }

      return NextResponse.json({ ok: true, seeded: body });
    }

    case "tick": {
      const { runCronTick } = await import("@/lib/jobs/cron-runner");
      const result = await runCronTick({ now: getServerNow() });
      return NextResponse.json({ ok: true, tickedAt: getServerNow().toISOString(), result });
    }

    case "gemini": {
      const body = await request.json().catch(() => ({}));
      queuedGeminiResponses.push(body);
      return NextResponse.json({ ok: true, queueLength: queuedGeminiResponses.length });
    }

    case "fail-mutation": {
      const body = await request.json().catch(() => ({}));
      if (body.entityId) {
        addFailingMutationEntityId(body.entityId);
      }
      return NextResponse.json({ ok: true, entityId: body.entityId });
    }

    default:
      return new NextResponse("Not Found", { status: 404 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { slug } = await params;
  const action = slug[0];

  switch (action) {
    case "snapshot": {
      try {
        const { prisma } = await import("@/lib/prisma");
        const [accounts, categories, transactions, budgets, budgetSnapshots, creditCardStatements] = await Promise.all([
          prisma.account.findMany({ where: { deletedAt: null } }),
          prisma.category.findMany({ where: { deletedAt: null } }),
          prisma.transaction.findMany({ where: { deletedAt: null } }),
          prisma.budget.findMany({ where: { deletedAt: null } }),
          prisma.budgetMonthSnapshot.findMany(),
          prisma.creditCardStatement.findMany(),
        ]);

        const balances: Record<string, number> = {};
        for (const a of accounts) {
          balances[a.id] = a.openingBalanceMinor;
        }

        return NextResponse.json({
          now: getServerNow().toISOString(),
          accounts: accounts.map((a) => ({ ...a, serverSeq: Number(a.serverSeq) })),
          categories: categories.map((c) => ({ ...c, serverSeq: Number(c.serverSeq) })),
          transactions: transactions.map((t) => ({ ...t, serverSeq: Number(t.serverSeq) })),
          budgets: budgets.map((b) => ({ ...b, serverSeq: Number(b.serverSeq) })),
          budgetSnapshots: budgetSnapshots.map((bs) => ({ ...bs, serverSeq: Number(bs.serverSeq) })),
          creditCardStatements: creditCardStatements.map((ccs) => ({ ...ccs, serverSeq: Number(ccs.serverSeq) })),
          balances,
        });
      } catch (err: any) {
        console.error("SNAPSHOT ERROR:", err);
        return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
      }
    }

    default:
      return new NextResponse("Not Found", { status: 404 });
  }
}

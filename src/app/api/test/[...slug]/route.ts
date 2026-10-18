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
      return NextResponse.json({ ok: true, seeded: body });
    }

    case "tick": {
      return NextResponse.json({ ok: true, tickedAt: getServerNow().toISOString() });
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
        const [accounts, categories, transactions] = await Promise.all([
          prisma.account.findMany({ where: { deletedAt: null } }),
          prisma.category.findMany({ where: { deletedAt: null } }),
          prisma.transaction.findMany({ where: { deletedAt: null } }),
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

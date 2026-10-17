import { NextRequest, NextResponse } from "next/server";
import { getServerNow, setServerNow, resetServerClock } from "@/lib/server-clock";

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
      queuedGeminiResponses.length = 0;
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.householdMember.deleteMany();
        await prisma.household.deleteMany();
        await prisma.category.deleteMany();
        await prisma.user.deleteMany();
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
      return NextResponse.json({
        now: getServerNow().toISOString(),
        balances: {},
      });
    }

    default:
      return new NextResponse("Not Found", { status: 404 });
  }
}

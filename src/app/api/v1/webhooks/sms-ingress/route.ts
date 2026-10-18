import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processBankSms, isWorkerPaused } from "@/lib/sms/worker";

// In-memory sliding window rate limiter
const rateLimitWindowMs = 10000; // 10 seconds
const maxRequestsPerWindow = 5; // max 5 requests per 10 seconds
const requestTimestamps = new Map<string, number[]>();

export function resetRateLimits() {
  requestTimestamps.clear();
}

const IngressPayloadSchema = z.object({
  rawSms: z.string().min(1, "rawSms is required").max(2000, "rawSms is too long"),
  sender: z.string().min(1, "sender is required").max(100, "sender is too long"),
  receivedAt: z
    .string()
    .min(1, "receivedAt is required")
    .refine((val) => !isNaN(Date.parse(val)), "receivedAt must be a valid date string"),
});

export async function POST(request: NextRequest) {
  // 1. Auth via x-api-key header
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey.trim().length === 0) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const apiKeyHash = crypto.createHash("sha256").update(apiKey.trim()).digest("hex");
  const user = await prisma.user.findFirst({
    where: { apiKeyHash },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // 2. Rate limiting check
  const now = Date.now();
  const timestamps = requestTimestamps.get(apiKeyHash) || [];
  const recentTimestamps = timestamps.filter((t) => now - t < rateLimitWindowMs);

  if (recentTimestamps.length >= maxRequestsPerWindow) {
    return NextResponse.json(
      { error: "Too Many Requests", retryAfterSeconds: 10 },
      { status: 429 }
    );
  }

  recentTimestamps.push(now);
  requestTimestamps.set(apiKeyHash, recentTimestamps);

  // 3. Payload validation
  const body = await request.json().catch(() => null);
  const parsed = IngressPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        message: parsed.error.issues[0]?.message || "Invalid payload",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { rawSms, sender, receivedAt } = parsed.data;

  // 4. Deduplication
  const dedupeKey = crypto
    .createHash("sha256")
    .update(`${user.id}:${sender.trim()}:${receivedAt}:${rawSms}`)
    .digest("hex");

  const existing = await prisma.bankSms.findUnique({
    where: { dedupeKey },
  });

  if (existing) {
    return NextResponse.json(
      { status: "DUPLICATE", message: "Duplicate SMS ignored" },
      { status: 200 }
    );
  }

  // 5. Immediate archival as PENDING
  const bankSms = await prisma.bankSms.create({
    data: {
      userId: user.id,
      dedupeKey,
      sender: sender.trim(),
      rawMessage: rawSms,
      receivedAt: new Date(receivedAt),
      status: "PENDING",
    },
  });

  // 6. Asynchronous worker processing (if not paused)
  if (!isWorkerPaused()) {
    setTimeout(() => {
      processBankSms(bankSms.id).catch(() => {
        // Safe logging without raw message
        console.error("Worker failed for bank SMS id:", bankSms.id);
      });
    }, 0);
  }

  // 7. Immediate 202 Accepted
  return NextResponse.json(
    { status: "ACCEPTED", id: bankSms.id },
    { status: 202 }
  );
}

import { prisma } from "@/lib/prisma";
import { parseBankSmsTemplate, amountTextToMinor } from "./template-parser";
import { matchAccountForSms } from "./account-matcher";
import { parseWithGemini } from "./gemini-provider";
import { decryptAesGcm } from "@/lib/encryption";
import { ParsedTransactionPayload } from "./types";
import { ingestParsedBankSms } from "./ingestion";

let workerPaused = false;

export function setWorkerPaused(paused: boolean) {
  workerPaused = paused;
}

export function isWorkerPaused(): boolean {
  return workerPaused;
}

/**
 * Process a single BankSms record
 */
export async function processBankSms(smsId: string): Promise<void> {
  if (workerPaused) {
    return;
  }

  const updated = await prisma.bankSms.updateMany({
    where: { id: smsId, status: "PENDING" },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  if (updated.count === 0) {
    return;
  }

  const sms = await prisma.bankSms.findUnique({
    where: { id: smsId },
  });

  if (!sms) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: sms.userId },
  });

  // Step 2a: Template Parser
  const parseResult = parseBankSmsTemplate(sms.sender, sms.rawMessage);

  if (parseResult.matched && parseResult.payload) {
    const payload = parseResult.payload;

    // Non-transactional (OTP / Promo)
    if (!payload.isTransaction) {
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "IGNORED_NON_TX",
          parseMethod: "TEMPLATE",
          parsedPayload: payload as any,
        },
      });
      return;
    }

    // Validation Gate for Template
    const amountMinor = amountTextToMinor(payload.amountText);
    if (amountMinor <= 0) {
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "NEEDS_REVIEW",
          parseMethod: "TEMPLATE",
          parsedPayload: payload as any,
          reviewReason: "VALIDATION_FAILED",
          failureReason: "Amount must be greater than zero",
        },
      });
      return;
    }

    if (payload.transactionTimestamp) {
      const txTime = new Date(payload.transactionTimestamp).getTime();
      if (!isNaN(txTime) && txTime > Date.now() + 24 * 60 * 60 * 1000) {
        await prisma.bankSms.update({
          where: { id: smsId },
          data: {
            status: "NEEDS_REVIEW",
            parseMethod: "TEMPLATE",
            parsedPayload: payload as any,
            reviewReason: "VALIDATION_FAILED",
            failureReason: "Transaction timestamp is in the future",
          },
        });
        return;
      }
    }

    await ingestParsedBankSms({
      smsId,
      userId: sms.userId,
      sender: sms.sender,
      rawMessage: sms.rawMessage,
      receivedAt: sms.receivedAt,
      parseMethod: "TEMPLATE",
      payload,
    });
    return;
  }

  // Step 2b: Gemini Fallback
  if (!user?.geminiApiKeyEncrypted) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        reviewReason: "NO_GEMINI_KEY",
        failureReason: "No Gemini API key configured",
      },
    });
    return;
  }

  let userApiKey = "";
  try {
    userApiKey = decryptAesGcm(user.geminiApiKeyEncrypted);
  } catch {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        reviewReason: "NO_GEMINI_KEY",
        failureReason: "Failed to decrypt Gemini API key",
      },
    });
    return;
  }

  let payload: ParsedTransactionPayload;
  try {
    payload = await parseWithGemini({
      sender: sms.sender,
      rawMessage: sms.rawMessage,
      userApiKey,
      model: user.geminiModel || undefined,
    });
  } catch (err: any) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        parseMethod: "GEMINI",
        reviewReason: "VALIDATION_FAILED",
        failureReason: err?.message || "Invalid JSON returned from Gemini",
      },
    });
    return;
  }

  // Non-transactional parsed by Gemini
  if (!payload.isTransaction) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "IGNORED_NON_TX",
        parseMethod: "GEMINI",
        parsedPayload: payload as any,
      },
    });
    return;
  }

  // Confidence check
  if (payload.confidence === "LOW") {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        parseMethod: "GEMINI",
        parsedPayload: payload as any,
        reviewReason: "LOW_CONFIDENCE",
        failureReason: "Low AI parsing confidence",
      },
    });
    return;
  }

  // Amount sanity check
  const amountMinor = amountTextToMinor(payload.amountText);
  if (amountMinor <= 0) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        parseMethod: "GEMINI",
        parsedPayload: payload as any,
        reviewReason: "VALIDATION_FAILED",
        failureReason: "Amount must be greater than zero",
      },
    });
    return;
  }

  // Timestamp sanity check (> 24h into future)
  if (payload.transactionTimestamp) {
    const txTime = new Date(payload.transactionTimestamp).getTime();
    if (!isNaN(txTime) && txTime > Date.now() + 24 * 60 * 60 * 1000) {
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "NEEDS_REVIEW",
          parseMethod: "GEMINI",
          parsedPayload: payload as any,
          reviewReason: "VALIDATION_FAILED",
          failureReason: "Transaction timestamp is in the future",
        },
      });
      return;
    }
  }

  // Account matching
  const matchedAccount = await matchAccountForSms(
    sms.userId,
    sms.sender,
    payload.accountLast4
  );

  if (!matchedAccount) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        parseMethod: "GEMINI",
        parsedPayload: payload as any,
        reviewReason: "ACCOUNT_UNMATCHED",
      },
    });
    return;
  }

  // Auto-post mode check
  if (user.smsAutoPostMode === "ALWAYS_REVIEW_GEMINI") {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        parseMethod: "GEMINI",
        parsedPayload: payload as any,
        reviewReason: "ALWAYS_REVIEW",
      },
    });
    return;
  }

  // All gates passed: Auto-post transaction via Ingestion Service
  await ingestParsedBankSms({
    smsId,
    userId: sms.userId,
    sender: sms.sender,
    rawMessage: sms.rawMessage,
    receivedAt: sms.receivedAt,
    parseMethod: "GEMINI",
    payload,
  });
}

/**
 * Process all pending BankSms records
 */
export async function processAllPendingBankSms(userId?: string): Promise<number> {
  if (workerPaused) {
    return 0;
  }

  // Wait briefly if any SMS are currently in PROCESSING state
  for (let attempt = 0; attempt < 15; attempt++) {
    const inFlight = await prisma.bankSms.count({
      where: {
        status: "PROCESSING",
        ...(userId ? { userId } : {}),
      },
    });
    if (inFlight === 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  const pending = await prisma.bankSms.findMany({
    where: {
      status: "PENDING",
      ...(userId ? { userId } : {}),
    },
    select: { id: true },
  });

  for (const item of pending) {
    try {
      await processBankSms(item.id);
    } catch (e) {
      console.error(`Failed to process bank SMS ${item.id}:`, e);
    }
  }

  return pending.length;
}

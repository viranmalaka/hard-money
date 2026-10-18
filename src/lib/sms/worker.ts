import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { parseBankSmsTemplate, amountTextToMinor } from "./template-parser";
import { matchAccountForSms } from "./account-matcher";

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

  const sms = await prisma.bankSms.findUnique({
    where: { id: smsId },
  });

  if (!sms || sms.status !== "PENDING") {
    return;
  }

  await prisma.bankSms.update({
    where: { id: smsId },
    data: { attempts: { increment: 1 } },
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

    // Financial Transaction
    const amountMinor = amountTextToMinor(payload.amountText);
    const matchedAccount = await matchAccountForSms(
      sms.userId,
      sms.sender,
      payload.accountLast4
    );

    if (matchedAccount) {
      const nextSeq = await getNextServerSeq();
      const tx = await prisma.transaction.create({
        data: {
          userId: sms.userId,
          accountId: matchedAccount.id,
          amountMinor,
          type: payload.transactionType === "CREDIT" ? "INCOME" : "EXPENSE",
          subType: payload.channel,
          source: "SMS",
          note: payload.merchantOrEntity || sms.sender,
          transactionDate: sms.receivedAt,
          createdByUserId: sms.userId,
          updatedByUserId: sms.userId,
          serverSeq: nextSeq,
        },
      });

      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "PROCESSED",
          parseMethod: "TEMPLATE",
          parsedPayload: payload as any,
          transactionId: tx.id,
        },
      });
      return;
    } else {
      // Account unmatched
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "NEEDS_REVIEW",
          reviewReason: "ACCOUNT_UNMATCHED",
          parseMethod: "TEMPLATE",
          parsedPayload: payload as any,
        },
      });
      return;
    }
  }

  // No template match
  await prisma.bankSms.update({
    where: { id: smsId },
    data: {
      status: "NEEDS_REVIEW",
      reviewReason: "NO_GEMINI_KEY",
      failureReason: "No template matched and no Gemini fallback configured",
    },
  });
}

/**
 * Process all pending BankSms records
 */
export async function processAllPendingBankSms(userId?: string): Promise<number> {
  if (workerPaused) {
    return 0;
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

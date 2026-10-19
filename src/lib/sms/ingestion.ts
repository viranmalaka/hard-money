import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getNextServerSeq } from "@/lib/server-seq";
import { amountTextToMinor } from "./template-parser";
import { ParsedTransactionPayload } from "./types";
import { matchAccountForSms } from "./account-matcher";

export interface IngestParsedSmsOptions {
  smsId: string;
  userId: string;
  sender: string;
  rawMessage: string;
  receivedAt: Date;
  parseMethod: "TEMPLATE" | "GEMINI";
  payload: ParsedTransactionPayload;
}

export interface IngestionResult {
  status: "PROCESSED" | "NEEDS_REVIEW" | "DUPLICATE";
  reviewReason?: string;
  transactionId?: string;
  isMatchedManual?: boolean;
}

/**
 * Transaction Ingestion Service (PRD 4.S1 Step 3)
 * Handles account resolution, two-way deduplication, channel routing,
 * ATM fee rules, fee-SMS dedupe, and balance mismatch hints.
 */
export async function ingestParsedBankSms(
  options: IngestParsedSmsOptions
): Promise<IngestionResult> {
  const { smsId, userId, sender, rawMessage, receivedAt, parseMethod, payload } = options;

  // 1. Account Resolution
  const account = await matchAccountForSms(userId, sender, payload.accountLast4);
  if (!account) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        reviewReason: "ACCOUNT_UNMATCHED",
        parseMethod,
        parsedPayload: payload as any,
      },
    });
    return { status: "NEEDS_REVIEW", reviewReason: "ACCOUNT_UNMATCHED" };
  }

  const amountMinor = amountTextToMinor(payload.amountText);
  if (amountMinor <= 0) {
    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "NEEDS_REVIEW",
        reviewReason: "VALIDATION_FAILED",
        failureReason: "Amount must be greater than zero",
        parseMethod,
        parsedPayload: payload as any,
      },
    });
    return { status: "NEEDS_REVIEW", reviewReason: "VALIDATION_FAILED" };
  }

  const smsTime = payload.transactionTimestamp
    ? new Date(payload.transactionTimestamp)
    : receivedAt;

  // 2. Two-Way Deduplication: SMS arrives after manual entry
  // Query recent unlinked manual transaction on the account where amountMinor matches and within ±2 hours
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const minTime = new Date(smsTime.getTime() - twoHoursMs);
  const maxTime = new Date(smsTime.getTime() + twoHoursMs);

  const manualCandidates = await prisma.transaction.findMany({
    where: {
      userId,
      accountId: account.id,
      amountMinor,
      deletedAt: null,
      source: { not: "SMS" },
      bankSmsList: { none: {} },
      transactionDate: { gte: minTime, lte: maxTime },
    },
  });

  if (manualCandidates.length > 0) {
    // Matched one-to-one, nearest in time first
    manualCandidates.sort(
      (a, b) =>
        Math.abs(a.transactionDate.getTime() - smsTime.getTime()) -
        Math.abs(b.transactionDate.getTime() - smsTime.getTime())
    );

    const matchedTx = manualCandidates[0];
    const merchantName = payload.merchantOrEntity || sender;
    const enrichedNote = matchedTx.note
      ? matchedTx.note.includes(merchantName)
        ? matchedTx.note
        : `${matchedTx.note} - ${merchantName}`
      : merchantName;

    const nextSeq = await getNextServerSeq();
    await prisma.transaction.update({
      where: { id: matchedTx.id },
      data: {
        note: enrichedNote,
        source: "SMS",
        serverSeq: nextSeq,
      },
    });

    await prisma.bankSms.update({
      where: { id: smsId },
      data: {
        status: "PROCESSED",
        parseMethod,
        parsedPayload: payload as any,
        transactionId: matchedTx.id,
      },
    });

    // Check balance mismatch hint
    await processBalanceMismatchHint(account, payload, receivedAt, smsTime);

    return {
      status: "PROCESSED",
      transactionId: matchedTx.id,
      isMatchedManual: true,
    };
  }

  // 3. Fee-SMS dedupe against auto-created fee child
  if (payload.channel === "BANK_CHARGE") {
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const minFeeTime = new Date(smsTime.getTime() - twentyFourHoursMs);
    const maxFeeTime = new Date(smsTime.getTime() + twentyFourHoursMs);

    const existingFeeChild = await prisma.transaction.findFirst({
      where: {
        userId,
        accountId: account.id,
        amountMinor,
        type: "EXPENSE",
        subType: "FEE",
        feeTransactionId: { not: null },
        deletedAt: null,
        bankSmsList: { none: {} },
        transactionDate: { gte: minFeeTime, lte: maxFeeTime },
      },
      orderBy: { transactionDate: "desc" },
    });

    if (existingFeeChild) {
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "PROCESSED",
          parseMethod,
          parsedPayload: payload as any,
          transactionId: existingFeeChild.id,
        },
      });

      await processBalanceMismatchHint(account, payload, receivedAt, smsTime);
      return { status: "PROCESSED", transactionId: existingFeeChild.id };
    }
  }

  // 4. Categorized Action Routing
  let createdTxId: string | null = null;

  if (payload.channel === "ATM_OWN" || payload.channel === "ATM_OTHER") {
    // Transfer from Bank Account to Cash Wallet
    let cashAccount = await prisma.account.findFirst({
      where: { userId, type: "CASH", deletedAt: null },
    });

    if (!cashAccount) {
      const nextCashSeq = await getNextServerSeq();
      cashAccount = await prisma.account.create({
        data: {
          userId,
          name: "Cash Wallet",
          type: "CASH",
          openingBalanceMinor: 0,
          currency: account.currency || "LKR",
          serverSeq: nextCashSeq,
        },
      });
    }

    const nextParentSeq = await getNextServerSeq();
    const parentTx = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        toAccountId: cashAccount.id,
        amountMinor,
        type: "TRANSFER",
        subType: "ATM_WITHDRAWAL",
        source: "SMS",
        note:
          payload.merchantOrEntity ||
          (payload.channel === "ATM_OTHER" ? "ATM Other-Bank Withdrawal" : "ATM Withdrawal"),
        transactionDate: smsTime,
        createdByUserId: userId,
        updatedByUserId: userId,
        serverSeq: nextParentSeq,
      },
    });

    createdTxId = parentTx.id;

    // ATM Fee Rule Engine
    const feeAmount =
      payload.channel === "ATM_OTHER"
        ? account.otherAtmFeeMinor || 0
        : account.ownAtmFeeMinor || 0;

    if (feeAmount > 0) {
      const bankFeeCategory = await prisma.category.findFirst({
        where: {
          userId,
          name: { contains: "Bank Fee", mode: "insensitive" },
          deletedAt: null,
        },
      });

      const nextFeeSeq = await getNextServerSeq();
      await prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          amountMinor: feeAmount,
          type: "EXPENSE",
          subType: "FEE",
          categoryId: bankFeeCategory?.id || null,
          source: "SYSTEM",
          feeTransactionId: parentTx.id,
          note:
            payload.channel === "ATM_OTHER"
              ? "ATM other-bank fee"
              : "ATM withdrawal fee",
          transactionDate: smsTime,
          createdByUserId: userId,
          updatedByUserId: userId,
          serverSeq: nextFeeSeq,
        },
      });
    }
  } else if (payload.channel === "BANK_CHARGE") {
    const bankFeeCategory = await prisma.category.findFirst({
      where: {
        userId,
        name: { contains: "Bank Fee", mode: "insensitive" },
        deletedAt: null,
      },
    });

    const nextSeq = await getNextServerSeq();
    const feeTx = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amountMinor,
        type: "EXPENSE",
        subType: "FEE",
        categoryId: bankFeeCategory?.id || null,
        source: "SMS",
        note: payload.merchantOrEntity || "Bank Charge",
        transactionDate: smsTime,
        createdByUserId: userId,
        updatedByUserId: userId,
        serverSeq: nextSeq,
      },
    });
    createdTxId = feeTx.id;
  } else if (payload.channel === "CARD_PAYMENT") {
    let creditCard: any = null;
    let fundingAccount: any = null;

    if (account.type === "CREDIT_CARD") {
      creditCard = account;
      if (creditCard.linkedSettlementAccountId) {
        fundingAccount = await prisma.account.findUnique({
          where: { id: creditCard.linkedSettlementAccountId },
        });
      }
      if (!fundingAccount) {
        fundingAccount = await prisma.account.findFirst({
          where: { userId, type: { in: ["BANK_SAVINGS", "CASH"] }, deletedAt: null },
        });
      }
    } else {
      fundingAccount = account;
      creditCard = await prisma.account.findFirst({
        where: {
          userId,
          type: "CREDIT_CARD",
          deletedAt: null,
          ...(payload.accountLast4 ? { accountNumberLast4: payload.accountLast4 } : {}),
        },
      });
    }

    if (!creditCard || !fundingAccount) {
      await prisma.bankSms.update({
        where: { id: smsId },
        data: {
          status: "NEEDS_REVIEW",
          reviewReason: "ACCOUNT_UNMATCHED",
          parseMethod,
          parsedPayload: payload as any,
        },
      });
      return { status: "NEEDS_REVIEW", reviewReason: "ACCOUNT_UNMATCHED" };
    }

    const nextSeq = await getNextServerSeq();
    const settlementTx = await prisma.transaction.create({
      data: {
        userId,
        accountId: fundingAccount.id,
        toAccountId: creditCard.id,
        amountMinor,
        type: "TRANSFER",
        subType: "CC_SETTLEMENT",
        source: "SMS",
        note: payload.merchantOrEntity || "Credit Card Settlement",
        transactionDate: smsTime,
        createdByUserId: userId,
        updatedByUserId: userId,
        serverSeq: nextSeq,
      },
    });
    createdTxId = settlementTx.id;
  } else if (
    (payload.channel as string) === "REFUND_REVERSAL" ||
    payload.transactionType === "REFUND_REVERSAL"
  ) {
    const thirtyDaysAgo = new Date(smsTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    const originalDebit = await prisma.transaction.findFirst({
      where: {
        userId,
        accountId: account.id,
        amountMinor,
        type: "EXPENSE",
        deletedAt: null,
        transactionDate: { gte: thirtyDaysAgo, lte: smsTime },
      },
      orderBy: { transactionDate: "desc" },
    });

    const nextSeq = await getNextServerSeq();
    const refundTx = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amountMinor,
        type: "REFUND",
        direction: "IN",
        source: "SMS",
        note: payload.merchantOrEntity || "Refund",
        reversalOfTransactionId: originalDebit?.id || null,
        transactionDate: smsTime,
        createdByUserId: userId,
        updatedByUserId: userId,
        serverSeq: nextSeq,
      },
    });
    createdTxId = refundTx.id;
  } else {
    // Normal Expense or Income (POS, ONLINE, BILL_PAYMENT, SALARY_OR_DEPOSIT)
    const isCredit =
      payload.transactionType === "CREDIT" || payload.channel === "SALARY_OR_DEPOSIT";
    const txType = isCredit ? "INCOME" : "EXPENSE";
    const subType =
      payload.channel === "SALARY_OR_DEPOSIT"
        ? "DEPOSIT"
        : payload.channel === "BILL_PAYMENT"
        ? "BILL_PAYMENT"
        : payload.channel === "POS"
        ? "POS"
        : payload.channel === "ONLINE_PURCHASE" || payload.channel === "ONLINE_TRANSFER"
        ? "ONLINE"
        : payload.channel || null;

    let categoryId: string | null = null;
    if (payload.inferredCategory) {
      const matchedCat = await prisma.category.findFirst({
        where: {
          userId,
          name: { contains: payload.inferredCategory, mode: "insensitive" },
          deletedAt: null,
        },
      });
      categoryId = matchedCat?.id || null;
    }

    const nextSeq = await getNextServerSeq();
    const normalTx = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amountMinor,
        type: txType,
        subType,
        categoryId,
        source: "SMS",
        note: payload.merchantOrEntity || sender,
        transactionDate: smsTime,
        createdByUserId: userId,
        updatedByUserId: userId,
        serverSeq: nextSeq,
      },
    });
    createdTxId = normalTx.id;
  }

  // Update BankSms to PROCESSED
  await prisma.bankSms.update({
    where: { id: smsId },
    data: {
      status: "PROCESSED",
      parseMethod,
      parsedPayload: payload as any,
      transactionId: createdTxId,
    },
  });

  // Balance mismatch check
  await processBalanceMismatchHint(account, payload, receivedAt, smsTime);

  return { status: "PROCESSED", transactionId: createdTxId! };
}

/**
 * Balance mismatch hint check:
 * Compares balanceAfterText to ledger-derived balance only when this SMS is the newest
 * information for the account. Out-of-order older SMS do not trigger hints.
 */
async function processBalanceMismatchHint(
  account: any,
  payload: ParsedTransactionPayload,
  receivedAt: Date,
  smsTime: Date
) {
  if (!payload.balanceAfterText) {
    return;
  }

  const balanceAfterMinor = amountTextToMinor(payload.balanceAfterText);

  // Check if there is any newer received SMS for this user & account
  const newerSms = await prisma.bankSms.findFirst({
    where: {
      userId: account.userId,
      receivedAt: { gt: receivedAt },
    },
  });

  if (newerSms) {
    // Out-of-order older SMS: do not trigger or alter hint
    return;
  }

  // Compute ledger balance for the account
  const txList = await prisma.transaction.findMany({
    where: {
      OR: [{ accountId: account.id }, { toAccountId: account.id }],
      deletedAt: null,
      excludeFromBalance: false,
    },
    select: {
      accountId: true,
      toAccountId: true,
      amountMinor: true,
      type: true,
      direction: true,
    },
  });

  let ledgerBalanceMinor = account.openingBalanceMinor;
  for (const t of txList) {
    if (t.accountId === account.id) {
      if (t.type === "INCOME" || t.type === "REFUND" || t.direction === "IN") {
        ledgerBalanceMinor += t.amountMinor;
      } else {
        ledgerBalanceMinor -= t.amountMinor;
      }
    } else if (t.toAccountId === account.id) {
      ledgerBalanceMinor += t.amountMinor;
    }
  }

  if (ledgerBalanceMinor !== balanceAfterMinor) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        balanceMismatchHint: {
          statedBalanceMinor: balanceAfterMinor,
          ledgerBalanceMinor,
          asOf: smsTime.toISOString(),
        },
      },
    });
  } else {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        balanceMismatchHint: Prisma.DbNull,
      },
    });
  }
}

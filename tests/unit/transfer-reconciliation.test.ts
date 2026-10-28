import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  bankSms: {
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/server-seq", () => ({
  getNextServerSeq: vi.fn().mockResolvedValue(BigInt(1001)),
}));

import { ingestParsedBankSms } from "@/lib/sms/ingestion";
import { parseBankSmsTemplate } from "@/lib/sms/template-parser";

describe("Inter-Account Transfer Deduplication & Auto-Reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const dfccAccount = {
    id: "acc-dfcc-0726",
    userId: "user-123",
    name: "DFCC Account",
    type: "BANK_SAVINGS",
    currency: "LKR",
    accountNumberLast4: "0726",
    bankSenderIds: ["DFCC"],
    openingBalanceMinor: 50000000,
  };

  const sampathAccount = {
    id: "acc-sampath-4681",
    userId: "user-123",
    name: "Sampath Account",
    type: "BANK_SAVINGS",
    currency: "LKR",
    accountNumberLast4: "4681",
    bankSenderIds: ["SAMPATH"],
    openingBalanceMinor: 1000000,
  };

  it("auto-merges counterpart transfer when DFCC debit arrives first and Sampath credit arrives second", async () => {
    const sampathSmsText = `LKR 1,000.00 credited to AC **4681 for test
27/10/2026 18:58:50
To Inq Call 0112303050
Get protected -Do not Share OTP`;

    const parsedSampath = parseBankSmsTemplate("SAMPATH", sampathSmsText);
    expect(parsedSampath.matched).toBe(true);
    expect(parsedSampath.payload).toBeDefined();

    // 1. Account resolution: matches Sampath
    mockPrisma.account.findMany.mockResolvedValue([sampathAccount]);
    // 2. Two-way dedupe: no manual candidates
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([]) // manual candidates
      .mockResolvedValueOnce([ // transfer counterpart candidates
        {
          id: "tx-dfcc-debit",
          userId: "user-123",
          accountId: "acc-dfcc-0726",
          toAccountId: null,
          amountMinor: 100000,
          type: "EXPENSE",
          subType: "ONLINE",
          note: "Outward CEFT Transfer",
          transactionDate: new Date("2026-10-27T18:58:30.000Z"),
          account: dfccAccount,
        },
      ]);

    // User is in AUTO_VALIDATED mode
    mockPrisma.user.findUnique.mockResolvedValue({
      smsAutoPostMode: "AUTO_VALIDATED",
    });

    mockPrisma.transaction.update.mockResolvedValue({
      id: "tx-dfcc-debit",
      type: "TRANSFER",
      accountId: "acc-dfcc-0726",
      toAccountId: "acc-sampath-4681",
    });
    mockPrisma.bankSms.update.mockResolvedValue({});
    mockPrisma.bankSms.findFirst.mockResolvedValue(null);

    const result = await ingestParsedBankSms({
      smsId: "sms-sampath-credit",
      userId: "user-123",
      sender: "SAMPATH",
      rawMessage: sampathSmsText,
      receivedAt: new Date("2026-10-27T18:58:50.000Z"),
      parseMethod: "TEMPLATE",
      payload: parsedSampath.payload!,
    });

    expect(result.status).toBe("PROCESSED");
    expect(result.transactionId).toBe("tx-dfcc-debit");
    expect(result.isTransferMerged).toBe(true);

    // Verify transaction was converted to TRANSFER with correct accounts
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "tx-dfcc-debit" },
      data: expect.objectContaining({
        type: "TRANSFER",
        accountId: "acc-dfcc-0726",
        toAccountId: "acc-sampath-4681",
        subType: "ONLINE_TRANSFER",
        categoryId: null,
      }),
    });

    // Verify BankSms was linked to the single transaction
    expect(mockPrisma.bankSms.update).toHaveBeenCalledWith({
      where: { id: "sms-sampath-credit" },
      data: expect.objectContaining({
        status: "PROCESSED",
        transactionId: "tx-dfcc-debit",
      }),
    });
  });

  it("auto-merges counterpart transfer when Sampath credit arrives first and DFCC debit arrives second", async () => {
    const dfccSmsText =
      "Your A/C No: ********0726 is debited with LKR1,000.00 on 27 OCT 2026 ref: Outward CEFT Transfer. Your bal is LKR495,975.39. If unauthorized call 0112350035";

    const parsedDfcc = parseBankSmsTemplate("DFCC", dfccSmsText);
    expect(parsedDfcc.matched).toBe(true);

    mockPrisma.account.findMany.mockResolvedValue([dfccAccount]);
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([]) // manual candidates
      .mockResolvedValueOnce([ // counterpart candidates
        {
          id: "tx-sampath-credit",
          userId: "user-123",
          accountId: "acc-sampath-4681",
          toAccountId: null,
          amountMinor: 100000,
          type: "INCOME",
          subType: "DEPOSIT",
          note: "test",
          transactionDate: new Date("2026-10-27T18:58:20.000Z"),
          account: sampathAccount,
        },
      ])
      .mockResolvedValueOnce([]); // txList for balance check

    mockPrisma.user.findUnique.mockResolvedValue({
      smsAutoPostMode: "AUTO_VALIDATED",
    });

    mockPrisma.transaction.update.mockResolvedValue({});
    mockPrisma.bankSms.update.mockResolvedValue({});
    mockPrisma.bankSms.findFirst.mockResolvedValue(null);

    const result = await ingestParsedBankSms({
      smsId: "sms-dfcc-debit",
      userId: "user-123",
      sender: "DFCC",
      rawMessage: dfccSmsText,
      receivedAt: new Date("2026-10-27T18:58:30.000Z"),
      parseMethod: "TEMPLATE",
      payload: parsedDfcc.payload!,
    });

    expect(result.status).toBe("PROCESSED");
    expect(result.transactionId).toBe("tx-sampath-credit");
    expect(result.isTransferMerged).toBe(true);

    // Verify transaction: source is DFCC, destination is Sampath
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "tx-sampath-credit" },
      data: expect.objectContaining({
        type: "TRANSFER",
        accountId: "acc-dfcc-0726",
        toAccountId: "acc-sampath-4681",
        subType: "ONLINE_TRANSFER",
      }),
    });
  });

  it("flags as POSSIBLE_TRANSFER and routes to inbox when user is in ALWAYS_REVIEW_GEMINI mode", async () => {
    const sampathSmsText = `LKR 1,000.00 credited to AC **4681 for test
27/10/2026 18:58:50
To Inq Call 0112303050
Get protected -Do not Share OTP`;

    const parsedSampath = parseBankSmsTemplate("SAMPATH", sampathSmsText);

    mockPrisma.account.findMany.mockResolvedValue([sampathAccount]);
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "tx-dfcc-debit",
          userId: "user-123",
          accountId: "acc-dfcc-0726",
          toAccountId: null,
          amountMinor: 100000,
          type: "EXPENSE",
          subType: "ONLINE",
          note: "Outward CEFT Transfer",
          transactionDate: new Date("2026-10-27T18:58:30.000Z"),
          account: dfccAccount,
        },
      ]);

    // User configured ALWAYS_REVIEW_GEMINI
    mockPrisma.user.findUnique.mockResolvedValue({
      smsAutoPostMode: "ALWAYS_REVIEW_GEMINI",
    });

    mockPrisma.bankSms.update.mockResolvedValue({});

    const result = await ingestParsedBankSms({
      smsId: "sms-sampath-credit",
      userId: "user-123",
      sender: "SAMPATH",
      rawMessage: sampathSmsText,
      receivedAt: new Date("2026-10-27T18:58:50.000Z"),
      parseMethod: "TEMPLATE",
      payload: parsedSampath.payload!,
    });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.reviewReason).toBe("POSSIBLE_TRANSFER");

    // Transaction was NOT auto-updated
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();

    // BankSms is in NEEDS_REVIEW with suggestedTransfer metadata
    expect(mockPrisma.bankSms.update).toHaveBeenCalledWith({
      where: { id: "sms-sampath-credit" },
      data: expect.objectContaining({
        status: "NEEDS_REVIEW",
        reviewReason: "POSSIBLE_TRANSFER",
        parsedPayload: expect.objectContaining({
          suggestedTransfer: expect.objectContaining({
            counterpartTransactionId: "tx-dfcc-debit",
            fromAccountId: "acc-dfcc-0726",
            toAccountId: "acc-sampath-4681",
            amountMinor: 100000,
          }),
        }),
      }),
    });
  });

  it("flags as POSSIBLE_TRANSFER when amounts match within 45m but no transfer keywords are present", async () => {
    // Both messages mention a merchant or deposit, but no CEFT/Transfer keywords
    const payloadSampath = {
      isTransaction: true,
      transactionType: "CREDIT" as const,
      channel: "SALARY_OR_DEPOSIT" as const,
      amountText: "1,000.00",
      destinationAmountText: null,
      currency: "LKR",
      accountLast4: "4681",
      merchantOrEntity: "Birthday gift",
      inferredCategory: null,
      balanceAfterText: null,
      transactionTimestamp: null,
      confidence: "HIGH" as const,
    };

    mockPrisma.account.findMany.mockResolvedValue([sampathAccount]);
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "tx-generic-debit",
          userId: "user-123",
          accountId: "acc-dfcc-0726",
          toAccountId: null,
          amountMinor: 100000,
          type: "EXPENSE",
          subType: "POS",
          note: "Supermarket Purchase", // no transfer keywords
          transactionDate: new Date("2026-10-27T18:58:30.000Z"),
          account: dfccAccount,
        },
      ]);

    mockPrisma.user.findUnique.mockResolvedValue({
      smsAutoPostMode: "AUTO_VALIDATED",
    });

    mockPrisma.bankSms.update.mockResolvedValue({});

    const result = await ingestParsedBankSms({
      smsId: "sms-sampath-gift",
      userId: "user-123",
      sender: "SAMPATH",
      rawMessage: "LKR 1,000.00 credited to AC **4681 for Birthday gift",
      receivedAt: new Date("2026-10-27T18:58:50.000Z"),
      parseMethod: "TEMPLATE",
      payload: payloadSampath,
    });

    // Because there are no explicit transfer keywords, it routes to inbox for confirmation rather than guessing
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.reviewReason).toBe("POSSIBLE_TRANSFER");
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });
});


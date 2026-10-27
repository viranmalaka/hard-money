import { z } from "zod";

export const BankSmsSchema = z.object({
  isTransaction: z
    .boolean()
    .describe(
      "False if OTP, promotion, balance inquiry alert, or login notice. True only if financial debit/credit occurred."
    ),
  transactionType: z.enum([
    "DEBIT",
    "CREDIT",
    "REFUND_REVERSAL",
    "ATM_WITHDRAWAL",
    "UNKNOWN",
  ]),
  channel: z.enum([
    "ATM_OWN",
    "ATM_OTHER",
    "POS",
    "ONLINE_PURCHASE",
    "ONLINE_TRANSFER",
    "BILL_PAYMENT",
    "BANK_CHARGE",
    "CARD_PAYMENT",
    "SALARY_OR_DEPOSIT",
    "UNKNOWN",
  ]),
  // Amount as a decimal string exactly as printed (e.g. "1,250.50"); the server converts it to integer minor units.
  amountText: z.string().nullable(),
  destinationAmountText: z.string().nullable().optional(),
  currency: z.string().default("LKR"),
  accountLast4: z
    .string()
    .nullable()
    .describe("Last 3 or 4 digits of card or account mentioned in SMS"),
  merchantOrEntity: z
    .string()
    .nullable()
    .describe("Merchant name, beneficiary, or transfer party"),
  inferredCategory: z
    .string()
    .nullable()
    .describe(
      "e.g. Groceries, Fuel, Dining, Utilities, Healthcare, Bank Charges, Cash Withdrawal, Salary, Investment"
    ),
  balanceAfterText: z
    .string()
    .nullable()
    .describe("Remaining account balance if stated in SMS, exactly as printed"),
  transactionTimestamp: z.string().nullable(),
  confidence: z.enum(["HIGH", "LOW"]),
  suggestedTransfer: z
    .object({
      counterpartTransactionId: z.string(),
      fromAccountId: z.string(),
      toAccountId: z.string(),
      amountMinor: z.number(),
      counterpartNote: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type ParsedTransactionPayload = z.infer<typeof BankSmsSchema>;

export interface TemplateParseResult {
  matched: boolean;
  bank?: string;
  payload?: ParsedTransactionPayload;
}

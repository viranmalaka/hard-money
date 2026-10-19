import { ParsedTransactionPayload, TemplateParseResult } from "./types";

/**
 * Checks whether an SMS is a non-transactional message (OTP, login alert, promotion)
 */
export function isNonTransactionalMessage(rawMessage: string): boolean {
  const text = rawMessage.toLowerCase();

  // If the message contains financial debit/credit action AND an amount, it is a real transaction
  // (e.g. security footers like "Do not Share OTP" or "Call 0112303050" should NOT cause it to be marked as OTP)
  const hasFinancialAction =
    /\b(?:debited|credited|withdrawn|spent|paid|used for|transaction of|txn of|auth pmt)\b/i.test(text);
  const hasAmount = /(?:lkr|rs\.?)\s*[\d,]+(?:\.\d{1,2})?/i.test(text);

  if (hasFinancialAction && hasAmount) {
    return false;
  }

  // Explicit OTP or authentication keywords
  const otpPatterns = [
    /\botp\b/i,
    /one[- ]time[- ]password/i,
    /verification\s+code/i,
    /security\s+code/i,
    /do\s+not\s+share/i,
    /never\s+share\s+your/i,
    /is\s+your\s+(?:login|online\s+banking)\s+code/i,
    /valid\s+for\s+\d+\s+min/i,
  ];

  for (const pattern of otpPatterns) {
    if (pattern.test(rawMessage)) {
      return true;
    }
  }

  // Promotional or spam messages without debit/credit confirmation
  const promoKeywords = [
    "special offer",
    "exclusive offer",
    "promo code",
    "promotion",
    "discount",
    "enjoy up to",
    "cashback offer",
    "valid till",
    "apply now",
    "t&c apply",
  ];

  for (const kw of promoKeywords) {
    if (text.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to clean and parse amount text to minor units (cents)
 */
export function amountTextToMinor(amountText: string | null | undefined): number {
  if (!amountText) return 0;
  const cleaned = amountText.replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Template parser for Sri Lankan banks (SAMPATH, DFCC, COMBANK, HNB, etc.)
 */
export function parseBankSmsTemplate(
  sender: string,
  rawMessage: string
): TemplateParseResult {
  const normSender = (sender || "").toUpperCase().trim();
  const text = rawMessage.trim();

  const KNOWN_TEMPLATE_BANKS = [
    "COMBANK",
    "COMMERCIAL",
    "SAMPATH",
    "DFCC",
    "HNB",
    "NTB",
    "SEYLAN",
    "BOC",
    "PEOPLES",
  ];

  const isKnownBank = KNOWN_TEMPLATE_BANKS.some(
    (b) => normSender.includes(b) || text.toUpperCase().includes(b)
  );

  if (!isKnownBank) {
    return { matched: false };
  }

  // 1. Check if non-transactional (OTP / Promo)
  if (isNonTransactionalMessage(text)) {
    return {
      matched: true,
      bank: normSender,
      payload: {
        isTransaction: false,
        transactionType: "UNKNOWN",
        channel: "UNKNOWN",
        amountText: null,
        currency: "LKR",
        accountLast4: null,
        merchantOrEntity: null,
        inferredCategory: null,
        balanceAfterText: null,
        transactionTimestamp: null,
        confidence: "HIGH",
      },
    };
  }

  // Helper regex matchers
  const extractAmount = (str: string): string | null => {
    const match = str.match(/(?:LKR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i);
    return match ? match[1] : null;
  };

  const extractLast4 = (str: string): string | null => {
    const match = str.match(
      /(?:ac|a\/c(?:\s*no)?|card|crd(?:\s*no)?|account|ending|no\.?)\s*(?::|\.\.)?\s*[\*\.#:]*\s*(\d{3,4})\b/i
    );
    return match ? match[1] : null;
  };

  const extractBalanceAfter = (str: string): string | null => {
    const match = str.match(
      /(?:Your bal is|Avl Bal|Avail(?:able)?(?:\s+bal(?:ance)?)?|bal(?:ance)?)\s*(?:is|:)?\s*(?:LKR|Rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    return match ? match[1] : null;
  };

  const amountText = extractAmount(text);
  if (!amountText) {
    return { matched: false };
  }

  const last4 = extractLast4(text);
  const balanceAfter = extractBalanceAfter(text);

  // Extract merchant / reference / entity
  let merchant: string | null = null;

  // Pattern 1: ref: <MERCHANT>.
  const refMatch = text.match(/ref:\s*([^.\n]+?)(?:\.\s*(?:Your bal|If unauthorized)|$|\n)/i);
  if (refMatch) {
    merchant = refMatch[1].trim();
  }

  // Pattern 2: at <MERCHANT> (before Avl Bal / on / Enq / .)
  if (!merchant) {
    const atMatch = text.match(/(?:at)\s+([A-Za-z0-9\s\.\-_&'/]+?)(?:\s+(?:on|Avl|Avail|ref|bal|Enq)|\.|$|\n)/i);
    if (atMatch) {
      merchant = atMatch[1].trim();
    }
  }

  // Pattern 3: for <ENTITY>
  if (!merchant) {
    const forMatch = text.match(/(?:for)\s+([A-Za-z0-9\s\.\-_&'/]+?)(?:\s+(?:on|\d{1,2}\/\d{1,2}\/|To Inq|Get protected)|\.|$|\n)/i);
    if (forMatch) {
      merchant = forMatch[1].trim();
    }
  }

  // Determine transaction type and channel
  const isRefund = /\b(?:refund|refunded|reversal)\b/i.test(text);
  const isCardPayment = /\b(?:payment.*received for card|card payment|credit card settlement)\b/i.test(text);
  const isBankFee =
    /\b(?:withdrawal fee|bank fee|atm fee|bank charge|service charge|annual fee|for atm.*fee)\b/i.test(text) &&
    !/\bvia atm\b/i.test(text);
  const isAtmOther = /\batm\b/i.test(text) && /\b(?:other bank|other-bank|other)\b/i.test(text);
  const isAtm = /\batm\b/i.test(text) || /\bwithdrawn\b/i.test(text);
  const isCredit = /\b(?:credited|deposit|inward|salary)\b/i.test(text);
  const isTransfer = /\b(?:ceft|transfer|donation|vsrpmt)\b/i.test(text);

  let transactionType: ParsedTransactionPayload["transactionType"] = "DEBIT";
  let channel: ParsedTransactionPayload["channel"] = "POS";

  if (isRefund) {
    transactionType = "REFUND_REVERSAL";
    channel = "UNKNOWN";
  } else if (isCardPayment) {
    transactionType = "CREDIT";
    channel = "CARD_PAYMENT";
  } else if (isBankFee) {
    transactionType = "DEBIT";
    channel = "BANK_CHARGE";
  } else if (isAtmOther) {
    transactionType = "DEBIT";
    channel = "ATM_OTHER";
  } else if (isAtm) {
    transactionType = "DEBIT";
    channel = "ATM_OWN";
  } else if (isTransfer) {
    transactionType = isCredit ? "CREDIT" : "DEBIT";
    channel = "ONLINE_TRANSFER";
  } else if (isCredit) {
    transactionType = "CREDIT";
    channel = "SALARY_OR_DEPOSIT";
  } else {
    transactionType = "DEBIT";
    channel = "POS";
  }

  // Bank name normalization
  let bankName = normSender || "BANK";
  if (normSender.includes("SAMPATH") || text.includes("Sampath")) bankName = "SAMPATH";
  else if (normSender.includes("DFCC") || text.includes("DFCC")) bankName = "DFCC";
  else if (normSender.includes("COMBANK") || normSender.includes("COMMERCIAL")) bankName = "COMBANK";
  else if (normSender.includes("HNB") || normSender.includes("HATTON")) bankName = "HNB";

  return {
    matched: true,
    bank: bankName,
    payload: {
      isTransaction: true,
      transactionType,
      channel,
      amountText,
      currency: "LKR",
      accountLast4: last4,
      merchantOrEntity: merchant || (isAtm ? "ATM Withdrawal" : `${bankName} Merchant`),
      inferredCategory: isAtm ? "Cash Withdrawal" : null,
      balanceAfterText: balanceAfter,
      transactionTimestamp: null,
      confidence: "HIGH",
    },
  };
}

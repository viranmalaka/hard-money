import { describe, it, expect } from "vitest";
import {
  parseBankSmsTemplate,
  amountTextToMinor,
} from "@/lib/sms/template-parser";

describe("Sri Lankan Bank SMS Template Parser", () => {
  it("converts amountText to minor units accurately", () => {
    expect(amountTextToMinor("4,500.00")).toBe(450000);
    expect(amountTextToMinor("12.50")).toBe(1250);
    expect(amountTextToMinor("100000")).toBe(10000000);
    expect(amountTextToMinor(null)).toBe(0);
  });

  it("identifies OTP and promotional messages as non-transactional", () => {
    const otp1 =
      "Your Commercial Bank OTP is 948201 for Online Banking. Valid for 5 minutes. Do not share.";
    const res1 = parseBankSmsTemplate("COMBANK", otp1);
    expect(res1.matched).toBe(true);
    expect(res1.payload?.isTransaction).toBe(false);

    const otp2 = "Your Sampath Bank OTP is 654321. Do not share with anyone.";
    const res2 = parseBankSmsTemplate("SAMPATH", otp2);
    expect(res2.matched).toBe(true);
    expect(res2.payload?.isTransaction).toBe(false);

    const promo =
      "Special offer! Get 20% off at Arpico Supercentre with your COMBANK Credit Card. Valid till 31st Oct. T&C apply.";
    const res3 = parseBankSmsTemplate("COMBANK", promo);
    expect(res3.matched).toBe(true);
    expect(res3.payload?.isTransaction).toBe(false);
  });

  it("parses COMBANK POS transactions accurately", () => {
    const msg =
      "Your Commercial Bank Credit Card ending 1234 was used for LKR 4,500.00 at KECELLS SUPER on 2026-10-15. Available Balance: LKR 150,000.00";
    const res = parseBankSmsTemplate("COMBANK", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("POS");
    expect(res.payload?.amountText).toBe("4,500.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(450000);
    expect(res.payload?.accountLast4).toBe("1234");
    expect(res.payload?.merchantOrEntity).toBe("KECELLS SUPER");
    expect(res.payload?.balanceAfterText).toBe("150,000.00");
  });

  it("parses SAMPATH Bank account credit SMS with security footer", () => {
    const msg = `LKR 10,000.00 credited to AC **4681 for FuneralVishwa-Donation for
18/10/2026 03:08:38 To Inq Call 0112303050 Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("CREDIT");
    expect(res.payload?.amountText).toBe("10,000.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(1000000);
    expect(res.payload?.accountLast4).toBe("4681");
    expect(res.payload?.merchantOrEntity).toContain("FuneralVishwa-Donation");
  });

  it("parses SAMPATH Bank cash deposit SMS with security footer", () => {
    const msg = `LKR 5,000.00 credited to AC **4681 for cash
17/10/2026 12:16:25
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("CREDIT");
    expect(res.payload?.channel).toBe("SALARY_OR_DEPOSIT");
    expect(res.payload?.amountText).toBe("5,000.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(500000);
    expect(res.payload?.accountLast4).toBe("4681");
    expect(res.payload?.merchantOrEntity).toBe("cash");
  });

  it("parses SAMPATH Bank ATM cash withdrawal SMS with security footer", () => {
    const msg = `LKR 88,005.00 debited from AC **4681 via ATM at EHELIYAGODA BRANCH CASH SET
17/10/2026 06:00:28
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("ATM_OWN");
    expect(res.payload?.amountText).toBe("88,005.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(8800500);
    expect(res.payload?.accountLast4).toBe("4681");
    expect(res.payload?.merchantOrEntity).toBe("EHELIYAGODA BRANCH CASH SET");
  });

  it("parses SAMPATH Bank debit payment SMS with security footer", () => {
    const msg = `LKR 515.00 debited from AC **4681 for VSRPMT-000018376937
16/10/2026 19:15:37
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.amountText).toBe("515.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(51500);
    expect(res.payload?.accountLast4).toBe("4681");
    expect(res.payload?.merchantOrEntity).toBe("VSRPMT-000018376937");
  });

  it("parses DFCC Bank debit SMS (no space in LKR and with balance)", () => {
    const msg =
      "Your A/C No: ********0726 is debited with LKR678.00 on 16 OCT 2026 ref: KEELLS SUPER - KADUWELA KADUWELA. Your bal is LKR1,822.73. If unauthorized call 0112350035";
    const res = parseBankSmsTemplate("DFCC", msg);
    expect(res.matched).toBe(true);
    expect(res.bank).toBe("DFCC");
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("POS");
    expect(res.payload?.amountText).toBe("678.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(67800);
    expect(res.payload?.accountLast4).toBe("0726");
    expect(res.payload?.merchantOrEntity).toBe(
      "KEELLS SUPER - KADUWELA KADUWELA",
    );
    expect(res.payload?.balanceAfterText).toBe("1,822.73");
  });

  it("parses DFCC Bank credit inward CEFT SMS", () => {
    const msg =
      "Your A/C No: ********0726 is credited with LKR20,000.00 on 15 OCT 2026 ref: Inward CEFT Transfer. Your bal is LKR27,500.73. If unauthorized call 0112350035";
    const res = parseBankSmsTemplate("DFCC", msg);
    expect(res.matched).toBe(true);
    expect(res.bank).toBe("DFCC");
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("CREDIT");
    expect(res.payload?.channel).toBe("ONLINE_TRANSFER");
    expect(res.payload?.amountText).toBe("20,000.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(2000000);
    expect(res.payload?.accountLast4).toBe("0726");
    expect(res.payload?.merchantOrEntity).toBe("Inward CEFT Transfer");
    expect(res.payload?.balanceAfterText).toBe("27,500.73");
  });

  it("parses Sampath Credit Card Auth Pmt SMS (Keells Super)", () => {
    const msg = `Cr Crd no..**6909 Auth Pmt LKR 6,676.00 at KEELLS SUPER - KADUWELA Avl Bal LKR 138,783.04 Enq Call 0112300604
- Sampath Bank 18-OCT`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("POS");
    expect(res.payload?.amountText).toBe("6,676.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(667600);
    expect(res.payload?.accountLast4).toBe("6909");
    expect(res.payload?.merchantOrEntity).toBe("KEELLS SUPER - KADUWELA");
    expect(res.payload?.balanceAfterText).toBe("138,783.04");
  });

  it("parses Sampath Credit Card Auth Pmt SMS (Pradeep Sale Centre)", () => {
    const msg = `Cr Crd no..**6909 Auth Pmt LKR 2,230.00 at PRADEEP SALE CENTRE Avl Bal LKR 136,553.04 Enq Call 0112300604
- Sampath Bank 18-OCT`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("POS");
    expect(res.payload?.amountText).toBe("2,230.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(223000);
    expect(res.payload?.accountLast4).toBe("6909");
    expect(res.payload?.merchantOrEntity).toBe("PRADEEP SALE CENTRE");
    expect(res.payload?.balanceAfterText).toBe("136,553.04");
  });

  it("parses Sampath SMS alert fees as bank charges", () => {
    const msg = `LKR 500.00 debited from AC **4681 for Fee: SMS_Alerts_202604_0712639796
28/03/2026 08:28:36
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.payload?.channel).toBe("BANK_CHARGE");
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.merchantOrEntity).toBe(
      "Fee: SMS_Alerts_202604_0712639796",
    );
  });

  it("parses Sampath credit-card payments and autopay as card settlements", () => {
    const payment = parseBankSmsTemplate(
      "SAMPATH",
      "LKR 100,000.00 debited from AC **4681 for C/Card Payment 4800000024122461",
    );
    expect(payment.payload?.channel).toBe("CARD_PAYMENT");
    expect(payment.payload?.transactionType).toBe("DEBIT");

    const autopay = parseBankSmsTemplate(
      "SAMPATH",
      "LKR 62,090.63 debited from AC **4681 for C/C Autopay 6909",
    );
    expect(autopay.payload?.channel).toBe("CARD_PAYMENT");
    expect(autopay.payload?.merchantOrEntity).toBe("C/C Autopay 6909");
  });

  it("parses USD Sampath transactions, including fractional amounts", () => {
    const res = parseBankSmsTemplate(
      "SAMPATH",
      "Cr Crd no..**6909 Auth Pmt USD .01 at Google CLOUD 27W3K4 Avl Bal LKR 71,830.10",
    );
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.currency).toBe("USD");
    expect(res.payload?.amountText).toBe(".01");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(1);
    expect(res.payload?.merchantOrEntity).toBe("Google CLOUD 27W3K4");
    expect(res.payload?.balanceAfterText).toBe("71,830.10");
  });

  it("parses DFCC credit-card alerts, including merchant and available balance", () => {
    const debit = parseBankSmsTemplate(
      "DFCC",
      `ALERT CR CARD: KEELLS SUPER - AVISSAWE
CARD**6621 DEBITED LKR 159.00 ON(05/OCT/2026 14:45)
AUTHCODE PHWX14 AVBAL LKR 33,413.44
IF UNAUTHORIZED CALL 0112350035`,
    );
    expect(debit.payload?.channel).toBe("POS");
    expect(debit.payload?.accountLast4).toBe("6621");
    expect(debit.payload?.merchantOrEntity).toBe("KEELLS SUPER - AVISSAWE");
    expect(debit.payload?.balanceAfterText).toBe("33,413.44");

    const credit = parseBankSmsTemplate(
      "DFCC",
      `ALERT CR CARD: Credit Transfer
CARD**6621 CREDITED LKR 118,000.00 ON(01/OCT/2026 09:02)
AUTHCODE 090214 AVBAL LKR 1,567,769.48`,
    );
    expect(credit.payload?.transactionType).toBe("CREDIT");
    expect(credit.payload?.channel).toBe("CARD_PAYMENT");
  });

  it("does not treat declined, statement, or fixed-deposit notices as completed transactions", () => {
    const messages = [
      "Cr Crd no..**6909 Dclnd Pmt USD 1.00 at Amazon web services Avl Bal LKR 71,830.10",
      "Dear Cardholder, the total statement outstanding on your DFCC Credit Card 419983******6621 as at 2026/09/30 is Rs. 117,934.40. Minimum payment Rs.5,896.72 due by 2026/10/21.",
      "New FD opened under Acc no **8213 for LKR 60,000.00 for 24 Month(s)",
      "FD **9325 renewed LKR 40,428.06 for 2 Month(s)",
    ];

    for (const message of messages) {
      const res = parseBankSmsTemplate("SAMPATH", message);
      expect(res.matched).toBe(true);
      expect(res.payload?.isTransaction).toBe(false);
    }
  });

  it("parses DFCC outward CEFT transfer SMS correctly", () => {
    const msg =
      "Your A/C No: ********0726 is debited with LKR1,000.00 on 27 OCT 2026 ref: Outward CEFT Transfer. Your bal is LKR495,975.39. If unauthorized call 0112350035";
    const res = parseBankSmsTemplate("DFCC", msg);
    expect(res.matched).toBe(true);
    expect(res.bank).toBe("DFCC");
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("DEBIT");
    expect(res.payload?.channel).toBe("ONLINE_TRANSFER");
    expect(res.payload?.amountText).toBe("1,000.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(100000);
    expect(res.payload?.accountLast4).toBe("0726");
    expect(res.payload?.merchantOrEntity).toBe("Outward CEFT Transfer");
    expect(res.payload?.balanceAfterText).toBe("495,975.39");
  });

  it("parses Sampath inward credit SMS with security footer correctly", () => {
    const msg = `LKR 1,000.00 credited to AC **4681 for test
27/10/2026 18:58:50
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res = parseBankSmsTemplate("SAMPATH", msg);
    expect(res.matched).toBe(true);
    expect(res.bank).toBe("SAMPATH");
    expect(res.payload?.isTransaction).toBe(true);
    expect(res.payload?.transactionType).toBe("CREDIT");
    expect(res.payload?.channel).toBe("SALARY_OR_DEPOSIT");
    expect(res.payload?.amountText).toBe("1,000.00");
    expect(amountTextToMinor(res.payload?.amountText)).toBe(100000);
    expect(res.payload?.accountLast4).toBe("4681");
    expect(res.payload?.merchantOrEntity).toBe("test");
  });
});


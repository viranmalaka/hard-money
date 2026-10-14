/**
 * Fixed Deposit (FD) Calculations
 * Follows PRD Section 4 Subsystem 5.1
 */

import { roundHalfUp } from "./money";

export type CompoundingFrequency = "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY";
export type PayoutMode = "REINVEST_COMPOUND" | "MONTHLY_PAYOUT_TO_ACCOUNT";

export interface FixedDepositParams {
  principalAmountMinor: number;
  annualInterestRateBps: number;
  tenureMonths: number;
  compoundingFrequency: CompoundingFrequency;
  payoutMode: PayoutMode;
  withholdingTaxRateBps: number;
}

/**
 * Calculates monthly interest payout for MONTHLY_PAYOUT_TO_ACCOUNT mode.
 */
export function calculateMonthlyPayout(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  withholdingTaxRateBps: number
): {
  grossInterestMinor: number;
  taxWithheldMinor: number;
  netInterestMinor: number;
} {
  const annualRate = annualInterestRateBps / 10000;
  const taxRate = withholdingTaxRateBps / 10000;

  const grossInterestMinor = roundHalfUp((principalAmountMinor * annualRate) / 12);
  const taxWithheldMinor = roundHalfUp(grossInterestMinor * taxRate);
  const netInterestMinor = grossInterestMinor - taxWithheldMinor;

  return {
    grossInterestMinor,
    taxWithheldMinor,
    netInterestMinor,
  };
}

/**
 * Calculates maturity proceeds for REINVEST_COMPOUND mode.
 */
export function calculateCompoundMaturity(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number,
  compoundingFrequency: CompoundingFrequency,
  withholdingTaxRateBps: number
): {
  maturityGrossAmountMinor: number;
  grossInterestMinor: number;
  taxWithheldMinor: number;
  netInterestMinor: number;
  maturityNetAmountMinor: number;
} {
  const r = annualInterestRateBps / 10000;
  const t = tenureMonths / 12;

  let compoundFactor = 1;

  if (compoundingFrequency === "AT_MATURITY") {
    // Simple interest over the tenure
    compoundFactor = 1 + r * t;
  } else {
    let n = 12;
    if (compoundingFrequency === "QUARTERLY") n = 4;
    if (compoundingFrequency === "ANNUALLY") n = 1;

    compoundFactor = Math.pow(1 + r / n, n * t);
  }

  const maturityGrossAmountMinor = roundHalfUp(principalAmountMinor * compoundFactor);
  const grossInterestMinor = Math.max(0, maturityGrossAmountMinor - principalAmountMinor);

  const taxRate = withholdingTaxRateBps / 10000;
  const taxWithheldMinor = roundHalfUp(grossInterestMinor * taxRate);
  const netInterestMinor = Math.max(0, grossInterestMinor - taxWithheldMinor);
  const maturityNetAmountMinor = principalAmountMinor + netInterestMinor;

  return {
    maturityGrossAmountMinor,
    grossInterestMinor,
    taxWithheldMinor,
    netInterestMinor,
    maturityNetAmountMinor,
  };
}

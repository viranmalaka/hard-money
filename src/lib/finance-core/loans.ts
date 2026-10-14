/**
 * Loan & Lease Amortization Calculations
 * Follows PRD Section 4 Subsystem 5.2
 */

import { roundHalfUp } from "./money";

export type LoanKind = "LOAN" | "LEASE";
export type LoanCalculationType = "REDUCING_BALANCE" | "FLAT_RATE";

export interface LoanScheduleRow {
  installmentNumber: number;
  openingBalanceMinor: number;
  emiAmountMinor: number;
  principalComponentMinor: number;
  interestComponentMinor: number;
  closingBalanceMinor: number;
}

/**
 * Calculates reducing balance monthly EMI.
 * EMI = P * r / (1 - (1 + r)^(-n))
 */
export function calculateReducingBalanceEmi(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number
): number {
  if (tenureMonths <= 0) return principalAmountMinor;
  if (annualInterestRateBps <= 0) {
    return Math.ceil(principalAmountMinor / tenureMonths);
  }

  const r = annualInterestRateBps / (10000 * 12);
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principalAmountMinor * r * factor) / (factor - 1);

  return roundHalfUp(emi);
}

/**
 * Calculates flat rate monthly EMI.
 * Total interest = P * r * (tenureMonths / 12)
 * EMI = (P + Total interest) / tenureMonths
 */
export function calculateFlatRateEmi(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number
): {
  monthlyEmiMinor: number;
  totalInterestMinor: number;
} {
  const r = annualInterestRateBps / 10000;
  const years = tenureMonths / 12;
  const totalInterestMinor = roundHalfUp(principalAmountMinor * r * years);
  const totalPayable = principalAmountMinor + totalInterestMinor;
  const monthlyEmiMinor = Math.floor(totalPayable / tenureMonths);

  return {
    monthlyEmiMinor,
    totalInterestMinor,
  };
}

/**
 * Generates the full amortization schedule.
 * Absorbs rounding differences in the final installment.
 */
export function generateAmortizationSchedule(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number,
  calculationType: LoanCalculationType
): LoanScheduleRow[] {
  const schedule: LoanScheduleRow[] = [];
  let currentBalance = principalAmountMinor;
  const r = annualInterestRateBps / (10000 * 12);

  if (calculationType === "REDUCING_BALANCE") {
    const regularEmi = calculateReducingBalanceEmi(principalAmountMinor, annualInterestRateBps, tenureMonths);

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      const interestComponent = roundHalfUp(currentBalance * r);

      let principalComponent: number;
      let emi: number;
      let closingBalance: number;

      if (isFinal) {
        principalComponent = currentBalance;
        emi = principalComponent + interestComponent;
        closingBalance = 0;
      } else {
        principalComponent = regularEmi - interestComponent;
        emi = regularEmi;
        closingBalance = Math.max(0, currentBalance - principalComponent);
      }

      schedule.push({
        installmentNumber: i,
        openingBalanceMinor: currentBalance,
        emiAmountMinor: emi,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        closingBalanceMinor: closingBalance,
      });

      currentBalance = closingBalance;
    }
  } else {
    // FLAT_RATE
    const { totalInterestMinor } = calculateFlatRateEmi(
      principalAmountMinor,
      annualInterestRateBps,
      tenureMonths
    );
    const regularPrincipal = Math.floor(principalAmountMinor / tenureMonths);
    const regularInterest = Math.floor(totalInterestMinor / tenureMonths);

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      let principalComponent: number;
      let interestComponent: number;
      let closingBalance: number;

      if (isFinal) {
        principalComponent = currentBalance;
        interestComponent = totalInterestMinor - regularInterest * (tenureMonths - 1);
        closingBalance = 0;
      } else {
        principalComponent = regularPrincipal;
        interestComponent = regularInterest;
        closingBalance = Math.max(0, currentBalance - principalComponent);
      }

      const emi = principalComponent + interestComponent;

      schedule.push({
        installmentNumber: i,
        openingBalanceMinor: currentBalance,
        emiAmountMinor: emi,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        closingBalanceMinor: closingBalance,
      });

      currentBalance = closingBalance;
    }
  }

  return schedule;
}

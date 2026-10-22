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
  status?: "SCHEDULED" | "PAID" | "OVERRIDDEN";
}

/**
 * Calculates reducing balance monthly EMI.
 * For standard loan (residual = 0):
 *   EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * For lease with residual R:
 *   EMI = (P * (1 + r)^n - R) * r / ((1 + r)^n - 1)
 */
export function calculateReducingBalanceEmi(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number,
  residualValueMinor: number = 0
): number {
  if (tenureMonths <= 0) return principalAmountMinor;
  if (annualInterestRateBps <= 0) {
    return Math.floor((principalAmountMinor - residualValueMinor) / tenureMonths);
  }

  const r = annualInterestRateBps / (10000 * 12);
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = ((principalAmountMinor * factor - residualValueMinor) * r) / (factor - 1);

  return roundHalfUp(emi);
}

/**
 * Calculates flat rate monthly EMI.
 * Total interest = P * r * (tenureMonths / 12)
 * EMI = (P - residual + Total interest) / tenureMonths
 */
export function calculateFlatRateEmi(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number,
  residualValueMinor: number = 0
): {
  monthlyEmiMinor: number;
  totalInterestMinor: number;
} {
  const r = annualInterestRateBps / 10000;
  const years = tenureMonths / 12;
  const totalInterestMinor = roundHalfUp(principalAmountMinor * r * years);
  const amortizedPrincipal = Math.max(0, principalAmountMinor - residualValueMinor);
  const totalPayable = amortizedPrincipal + totalInterestMinor;
  const monthlyEmiMinor = Math.floor(totalPayable / tenureMonths);

  return {
    monthlyEmiMinor,
    totalInterestMinor,
  };
}

/**
 * Generates the full amortization schedule.
 * Absorbs rounding differences in the final installment.
 * For lease with residual, final closing balance equals residualValueMinor.
 */
export function generateAmortizationSchedule(
  principalAmountMinor: number,
  annualInterestRateBps: number,
  tenureMonths: number,
  calculationType: LoanCalculationType,
  residualValueMinor: number = 0
): LoanScheduleRow[] {
  const schedule: LoanScheduleRow[] = [];
  let currentBalance = principalAmountMinor;
  const r = annualInterestRateBps / (10000 * 12);

  if (calculationType === "REDUCING_BALANCE") {
    const regularEmi = calculateReducingBalanceEmi(
      principalAmountMinor,
      annualInterestRateBps,
      tenureMonths,
      residualValueMinor
    );

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      const interestComponent = roundHalfUp(currentBalance * r);

      let principalComponent: number;
      let emi: number;
      let closingBalance: number;

      if (isFinal) {
        principalComponent = Math.max(0, currentBalance - residualValueMinor);
        emi = principalComponent + interestComponent;
        closingBalance = residualValueMinor;
      } else {
        principalComponent = regularEmi - interestComponent;
        emi = regularEmi;
        closingBalance = Math.max(residualValueMinor, currentBalance - principalComponent);
      }

      schedule.push({
        installmentNumber: i,
        openingBalanceMinor: currentBalance,
        emiAmountMinor: emi,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        closingBalanceMinor: closingBalance,
        status: "SCHEDULED",
      });

      currentBalance = closingBalance;
    }
  } else {
    // FLAT_RATE
    const { totalInterestMinor } = calculateFlatRateEmi(
      principalAmountMinor,
      annualInterestRateBps,
      tenureMonths,
      residualValueMinor
    );
    const amortizedPrincipal = Math.max(0, principalAmountMinor - residualValueMinor);
    const regularPrincipal = Math.floor(amortizedPrincipal / tenureMonths);
    const regularInterest = Math.floor(totalInterestMinor / tenureMonths);

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      let principalComponent: number;
      let interestComponent: number;
      let closingBalance: number;

      if (isFinal) {
        principalComponent = Math.max(0, currentBalance - residualValueMinor);
        interestComponent = totalInterestMinor - regularInterest * (tenureMonths - 1);
        closingBalance = residualValueMinor;
      } else {
        principalComponent = regularPrincipal;
        interestComponent = regularInterest;
        closingBalance = Math.max(residualValueMinor, currentBalance - principalComponent);
      }

      const emi = principalComponent + interestComponent;

      schedule.push({
        installmentNumber: i,
        openingBalanceMinor: currentBalance,
        emiAmountMinor: emi,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        closingBalanceMinor: closingBalance,
        status: "SCHEDULED",
      });

      currentBalance = closingBalance;
    }
  }

  return schedule;
}

/**
 * Re-amortizes subsequent schedule rows when a row is overridden
 * or extra principal is paid.
 */
export function reamortizeRemainingSchedule(
  currentBalance: number,
  startInstallment: number,
  remainingTenure: number,
  annualInterestRateBps: number,
  calculationType: LoanCalculationType,
  residualValueMinor: number = 0,
  mode: "LOWER_EMI" | "SHORTER_TENURE" = "LOWER_EMI",
  targetEmiMinor?: number
): LoanScheduleRow[] {
  if (remainingTenure <= 0 || currentBalance <= residualValueMinor) {
    return [];
  }

  const r = annualInterestRateBps / (10000 * 12);
  const rows: LoanScheduleRow[] = [];
  let balance = currentBalance;

  if (mode === "SHORTER_TENURE" && targetEmiMinor && targetEmiMinor > 0) {
    // Keep target EMI, payoff completes sooner
    let inst = startInstallment;
    while (balance > residualValueMinor && inst < startInstallment + 240) {
      const interestComponent =
        calculationType === "FLAT_RATE"
          ? roundHalfUp(
              (balance * (annualInterestRateBps / 10000)) /
                12
            )
          : roundHalfUp(balance * r);
      let principalComponent = targetEmiMinor - interestComponent;
      if (principalComponent <= 0) {
        throw new Error("Target EMI does not amortize the remaining balance");
      }
      const closing = balance - principalComponent;

      if (closing <= residualValueMinor || principalComponent >= balance - residualValueMinor) {
        // Final payoff
        principalComponent = balance - residualValueMinor;
        const finalEmi = principalComponent + interestComponent;
        rows.push({
          installmentNumber: inst,
          openingBalanceMinor: balance,
          emiAmountMinor: finalEmi,
          principalComponentMinor: principalComponent,
          interestComponentMinor: interestComponent,
          closingBalanceMinor: residualValueMinor,
          status: "SCHEDULED",
        });
        break;
      }

      rows.push({
        installmentNumber: inst,
        openingBalanceMinor: balance,
        emiAmountMinor: targetEmiMinor,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        closingBalanceMinor: closing,
        status: "SCHEDULED",
      });

      balance = closing;
      inst++;
    }
    return rows;
  }

  // LOWER_EMI mode: recalculate over the remaining tenure
  const subSchedule = generateAmortizationSchedule(
    balance,
    annualInterestRateBps,
    remainingTenure,
    calculationType,
    residualValueMinor
  );

  return subSchedule.map((row, idx) => ({
    ...row,
    installmentNumber: startInstallment + idx,
  }));
}

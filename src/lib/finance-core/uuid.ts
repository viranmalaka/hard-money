import { v5 as uuidv5, v4 as uuidv4 } from "uuid";

// Standard fixed namespace for Hard Money deterministic IDs
export const HARD_MONEY_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // RFC4122 DNS namespace

export function generateUUID(): string {
  return uuidv4();
}

export function generateDeterministicUUID(name: string): string {
  return uuidv5(name, HARD_MONEY_NAMESPACE);
}

export function installmentTransactionId(planId: string, cycleEndDate: string): string {
  return generateDeterministicUUID(`${planId}:${cycleEndDate}`);
}

export function statementSnapshotId(accountId: string, cycleEndDate: string): string {
  return generateDeterministicUUID(`${accountId}:${cycleEndDate}`);
}

export function budgetMonthSnapshotId(budgetId: string, yyyyMm: string): string {
  return generateDeterministicUUID(`${budgetId}:${yyyyMm}`);
}

export function fdPayoutId(fixedDepositId: string, periodEndDate: string): string {
  return generateDeterministicUUID(`${fixedDepositId}:${periodEndDate}`);
}

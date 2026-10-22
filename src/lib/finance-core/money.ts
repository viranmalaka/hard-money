/**
 * Money & Rounding Utilities
 * Follows PRD Section 2.1:
 * - All amounts are integers in minor units (e.g. cents).
 * - Rates are in basis points (1 bp = 0.01% -> 12.75% = 1275 bps).
 * - Half-up rounding to the nearest integer.
 */

export function roundHalfUp(val: number): number {
  if (val < 0) {
    return -Math.round(Math.abs(val));
  }
  return Math.round(val);
}

export function bpsToRate(bps: number): number {
  return bps / 10000;
}

export function rateToBps(rate: number): number {
  return roundHalfUp(rate * 10000);
}

export function formatMoney(amountMinor: number, currency = "LKR", showSign = false): string {
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;

  const formattedMajor = major.toLocaleString("en-LK");
  const formattedMinor = minor.toString().padStart(2, "0");
  const formatted = `${currency} ${formattedMajor}.${formattedMinor}`;

  if (isNegative) {
    return `-${formatted}`;
  }
  if (showSign && amountMinor > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

export const formatMinorUnits = formatMoney;

export function parseMoneyToMinor(input: string): number {
  const cleaned = input.replace(/(?:LKR|USD|EUR|GBP|JPY|INR|Rs\.?|[₨$€£¥]|[\s,])/gi, "").trim();
  const match = cleaned.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = Number((match[3] || "").padEnd(2, "0"));
  const minor = whole * 100 + fraction;
  return sign * minor;
}

/**
 * Largest-remainder method (Hare-Niemeyer method).
 * Guarantees that the rounded percentages sum up to exactly targetTotal (typically 100).
 */
export function calculatePercentagesLargestRemainder(
  values: number[],
  targetTotal = 100
): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);

  const exacts = values.map((v) => (v / sum) * targetTotal);
  const floors = exacts.map((e) => Math.floor(e));
  const remainders = exacts.map((e, idx) => ({
    idx,
    remainder: e - floors[idx],
  }));

  const currentSum = floors.reduce((a, b) => a + b, 0);
  const diff = targetTotal - currentSum;
  remainders.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < diff; i++) {
    floors[remainders[i % remainders.length].idx] += 1;
  }

  return floors;
}

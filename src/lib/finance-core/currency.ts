export const SUPPORTED_CURRENCIES = ["LKR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const EXCHANGE_RATE_SCALE = 1_000_000;

export function normalizeCurrency(value: unknown): SupportedCurrency {
  return value === "USD" ? "USD" : "LKR";
}

export function rateMicrosToNumber(rateMicros: number | null | undefined): number {
  return (rateMicros ?? 0) / EXCHANGE_RATE_SCALE;
}

export function rateNumberToMicros(rate: number): number {
  return Math.round(rate * EXCHANGE_RATE_SCALE);
}

export function calculateConvertedMinor(
  sourceAmountMinor: number,
  exchangeRateMicros: number,
): number {
  return Math.round((sourceAmountMinor * exchangeRateMicros) / EXCHANGE_RATE_SCALE);
}

export function calculateExchangeRateMicros(
  sourceAmountMinor: number,
  destinationAmountMinor: number,
): number {
  if (sourceAmountMinor <= 0 || destinationAmountMinor <= 0) return 0;
  return Math.round((destinationAmountMinor * EXCHANGE_RATE_SCALE) / sourceAmountMinor);
}

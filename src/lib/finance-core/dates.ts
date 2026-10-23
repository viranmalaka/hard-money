export function addMonthsClamped(date: Date, months: number): Date {
  if (!Number.isInteger(months)) {
    throw new Error("months must be an integer");
  }

  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function addMonthsOnDay(date: Date, months: number, day: number): Date {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("day must be an integer between 1 and 31");
  }

  const result = addMonthsClamped(date, months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

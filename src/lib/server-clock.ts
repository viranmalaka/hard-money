let overriddenNow: Date | null = null;

export function getServerNow(): Date {
  if (overriddenNow !== null) {
    return new Date(overriddenNow.getTime());
  }
  return new Date();
}

export function setServerNow(date: Date | string | null): void {
  if (!date) {
    overriddenNow = null;
  } else {
    overriddenNow = new Date(date);
  }
}

export function resetServerClock(): void {
  overriddenNow = null;
}

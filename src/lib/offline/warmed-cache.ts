import type { LocalAccount, LocalCategory } from "@/lib/db";

const CACHED_ACCOUNTS_KEY = "hardmoney_warmed_accounts";
const CACHED_CATEGORIES_KEY = "hardmoney_warmed_categories";

export function warmReferenceDataCache(accounts: LocalAccount[], categories: LocalCategory[]): void {
  if (typeof window === "undefined") return;
  try {
    if (accounts && accounts.length > 0) {
      localStorage.setItem(CACHED_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
    if (categories && categories.length > 0) {
      localStorage.setItem(CACHED_CATEGORIES_KEY, JSON.stringify(categories));
    }
  } catch (err) {
    console.warn("Failed to save warmed reference data in localStorage:", err);
  }
}

export function getWarmedAccounts(): LocalAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getWarmedCategories(): LocalCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHED_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

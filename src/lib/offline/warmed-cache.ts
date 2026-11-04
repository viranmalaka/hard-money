import type { LocalAccount, LocalCategory, LocalTemplate } from "@/lib/db";

const CACHED_ACCOUNTS_KEY = "hardmoney_warmed_accounts";
const CACHED_CATEGORIES_KEY = "hardmoney_warmed_categories";
const CACHED_TEMPLATES_KEY = "hardmoney_warmed_templates";

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

export function warmTemplatesCache(templates: LocalTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHED_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (err) {
    console.warn("Failed to save warmed templates in localStorage:", err);
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

export function getWarmedTemplates(): LocalTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHED_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

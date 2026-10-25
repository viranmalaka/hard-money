"use client";

import { getDatabase, HardMoneyDB } from "@/lib/db";

type TabId = "trans" | "stats" | "budget" | "accounts" | "more";

const prefetchedTabs = new Set<string>();

/**
 * Pre-warms data for a specific tab from Dexie IndexedDB into memory.
 */
export async function prefetchTabData(tab: TabId, userId: string | null = null): Promise<void> {
  if (typeof window === "undefined") return;
  if (prefetchedTabs.has(tab)) return;
  prefetchedTabs.add(tab);

  const db: HardMoneyDB = getDatabase(userId);
  const notDeleted = <R extends { deletedAt?: unknown }>(r: R) => !r.deletedAt;

  try {
    switch (tab) {
      case "trans":
        await Promise.all([
          db.transactions.filter(notDeleted).limit(100).toArray(),
          db.accounts.filter(notDeleted).toArray(),
          db.categories.filter(notDeleted).toArray(),
        ]);
        break;

      case "stats":
        await Promise.all([
          db.transactions.filter(notDeleted).toArray(),
          db.categories.filter(notDeleted).toArray(),
        ]);
        break;

      case "budget":
        await Promise.all([
          db.budgets.filter(notDeleted).toArray(),
          db.budgetSnapshots.toArray(),
          db.categories.filter(notDeleted).toArray(),
        ]);
        break;

      case "accounts":
        await Promise.all([
          db.accounts.filter(notDeleted).toArray(),
          db.creditCardStatements.toArray(),
          db.installmentPlans.filter(notDeleted).toArray(),
          db.fixedDeposits.filter(notDeleted).toArray(),
          db.loans.filter(notDeleted).toArray(),
        ]);
        break;

      case "more":
        await Promise.all([
          db.shoppingListItems.filter(notDeleted).toArray(),
          db.templates.filter(notDeleted).toArray(),
        ]);
        break;
    }
  } catch (err) {
    // Non-fatal prefetch error - ignore and allow live query to fetch normally
    console.debug(`[Prefetch] Failed to prefetch data for ${tab}:`, err);
  }
}

/**
 * Pre-warms all primary tabs sequentially during idle time.
 */
export function prefetchSubsequentTabs(userId: string | null = null): void {
  if (typeof window === "undefined") return;

  const runPrefetch = () => {
    const tabs: TabId[] = ["stats", "budget", "accounts", "more", "trans"];
    tabs.forEach((tab, index) => {
      // Stagger queries slightly to avoid any main-thread hitch
      setTimeout(() => {
        void prefetchTabData(tab, userId);
      }, index * 80);
    });
  };

  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
      runPrefetch,
      { timeout: 3000 }
    );
  } else {
    setTimeout(runPrefetch, 400);
  }
}

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { prefetchTabData, prefetchSubsequentTabs } from "@/lib/prefetch/tab-prefetch";
import { useSync } from "@/components/sync-provider";

export type TabId = "trans" | "stats" | "budget" | "accounts" | "more";

export const TAB_CONFIG: Record<TabId, { path: string; name: string }> = {
  trans: { path: "/", name: "Trans." },
  stats: { path: "/stats", name: "Stats" },
  budget: { path: "/budget", name: "Budget" },
  accounts: { path: "/accounts", name: "Accounts" },
  more: { path: "/more", name: "More" },
};

export const PATH_TO_TAB: Record<string, TabId> = {
  "/": "trans",
  "/stats": "stats",
  "/budget": "budget",
  "/accounts": "accounts",
  "/more": "more",
};

export function getTabFromPath(path: string): TabId | null {
  if (path === "/") return "trans";
  if (path === "/stats") return "stats";
  if (path === "/budget") return "budget";
  if (path === "/accounts") return "accounts";
  if (path === "/more") return "more";
  return null;
}

interface TabNavigationContextValue {
  activeTab: TabId | null;
  isMainTab: boolean;
  visitedTabs: Set<TabId>;
  switchToTab: (destination: TabId | string) => void;
  prefetchTab: (tab: TabId) => void;
}

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null);

export function TabNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useSync();

  const currentTab = useMemo(() => getTabFromPath(pathname), [pathname]);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => {
    const initial = new Set<TabId>();
    if (currentTab) initial.add(currentTab);
    return initial;
  });

  // Handle external browser back/forward buttons & popstate navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      if (tab) {
        setVisitedTabs((prev) => {
          if (prev.has(tab)) return prev;
          const next = new Set(prev);
          next.add(tab);
          return next;
        });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeTab = currentTab;

  // Idle prefetch subsequent tabs on startup
  useEffect(() => {
    prefetchSubsequentTabs(userId);
  }, [userId]);

  const prefetchTab = useCallback(
    (tab: TabId) => {
      void prefetchTabData(tab, userId);
    },
    [userId]
  );

  const switchToTab = useCallback(
    (destination: TabId | string) => {
      let targetTab: TabId | null = null;
      let targetPath = destination;

      if (destination in TAB_CONFIG) {
        targetTab = destination as TabId;
        targetPath = TAB_CONFIG[targetTab].path;
      } else {
        targetTab = getTabFromPath(destination);
      }

      // If switching to one of the 5 primary tabs
      if (targetTab && targetPath) {
        // Immediate DOM state update (0ms switch)
        setVisitedTabs((prev) => {
          if (prev.has(targetTab)) return prev;
          const next = new Set(prev);
          next.add(targetTab);
          return next;
        });

        // Fast history update with popstate dispatch so Next.js hooks stay synchronized
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, "", targetPath);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } else {
        // Standard Next.js route navigation for subpages or auth routes
        router.push(destination);
      }
    },
    [router]
  );

  const value = useMemo<TabNavigationContextValue>(
    () => ({
      activeTab,
      isMainTab: activeTab !== null,
      visitedTabs,
      switchToTab,
      prefetchTab,
    }),
    [activeTab, visitedTabs, switchToTab, prefetchTab]
  );

  return (
    <TabNavigationContext.Provider value={value}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation(): TabNavigationContextValue {
  const ctx = useContext(TabNavigationContext);
  if (!ctx) {
    throw new Error("useTabNavigation must be used within a TabNavigationProvider");
  }
  return ctx;
}

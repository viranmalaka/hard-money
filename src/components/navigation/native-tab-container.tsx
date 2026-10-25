"use client";

import React, { Suspense } from "react";
import { useTabNavigation } from "./tab-navigation-context";
import TransactionsTab from "@/app/page";
import StatsTab from "@/app/stats/page";
import BudgetTab from "@/app/budget/page";
import AccountsTab from "@/app/accounts/page";
import MoreTab from "@/app/more/page";

interface NativeTabContainerProps {
  children: React.ReactNode;
}

export function NativeTabContainer({ children }: NativeTabContainerProps) {
  const { activeTab, isMainTab, visitedTabs } = useTabNavigation();

  // If we are on a subroute (e.g. /accounts/[id], /more/preferences, /login), render Next.js children
  if (!isMainTab) {
    return <>{children}</>;
  }

  return (
    <div className="relative w-full h-full min-h-0 flex-1">
      {/* 1. Trans. Tab */}
      {visitedTabs.has("trans") && (
        <div
          data-tab-screen="trans"
          className={`h-full w-full ${activeTab === "trans" ? "block" : "hidden"}`}
          inert={activeTab !== "trans" ? true : undefined}
          style={{ contentVisibility: activeTab === "trans" ? "visible" : "auto" }}
        >
          <Suspense fallback={null}>
            <TransactionsTab />
          </Suspense>
        </div>
      )}

      {/* 2. Stats Tab */}
      {visitedTabs.has("stats") && (
        <div
          data-tab-screen="stats"
          className={`h-full w-full ${activeTab === "stats" ? "block" : "hidden"}`}
          inert={activeTab !== "stats" ? true : undefined}
          style={{ contentVisibility: activeTab === "stats" ? "visible" : "auto" }}
        >
          <Suspense fallback={null}>
            <StatsTab />
          </Suspense>
        </div>
      )}

      {/* 3. Budget Tab */}
      {visitedTabs.has("budget") && (
        <div
          data-tab-screen="budget"
          className={`h-full w-full ${activeTab === "budget" ? "block" : "hidden"}`}
          inert={activeTab !== "budget" ? true : undefined}
          style={{ contentVisibility: activeTab === "budget" ? "visible" : "auto" }}
        >
          <Suspense fallback={null}>
            <BudgetTab />
          </Suspense>
        </div>
      )}

      {/* 4. Accounts Tab */}
      {visitedTabs.has("accounts") && (
        <div
          data-tab-screen="accounts"
          className={`h-full w-full ${activeTab === "accounts" ? "block" : "hidden"}`}
          inert={activeTab !== "accounts" ? true : undefined}
          style={{ contentVisibility: activeTab === "accounts" ? "visible" : "auto" }}
        >
          <Suspense fallback={null}>
            <AccountsTab />
          </Suspense>
        </div>
      )}

      {/* 5. More Tab */}
      {visitedTabs.has("more") && (
        <div
          data-tab-screen="more"
          className={`h-full w-full ${activeTab === "more" ? "block" : "hidden"}`}
          inert={activeTab !== "more" ? true : undefined}
          style={{ contentVisibility: activeTab === "more" ? "visible" : "auto" }}
        >
          <Suspense fallback={null}>
            <MoreTab />
          </Suspense>
        </div>
      )}
    </div>
  );
}

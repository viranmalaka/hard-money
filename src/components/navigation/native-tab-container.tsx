"use client";

import React, { Suspense } from "react";
import { useTabNavigation } from "./tab-navigation-context";
import TransactionsTab from "@/app/page";
import StatsTab from "@/app/stats/page";
import AccountsTab from "@/app/accounts/page";
import MoreTab from "@/app/more/page";

interface NativeTabContainerProps {
  children: React.ReactNode;
}

export function NativeTabContainer({ children }: NativeTabContainerProps) {
  const { activeTab, isMainTab, visitedTabs } = useTabNavigation();

  // Subroutes (/budget, /accounts/[id], /more/*, /login, /register, /offline) render Next.js children
  if (!isMainTab) {
    return <>{children}</>;
  }

  return (
    <div className="relative w-full">
      {/* 1. Home (Wallet Stack) Tab */}
      {visitedTabs.has("trans") && (
        <div
          data-tab-screen="trans"
          className={`w-full ${activeTab === "trans" ? "block" : "hidden"}`}
          inert={activeTab !== "trans" ? true : undefined}
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
          className={`w-full ${activeTab === "stats" ? "block" : "hidden"}`}
          inert={activeTab !== "stats" ? true : undefined}
        >
          <Suspense fallback={null}>
            <StatsTab />
          </Suspense>
        </div>
      )}

      {/* 3. Accounts Tab */}
      {visitedTabs.has("accounts") && (
        <div
          data-tab-screen="accounts"
          className={`w-full ${activeTab === "accounts" ? "block" : "hidden"}`}
          inert={activeTab !== "accounts" ? true : undefined}
        >
          <Suspense fallback={null}>
            <AccountsTab />
          </Suspense>
        </div>
      )}

      {/* 4. More Tab */}
      {visitedTabs.has("more") && (
        <div
          data-tab-screen="more"
          className={`w-full ${activeTab === "more" ? "block" : "hidden"}`}
          inert={activeTab !== "more" ? true : undefined}
        >
          <Suspense fallback={null}>
            <MoreTab />
          </Suspense>
        </div>
      )}
    </div>
  );
}

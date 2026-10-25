"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  PieChart,
  Settings,
  Wallet,
} from "lucide-react";
import { useTabNavigation, TabId } from "./tab-navigation-context";

export function BottomNav() {
  const pathname = usePathname();
  const { activeTab, switchToTab, prefetchTab } = useTabNavigation();

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const navItems: { id: TabId; name: string; href: string; icon: typeof ArrowLeftRight }[] = [
    { id: "trans", name: "Trans.", href: "/", icon: ArrowLeftRight },
    { id: "stats", name: "Stats", href: "/stats", icon: BarChart3 },
    { id: "budget", name: "Budget", href: "/budget", icon: PieChart },
    { id: "accounts", name: "Accounts", href: "/accounts", icon: Wallet },
    { id: "more", name: "More", href: "/more", icon: Settings },
  ];

  return (
    <nav
      data-testid="bottom-nav"
      style={{ viewTransitionName: "bottom-nav" }}
      className="mobile-only fixed bottom-0 left-0 right-0 bottom-nav-safe bg-surface border-t border-hairline z-40 items-center justify-around px-1 select-none"
    >
      {navItems.map((item) => {
        const isActive = activeTab
          ? activeTab === item.id
          : item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            transitionTypes={["nav-tab"]}
            data-testid={`bottom-nav-${item.id}`}
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
            onClick={(e) => {
              // Intercept for instant native tab switch
              e.preventDefault();
              switchToTab(item.id);
            }}
            onPointerDown={() => {
              // Pre-warm data on touch/pointer down before click completes
              prefetchTab(item.id);
            }}
            onMouseEnter={() => {
              prefetchTab(item.id);
            }}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 gap-1 text-[11px] font-medium transition-colors ${
              isActive
                ? "text-[var(--text)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Icon size={20} className={isActive ? "stroke-[2.2px]" : "stroke-[1.6px]"} />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

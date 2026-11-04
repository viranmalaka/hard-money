"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Home,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import { useTabNavigation, TabId } from "./tab-navigation-context";
import { useQuickAdd } from "../transaction/quick-add-context";

export function BottomNav() {
  const pathname = usePathname();
  const { activeTab, switchToTab, prefetchTab } = useTabNavigation();
  const { openQuickAdd } = useQuickAdd();

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/offline"
  ) {
    return null;
  }

  const isNavActive = (id: TabId, href: string) => {
    if (activeTab) return activeTab === id;
    if (id === "more" && (pathname === "/budget" || pathname.startsWith("/more"))) {
      return true;
    }
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderSlot = (
    id: TabId,
    name: string,
    href: string,
    Icon: typeof Home
  ) => {
    const active = isNavActive(id, href);
    return (
      <Link
        key={id}
        href={href}
        transitionTypes={["nav-tab"]}
        data-testid={`bottom-nav-${id}`}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        onClick={(e) => {
          e.preventDefault();
          switchToTab(id);
        }}
        onPointerDown={() => prefetchTab(id)}
        onMouseEnter={() => prefetchTab(id)}
        className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-colors ${
          active
            ? "text-[var(--accent)] font-bold"
            : "text-[var(--text-muted)] hover:text-[var(--text)] font-medium"
        }`}
      >
        <Icon size={21} className={active ? "stroke-[2.4px]" : "stroke-[1.8px]"} />
        <span className="text-2xs leading-none">{name}</span>
      </Link>
    );
  };

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Primary Mobile Navigation"
      style={{ viewTransitionName: "bottom-nav" }}
      className="mobile-only shrink-0 w-full relative z-40 bg-[var(--surface)] border-t border-[var(--border)] px-3 bottom-nav-safe items-center justify-center select-none"
    >
      <div className="w-full max-w-lg mx-auto grid grid-cols-5 items-center">
        {renderSlot("trans", "Home", "/", Home)}
        {renderSlot("stats", "Stats", "/stats", BarChart3)}

        {/* Split-Lens Center Circular Quick-Add Trigger */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            data-testid="fab"
            onClick={() => openQuickAdd({ type: "EXPENSE" })}
            aria-label="Add Transaction"
            title="New Transaction"
            className="w-12 h-12 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={23} strokeWidth={2.6} />
          </button>
        </div>

        {renderSlot("accounts", "Accounts", "/accounts", Wallet)}
        {renderSlot("more", "More", "/more", Settings)}
      </div>
    </nav>
  );
}

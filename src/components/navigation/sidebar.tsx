"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Home,
  Landmark,
  Moon,
  Plus,
  Settings,
  Sun,
  Wallet,
} from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { useTheme } from "../theme-provider";
import { SyncIndicator } from "../sync-provider";
import { useQuickAdd } from "../transaction/quick-add-context";
import { useTabNavigation, TabId } from "./tab-navigation-context";

export function Sidebar() {
  const pathname = usePathname();
  const { activeTab, switchToTab, prefetchTab } = useTabNavigation();
  const { resolvedTheme, toggleTheme, colorSwap, toggleColorSwap } = useTheme();
  const { openQuickAdd } = useQuickAdd();
  const [collapsed, setCollapsed] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      queueMicrotask(() => setCollapsed(true));
    }
  }, []);

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/offline"
  ) {
    return null;
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "true" : "false");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const navItems: {
    id: TabId;
    name: string;
    href: string;
    icon: typeof Home;
  }[] = [
    { id: "trans", name: "Home", href: "/", icon: Home },
    { id: "stats", name: "Stats", href: "/stats", icon: BarChart3 },
    { id: "accounts", name: "Accounts", href: "/accounts", icon: Wallet },
    { id: "more", name: "More", href: "/more", icon: Settings },
  ];

  const isNavActive = (id: TabId, href: string) => {
    if (activeTab) return activeTab === id;
    if (id === "more" && (pathname === "/budget" || pathname.startsWith("/more"))) {
      return true;
    }
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={`desktop-only flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 select-none ${
        collapsed ? "w-20" : "w-68"
      }`}
    >
      {/* Brand & Collapse Header */}
      <div className="flex items-center justify-between h-18 px-4 border-b border-[var(--border)]">
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shadow-xs shrink-0">
              <Landmark size={19} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm tracking-tight text-[var(--text)] truncate">
                Hard Money
              </p>
              <p className="text-2xs font-medium text-[var(--text-muted)] truncate">
                Private Treasury
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          data-testid="sidebar-toggle"
          onClick={handleToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors mx-auto md:mx-0 cursor-pointer shrink-0"
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      {/* Primary Quick-Add Action */}
      <div className="px-3.5 pt-5 pb-2">
        <button
          type="button"
          data-testid="sidebar-quick-add-btn"
          onClick={() => openQuickAdd({ type: "EXPENSE" })}
          title="New Transaction"
          className={`w-full flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm shadow-xs hover:opacity-95 active:scale-98 transition-all cursor-pointer ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <Plus size={19} strokeWidth={2.6} className="shrink-0" />
          {!collapsed && <span>New Transaction</span>}
        </button>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Desktop Navigation" className="flex-1 py-3 px-3.5 space-y-1.5">
        {navItems.map((item) => {
          const isActive = isNavActive(item.id, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              transitionTypes={["nav-tab"]}
              data-testid={`sidebar-nav-${item.id}`}
              data-active={isActive ? "true" : "false"}
              aria-current={isActive ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                switchToTab(item.id);
              }}
              onMouseEnter={() => prefetchTab(item.id)}
              className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-sm transition-all ${
                isActive
                  ? "bg-[var(--accent)]/12 text-[var(--accent)] font-bold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] font-medium"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? item.name : undefined}
            >
              <Icon
                size={20}
                className={`shrink-0 ${isActive ? "stroke-[2.3px]" : "stroke-[1.8px]"}`}
              />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer Controls: Sync, Theme & Color Swap */}
      <div className="p-3.5 border-t border-[var(--border)] space-y-1.5">
        <div
          className={`flex px-1 py-1 ${collapsed ? "justify-center" : "items-center"}`}
        >
          <SyncIndicator isMobile={false} />
        </div>

        <button
          type="button"
          data-testid="theme-toggle"
          onClick={toggleTheme}
          title={
            mounted
              ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`
              : "Toggle Theme"
          }
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun size={17} className="text-amber-400 shrink-0" />
          ) : (
            <Moon size={17} className="shrink-0" />
          )}
          {!collapsed && (
            <span>
              {mounted && resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="color-swap-toggle"
          onClick={toggleColorSwap}
          title={`Color swap: ${
            colorSwap ? "Active (Swapped)" : "Default (Emerald in, Rose out)"
          }`}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <CreditCard size={17} className="shrink-0" />
          {!collapsed && (
            <span>{colorSwap ? "Default Colors" : "Swap In/Out Colors"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

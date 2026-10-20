"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Moon,
  PieChart,
  Plus,
  Settings,
  Sun,
  Wallet,
} from "lucide-react";
import { useMounted } from "@/lib/use-mounted";
import { useTheme } from "../theme-provider";
import { SyncIndicator } from "../sync-provider";
import { useQuickAdd } from "../transaction/quick-add-context";

export function Sidebar() {
  const pathname = usePathname();
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

  if (pathname === "/login" || pathname === "/register") return null;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "true" : "false");
      } catch {}
      return next;
    });
  };

  const navItems = [
    { id: "trans", name: "Trans.", href: "/", icon: ArrowLeftRight },
    { id: "stats", name: "Stats", href: "/stats", icon: BarChart3 },
    { id: "budget", name: "Budget", href: "/budget", icon: PieChart },
    { id: "accounts", name: "Accounts", href: "/accounts", icon: Wallet },
    { id: "more", name: "More", href: "/more", icon: Settings },
  ];

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={`desktop-only flex flex-col border-r border-hairline bg-surface transition-all duration-200 select-none ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand & Collapse Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-hairline">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs">
              H
            </div>
            <span className="font-semibold text-sm tracking-tight text-[var(--text)]">
              Hard Money
            </span>
          </div>
        )}
        <button
          type="button"
          data-testid="sidebar-toggle"
          onClick={handleToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mx-auto md:mx-0"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              transitionTypes={["nav-tab"]}
              data-testid={`sidebar-nav-${item.id}`}
              data-active={isActive ? "true" : "false"}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--border)] text-[var(--text)] font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)]/50"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? item.name : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}

        {/* Quick Add Button in Sidebar */}
        <div className="pt-3 px-1">
          <button
            type="button"
            data-testid="sidebar-quick-add-btn"
            onClick={() => openQuickAdd()}
            title="Add Transaction"
            className={`w-full flex items-center gap-2.5 py-2 px-3 rounded bg-[var(--text)] text-[var(--bg)] font-semibold text-xs hover:opacity-90 active:scale-98 transition-all ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <Plus size={16} strokeWidth={2.5} className="shrink-0" />
            {!collapsed && <span>New Transaction</span>}
          </button>
        </div>
      </nav>

      {/* Footer Controls: Sync, Theme & Color Swap */}
      <div className="p-3 border-t border-hairline space-y-2">
        <div className={`flex ${collapsed ? "justify-center" : "items-center"}`}>
          <SyncIndicator isMobile={false} />
        </div>

        <button
          type="button"
          data-testid="theme-toggle"
          onClick={toggleTheme}
          title={mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode` : "Toggle Theme"}
          className={`w-full flex items-center gap-3 p-2 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun size={16} className="text-amber-400 shrink-0" />
          ) : (
            <Moon size={16} className="shrink-0" />
          )}
          {!collapsed && (
            <span>{mounted && resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          )}
        </button>

        <button
          type="button"
          data-testid="color-swap-toggle"
          onClick={toggleColorSwap}
          title={`Color swap: ${colorSwap ? "Active (Red income, Blue expense)" : "Default (Blue income, Red expense)"}`}
          className={`w-full flex items-center gap-3 p-2 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <CreditCard size={16} className="shrink-0" />
          {!collapsed && (
            <span>{colorSwap ? "Default Colors" : "Swap In/Out Colors"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

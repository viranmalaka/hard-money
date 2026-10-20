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

export function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const navItems = [
    { id: "trans", name: "Trans.", href: "/", icon: ArrowLeftRight },
    { id: "stats", name: "Stats", href: "/stats", icon: BarChart3 },
    { id: "budget", name: "Budget", href: "/budget", icon: PieChart },
    { id: "accounts", name: "Accounts", href: "/accounts", icon: Wallet },
    { id: "more", name: "More", href: "/more", icon: Settings },
  ];

  return (
    <nav
      data-testid="bottom-nav"
      className="mobile-only fixed bottom-0 left-0 right-0 bottom-nav-safe bg-surface border-t border-hairline z-40 items-center justify-around px-1 select-none"
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`bottom-nav-${item.id}`}
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
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

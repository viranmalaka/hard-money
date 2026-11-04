"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, Moon, Sun, CreditCard } from "lucide-react";
import { useTheme } from "../theme-provider";
import { useMounted } from "@/lib/use-mounted";
import { SyncIndicator } from "../sync-provider";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  rightSlot?: React.ReactNode;
  testId?: string;
}

export function AppHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  rightSlot,
  testId,
}: AppHeaderProps) {
  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();

  return (
    <header
      data-testid={testId}
      className="sticky top-0 z-30 -mx-5 sm:-mx-7 -mt-4 sm:-mt-6 px-5 sm:px-7 py-3 sm:py-4 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]/60 flex items-center justify-between gap-3 select-none"
    >
      <div className="flex items-center gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            transitionTypes={["nav-back"]}
            aria-label={backLabel}
            data-testid="back-button"
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors shrink-0"
          >
            <ChevronLeft size={19} />
          </Link>
        )}
        <div className="min-w-0">
          {subtitle && (
            <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)] truncate">
              {subtitle}
            </p>
          )}
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)] truncate">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightSlot}
        <div className="mobile-only flex items-center gap-2">
          <SyncIndicator isMobile={true} />
          <button
            type="button"
            data-testid="color-swap-toggle"
            onClick={toggleColorSwap}
            title={`Color swap: ${colorSwap ? "Active" : "Default"}`}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            aria-label="Toggle Color Swap"
          >
            <CreditCard size={17} />
          </button>

          <button
            type="button"
            data-testid="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            aria-label="Toggle Theme"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun size={17} className="text-amber-400" />
            ) : (
              <Moon size={17} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

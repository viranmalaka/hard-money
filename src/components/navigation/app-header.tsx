"use client";

import React from "react";
import { Moon, Sun, CreditCard } from "lucide-react";
import { useTheme } from "../theme-provider";
import { useMounted } from "@/lib/use-mounted";

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-hairline bg-surface select-none">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          {title}
        </h1>
      </div>

      {/* Mobile Top Controls (hidden on desktop where sidebar has them) */}
      <div className="mobile-only flex items-center gap-1">
        <button
          type="button"
          data-testid="color-swap-toggle"
          onClick={toggleColorSwap}
          title={`Color swap: ${colorSwap ? "Active" : "Default"}`}
          className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          aria-label="Toggle Color Swap"
        >
          <CreditCard size={18} />
        </button>

        <button
          type="button"
          data-testid="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          aria-label="Toggle Theme"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun size={18} className="text-amber-400" />
          ) : (
            <Moon size={18} />
          )}
        </button>
      </div>
    </header>
  );
}

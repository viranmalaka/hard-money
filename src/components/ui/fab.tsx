"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useQuickAdd } from "@/components/transaction/quick-add-context";

interface FabProps {
  onClick?: () => void;
}

export function Fab({ onClick }: FabProps) {
  const pathname = usePathname();
  const { openQuickAdd } = useQuickAdd();

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openQuickAdd();
    }
  };

  return (
    <>
      {/* Mobile Floating Action Button */}
      <button
        type="button"
        data-testid="quick-add-fab"
        onClick={handleClick}
        aria-label="Quick Add Transaction"
        className="mobile-only fixed right-4 bottom-20 w-13 h-13 rounded-full bg-[var(--accent)] text-white shadow-md items-center justify-center active:scale-95 transition-transform z-30"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Desktop Quick Add Button */}
      <button
        type="button"
        data-testid="quick-add-btn"
        onClick={handleClick}
        aria-label="Add Transaction"
        className="desktop-only fixed right-6 bottom-6 items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--text)] text-[var(--bg)] shadow-sm font-semibold text-xs hover:opacity-90 active:scale-95 transition-all z-30"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>Add Transaction</span>
      </button>
    </>
  );
}

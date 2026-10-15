"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  currentDate?: Date;
  onChange?: (newDate: Date) => void;
}

export function MonthSwitcher({ currentDate, onChange }: MonthSwitcherProps) {
  const [date, setDate] = useState(() => currentDate || new Date(2026, 9, 1));

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const handlePrev = () => {
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    setDate(prev);
    onChange?.(prev);
  };

  const handleNext = () => {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    setDate(next);
    onChange?.(next);
  };

  return (
    <div
      data-testid="month-switcher"
      className="flex items-center justify-between px-4 py-2 bg-app select-none"
    >
      <button
        type="button"
        data-testid="prev-month-btn"
        onClick={handlePrev}
        aria-label="Previous Month"
        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-surface transition-colors"
      >
        <ChevronLeft size={18} />
      </button>

      <span
        data-testid="current-month-label"
        className="font-semibold text-sm tracking-tight text-[var(--text)]"
      >
        {monthNames[date.getMonth()]} {date.getFullYear()}
      </span>

      <button
        type="button"
        data-testid="next-month-btn"
        onClick={handleNext}
        aria-label="Next Month"
        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-surface transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

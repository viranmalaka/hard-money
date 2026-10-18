"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  currentDate?: Date;
  onChange?: (newDate: Date) => void;
}

export function MonthSwitcher({ currentDate, onChange }: MonthSwitcherProps) {
  const [internalDate, setInternalDate] = useState(() => currentDate || new Date(2026, 9, 1));
  const date = currentDate || internalDate;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const touchStartXRef = useRef<number | null>(null);

  const handlePrev = () => {
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    setInternalDate(prev);
    onChange?.(prev);
  };

  const handleNext = () => {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    setInternalDate(next);
    onChange?.(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;

    // Swipe left -> next month (diff > 40)
    if (diff > 40) {
      handleNext();
    } else if (diff < -40) {
      // Swipe right -> prev month (diff < -40)
      handlePrev();
    }
    touchStartXRef.current = null;
  };

  return (
    <div
      tabIndex={0}
      data-testid="month-switcher"
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex items-center justify-between px-4 py-2 bg-app select-none focus:outline-none"
    >
      <button
        type="button"
        data-testid="month-prev"
        onClick={handlePrev}
        aria-label="Previous Month"
        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-surface transition-colors cursor-pointer"
      >
        <ChevronLeft size={18} />
      </button>

      <span
        data-testid="month-label"
        className="font-semibold text-sm tracking-tight text-[var(--text)] pointer-events-none"
      >
        {monthNames[date.getMonth()]} {date.getFullYear()}
      </span>

      <button
        type="button"
        data-testid="month-next"
        onClick={handleNext}
        aria-label="Next Month"
        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-surface transition-colors cursor-pointer"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

"use client";

import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div
      data-testid="offline-fallback-page"
      className="flex flex-col items-center justify-center min-h-[75vh] px-6 py-12 text-center"
    >
      <div className="max-w-md w-full rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-8 flex flex-col items-center shadow-xs">
        <div className="w-16 h-16 rounded-3xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center mb-5 text-[var(--accent)]">
          <WifiOff size={30} />
        </div>
        <h1 className="text-xl font-bold text-[var(--text)] mb-2">You are currently offline</h1>
        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed mb-6">
          This route hasn&apos;t been cached yet. Your already visited tabs and cached ledger data
          remain accessible even without an internet connection.
        </p>
        <button
          onClick={handleRetry}
          data-testid="offline-retry-btn"
          className="h-11 px-6 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
        >
          <RefreshCw size={15} />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}

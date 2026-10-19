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
      className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] border border-hairline flex items-center justify-center mb-4 text-[var(--accent)]">
        <WifiOff size={32} />
      </div>
      <h1 className="text-xl font-bold text-[var(--text)] mb-2">You are currently offline</h1>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">
        This route hasn&apos;t been cached yet. Your already visited tabs and cached ledger data are
        still accessible even without an internet connection.
      </p>
      <button
        onClick={handleRetry}
        data-testid="offline-retry-btn"
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
      >
        <RefreshCw size={16} />
        <span>Try Again</span>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * SplashScreenClient:
 * Hydration controller for ServerSplashScreen.
 * Coordinates the status text transitions, tap/click-to-skip,
 * session storage tracking, and smooth exit fade-out.
 */
export function SplashScreenClient() {
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tickerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const el = document.getElementById("hm-splash-screen");
    const statusEl = document.getElementById("hm-splash-status");
    const modeEl = document.getElementById("hm-splash-mode-label");
    const skipBtn = document.getElementById("hm-splash-skip-btn");

    // If splash is not present, nothing to coordinate
    if (!el) return;

    // Detect PWA Standalone mode
    const nav = window.navigator as unknown as { standalone?: boolean };
    const isPwa = Boolean(
      nav?.standalone ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches
    );

    if (modeEl && isPwa) {
      modeEl.textContent = "PWA Standalone Mode";
    }

    const dismissSplash = () => {
      if (!el || el.classList.contains("hm-splash-exit")) return;
      el.classList.add("hm-splash-exit");
      sessionStorage.setItem("hardmoney_splash_shown", "true");

      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = setTimeout(() => {
        document.documentElement.classList.add("hm-splash-hidden");
        el.classList.remove("hm-splash-exit");
      }, 450);
    };

    const statusSteps = [
      "Counting cash flows & reserves...",
      "Streaming incoming & outgoing money...",
      "Balancing double-entry ledger...",
      "Personal treasury ready.",
    ];

    let step = 0;
    const startTime = Date.now();
    const minDuration = 2000;

    if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);
    tickerIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 600) step = 0;
      else if (elapsed < 1200) step = 1;
      else if (elapsed < 1700) step = 2;
      else step = 3;

      if (statusEl && statusSteps[step]) {
        statusEl.textContent = statusSteps[step];
      }

      if (elapsed >= minDuration) {
        clearInterval(tickerIntervalRef.current!);
        dismissSplash();
      }
    }, 100);

    // Tap or click anywhere on splash screen dismisses
    const handleSplashClick = (e: MouseEvent | TouchEvent) => {
      e.stopPropagation();
      dismissSplash();
    };

    el.addEventListener("click", handleSplashClick);
    if (skipBtn) {
      skipBtn.addEventListener("click", handleSplashClick);
    }

    // Allow re-triggering from Preferences "Preview" button
    const handleCustomTrigger = () => {
      document.documentElement.classList.remove("hm-splash-hidden");
      el.classList.remove("hm-splash-exit");
      if (statusEl) statusEl.textContent = statusSteps[0];
      const replayStart = Date.now();

      if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);
      tickerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - replayStart;
        if (elapsed < 600) step = 0;
        else if (elapsed < 1200) step = 1;
        else if (elapsed < 1700) step = 2;
        else step = 3;

        if (statusEl && statusSteps[step]) {
          statusEl.textContent = statusSteps[step];
        }

        if (elapsed >= minDuration) {
          clearInterval(tickerIntervalRef.current!);
          dismissSplash();
        }
      }, 100);
    };

    window.addEventListener("hardmoney_trigger_splash", handleCustomTrigger);

    return () => {
      el.removeEventListener("click", handleSplashClick);
      if (skipBtn) skipBtn.removeEventListener("click", handleSplashClick);
      window.removeEventListener("hardmoney_trigger_splash", handleCustomTrigger);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);
    };
  }, []);

  return null;
}


"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface HardMoneyWindow extends Window {
  __hardMoneyInstallPrompt?: Event;
  __hardMoneyPrimeAssets?: () => Promise<void>;
  __hardMoneySwRegistration?: ServiceWorkerRegistration;
  __hardMoneyIsUpdating?: { current: boolean };
  __hardMoneyTriggerUpdatePrompt?: () => void;
}

export function PwaManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const hmWindow = window as HardMoneyWindow;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      hmWindow.__hardMoneyInstallPrompt = e;
      window.dispatchEvent(new CustomEvent("hardmoney_install_ready", { detail: e }));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const primeAssetCache = async () => {
      if (!("caches" in window)) return;
      try {
        const cache = await caches.open("hardmoney-v9");
        const urls = new Set<string>();

        document
          .querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
            "script[src], link[rel='stylesheet'], link[rel='preload']"
          )
          .forEach((el) => {
            const url = "src" in el && el.src ? el.src : (el as HTMLLinkElement).href;
            if (url && (url.includes("/_next/") || url.includes("/static/"))) {
              urls.add(url);
            }
          });

        if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
          performance.getEntriesByType("resource").forEach((entry) => {
            if (entry.name && (entry.name.includes("/_next/") || entry.name.includes("/static/"))) {
              urls.add(entry.name);
            }
          });
        }

        await Promise.all(
          Array.from(urls).map(async (url) => {
            try {
              const match = await cache.match(url, { ignoreSearch: true });
              if (!match) {
                const res = await fetch(url, { cache: "no-cache" });
                if (res.ok) await cache.put(url, res);
              }
            } catch {
              // ignore
            }
          })
        );
      } catch {
        // ignore
      }
    };

    hmWindow.__hardMoneyPrimeAssets = primeAssetCache;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        hmWindow.__hardMoneySwRegistration = reg;
        void reg.update().catch(() => {});
        void primeAssetCache();
        navigator.serviceWorker.ready.then((activeReg) => {
          void activeReg.update().catch(() => {});
          void primeAssetCache();
        });

        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateAvailable(true);
        }

        reg.addEventListener("updatefound", () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installingWorker);
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });

    const isUpdatingRef = { current: false };
    hmWindow.__hardMoneyIsUpdating = isUpdatingRef;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isUpdatingRef.current) {
        window.location.reload();
      }
    });

    hmWindow.__hardMoneyTriggerUpdatePrompt = () => {
      setUpdateAvailable(true);
    };

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleUpdate = () => {
    if (typeof window !== "undefined") {
      const hmWindow = window as HardMoneyWindow;
      if (hmWindow.__hardMoneyIsUpdating) {
        hmWindow.__hardMoneyIsUpdating.current = true;
      }
    }
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      data-testid="pwa-update-banner"
      className="fixed bottom-mobile-offset left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 bg-[var(--surface)] border border-[var(--accent)]/35 text-[var(--text)] p-4 rounded-2xl shadow-xl flex items-center justify-between gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-[var(--text)]">New version available</span>
        <span className="text-[11px] text-[var(--text-muted)]">Reload to apply the update</span>
      </div>
      <button
        type="button"
        data-testid="pwa-update-btn"
        onClick={handleUpdate}
        className="h-9 flex items-center gap-1.5 px-3.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shrink-0 shadow-xs"
      >
        <RefreshCw size={13} className="animate-spin" />
        <span>Reload</span>
      </button>
    </div>
  );
}

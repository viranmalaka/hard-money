"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

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

    // Capture beforeinstallprompt event for PWA installation
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __hardMoneyInstallPrompt?: Event }).__hardMoneyInstallPrompt = e;
      window.dispatchEvent(new CustomEvent("hardmoney_install_ready", { detail: e }));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Precache loaded scripts and stylesheets so offline reload has all Next.js bundles
    const primeAssetCache = async () => {
      if (!("caches" in window)) return;
      try {
        const cache = await caches.open("hardmoney-v4");
        const urls = new Set<string>();

        document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel='stylesheet'], link[rel='preload']").forEach((el) => {
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

    (window as unknown as { __hardMoneyPrimeAssets?: () => Promise<void> }).__hardMoneyPrimeAssets = primeAssetCache;


    // Register service worker in production
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        (window as unknown as { __hardMoneySwRegistration?: ServiceWorkerRegistration }).__hardMoneySwRegistration = reg;
        primeAssetCache();
        navigator.serviceWorker.ready.then(() => {
          primeAssetCache();
        });

        // Check if there is already a waiting worker
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateAvailable(true);
        }

        // Listen for new updates found
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

    // Reload page only when user clicked update and new service worker took control
    const isUpdatingRef = { current: false };
    (window as any).__hardMoneyIsUpdating = isUpdatingRef;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isUpdatingRef.current) {
        window.location.reload();
      }
    });

    // Provide testing helper hook to trigger update banner on demand
    (window as any).__hardMoneyTriggerUpdatePrompt = () => {
      setUpdateAvailable(true);
    };

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleUpdate = () => {
    if (typeof window !== "undefined" && (window as any).__hardMoneyIsUpdating) {
      (window as any).__hardMoneyIsUpdating.current = true;
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
      className="fixed bottom-20 md:bottom-6 right-4 z-50 bg-[var(--surface)] border border-[var(--accent)] text-[var(--text)] p-3 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-[var(--text)]">New version available</span>
        <span className="text-[11px] text-[var(--text-muted)]">Reload to apply the update</span>
      </div>
      <button
        type="button"
        data-testid="pwa-update-btn"
        onClick={handleUpdate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
      >
        <RefreshCw size={12} className="animate-spin" />
        <span>Reload</span>
      </button>
    </div>
  );
}

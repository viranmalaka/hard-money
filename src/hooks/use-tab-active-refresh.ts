"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Hook to trigger a data refresh / recalculation whenever a tab becomes active.
 *
 * @param tabPath - The path identifying the tab (e.g. "/", "/stats", "/budget", "/accounts", "/more")
 * @param onActive - Callback executed when the screen transitions to active.
 */
export function useTabActiveRefresh(
  tabPath: string,
  onActive: () => void | Promise<void>
) {
  const pathname = usePathname();
  const wasActiveRef = useRef(false);
  const onActiveRef = useRef(onActive);

  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  useEffect(() => {
    const isActive =
      tabPath === "/" ? pathname === "/" : pathname.startsWith(tabPath);

    if (isActive && !wasActiveRef.current) {
      try {
        void onActiveRef.current();
      } catch (err) {
        console.error(`[useTabActiveRefresh] Error refreshing tab ${tabPath}:`, err);
      }
    }

    wasActiveRef.current = isActive;
  }, [pathname, tabPath]);
}

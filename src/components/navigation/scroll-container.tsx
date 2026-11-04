"use client";

import React, { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The app's main scroll area is shared by all routes (it lives in the root layout),
 * so by default every screen inherits the previous screen's scroll offset.
 * This remembers the scroll position per route and restores it on return,
 * like a native tab bar. New screens start at the top.
 */
const positions = new Map<string, number>();

export function ScrollContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const currentPath = useRef(pathname);

  const isMobileFooterEnabled =
    pathname !== "/login" &&
    pathname !== "/register" &&
    pathname !== "/offline";

  useLayoutEffect(() => {
    currentPath.current = pathname;
    const el = ref.current;
    if (el) el.scrollTop = positions.get(pathname) ?? 0;
  }, [pathname]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}
      onScroll={(e) => {
        positions.set(currentPath.current, e.currentTarget.scrollTop);
      }}
    >
      {children}
      {isMobileFooterEnabled && (
        <div
          aria-hidden="true"
          data-testid="mobile-footer-scroll-spacer"
          className="mobile-footer-spacer"
        />
      )}
    </div>
  );
}

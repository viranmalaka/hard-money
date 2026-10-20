import React, { ViewTransition } from "react";

/**
 * Wraps a route segment so it animates on enter/exit.
 * Used from `template.tsx` files (which remount on navigation, unlike layouts).
 *
 * Transition types (set via <Link transitionTypes> / router.push):
 *  - nav-forward: drill into a sub screen (push from right)
 *  - nav-back:    return to parent screen (pop to right)
 *  - nav-tab:     switch bottom-nav / sidebar tab (fade-through)
 *  - default:     untyped navigations (browser back, redirects) -> subtle fade
 */
const map = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-tab": "nav-tab",
  default: "nav-fade",
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={map} exit={map} default="none">
      {children}
    </ViewTransition>
  );
}

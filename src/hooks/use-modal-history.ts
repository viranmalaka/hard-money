"use client";

import { useEffect, useRef } from "react";

/**
 * Synchronizes a modal's open state with browser history so that:
 * 1. Native mobile OS edge-swipes (iOS Safari / PWA) close the modal.
 * 2. Android hardware and gesture back navigation close the modal.
 * 3. Does not change the URL path (preserving full compatibility with Playwright E2E tests).
 * 4. Cleans up history when the modal is dismissed via Save, Cancel, or Close buttons.
 *
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Callback to close the modal
 * @param modalId - Unique identifier for the modal in history state
 */
export function useModalHistory(
  isOpen: boolean,
  onClose: () => void,
  modalId: string = "modal"
) {
  const isPushedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isOpen) {
      // 1. Push a dummy state entry with the modal identifier without changing pathname
      window.history.pushState({ modal: modalId }, "");
      isPushedRef.current = true;

      // 2. Listen for native back navigation (swipe-back or Android hardware back)
      const handlePopState = () => {
        if (isPushedRef.current) {
          isPushedRef.current = false;
          onCloseRef.current();
        }
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);

        // 3. If closed programmatically (e.g. Save or Cancel button) while the history
        // entry is still active, pop it so we don't leave ghost history states behind.
        if (isPushedRef.current) {
          isPushedRef.current = false;
          if (window.history.state?.modal === modalId) {
            window.history.back();
          }
        }
      };
    }
  }, [isOpen, modalId]);
}

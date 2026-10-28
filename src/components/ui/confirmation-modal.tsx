"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Archive, Trash2, X } from "lucide-react";
import { useModalHistory } from "@/hooks/use-modal-history";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  icon?: "trash" | "archive" | "alert";
  testId?: string;
  placement?: "center" | "bottom";
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  icon = "alert",
  testId = "confirmation-modal",
  placement = "center",
}: ConfirmationModalProps) {
  useModalHistory(isOpen, onClose, "confirmation-modal");
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setConfirmError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      console.error("Confirmation action failed:", err);
      setConfirmError(err instanceof Error ? err.message : "Action failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderIcon = () => {
    if (icon === "trash") {
      return (
        <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
          <Trash2 size={20} />
        </div>
      );
    }
    if (icon === "archive") {
      return (
        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <Archive size={20} />
        </div>
      );
    }
    if (icon === "alert") {
      return (
        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <AlertTriangle size={20} />
        </div>
      );
    }
    if (variant === "danger") {
      return (
        <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
          <Trash2 size={20} />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
        <AlertTriangle size={20} />
      </div>
    );
  };

  const confirmBtnStyle =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
      ? "bg-amber-600 hover:bg-amber-700 text-white"
      : "bg-[var(--accent)] hover:opacity-90 text-white";

  const isBottom = placement === "bottom";

  return (
    <div
      data-testid={testId}
      className={`fixed inset-0 z-50 bg-black/60 flex justify-center backdrop-blur-xs select-none overflow-y-auto animate-in fade-in duration-150 ${
        isBottom ? "items-end md:items-center p-0 md:p-4" : "items-center p-4"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        className={`w-full max-w-sm md:max-w-md bg-[var(--surface)] border border-hairline shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 ${
          isBottom
            ? "rounded-t-xl md:rounded-lg pb-sheet-safe md:pb-5 modal-sheet-dialog"
            : "rounded-2xl md:rounded-xl my-auto"
        }`}
      >
        <div className="flex items-start gap-3.5">
          {renderIcon()}
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h2 id="confirmation-modal-title" className="text-sm font-semibold text-[var(--text)]">{title}</h2>
              <button
                type="button"
                data-testid="confirm-close-btn"
                disabled={submitting}
                onClick={onClose}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {confirmError && (
          <div role="alert" className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-medium">
            {confirmError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <button
            type="button"
            data-testid="confirm-cancel-btn"
            disabled={submitting}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-hairline text-xs font-medium text-[var(--text)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            data-testid="confirm-action-btn"
            disabled={submitting}
            onClick={handleConfirm}
            className={`px-4 py-1.5 rounded text-xs font-semibold shadow-sm active:scale-95 transition-all disabled:opacity-50 ${confirmBtnStyle}`}
          >
            {submitting ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

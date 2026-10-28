import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

// Mock useModalHistory since it uses browser window/popstate
vi.mock("@/hooks/use-modal-history", () => ({
  useModalHistory: vi.fn(),
}));

describe("ConfirmationModal Component", () => {
  it("renders nothing when isOpen is false", () => {
    const html = renderToString(
      React.createElement(ConfirmationModal, {
        isOpen: false,
        onClose: () => {},
        onConfirm: () => {},
        title: "Delete Account",
        message: "Are you sure you want to delete this account?",
      })
    );
    expect(html).toBe("");
  });

  it("renders title, message, and confirmation buttons when isOpen is true", () => {
    const html = renderToString(
      React.createElement(ConfirmationModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        title: "Delete Account",
        message: "Are you sure you want to delete this account?",
        confirmText: "Yes, Delete",
        cancelText: "No, Keep",
        variant: "danger",
        icon: "trash",
      })
    );

    expect(html).toContain("Delete Account");
    expect(html).toContain("Are you sure you want to delete this account?");
    expect(html).toContain("Yes, Delete");
    expect(html).toContain("No, Keep");
    expect(html).toContain('data-testid="confirmation-modal"');
    expect(html).toContain('data-testid="confirm-action-btn"');
    expect(html).toContain('data-testid="confirm-cancel-btn"');
    expect(html).toContain("bg-red-600");
  });

  it("renders warning styling and archive icon when specified", () => {
    const html = renderToString(
      React.createElement(ConfirmationModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        title: "Archive Account",
        message: "Are you sure you want to archive this account?",
        confirmText: "Archive",
        variant: "warning",
        icon: "archive",
      })
    );

    expect(html).toContain("Archive Account");
    expect(html).toContain("Are you sure you want to archive this account?");
    expect(html).toContain("Archive");
    expect(html).toContain("bg-amber-600");
  });

  it("renders default variant and alert icon when specified", () => {
    const html = renderToString(
      React.createElement(ConfirmationModal, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        title: "Unarchive Account",
        message: "Are you sure you want to unarchive this account?",
        confirmText: "Unarchive",
        variant: "default",
        icon: "alert",
      })
    );

    expect(html).toContain("Unarchive Account");
    expect(html).toContain("Unarchive");
    expect(html).toContain("bg-[var(--accent)]");
  });
});

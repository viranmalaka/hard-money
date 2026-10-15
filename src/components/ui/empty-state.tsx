import React from "react";
import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="flat-card flex flex-col items-center justify-center p-8 my-6 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-surface border border-hairline flex items-center justify-center text-[var(--text-muted)] mb-3">
        {icon || <FolderOpen size={24} />}
      </div>
      <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">{description}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-3 py-1.5 rounded bg-[var(--text)] text-[var(--bg)] text-xs font-medium hover:opacity-90 transition-opacity"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

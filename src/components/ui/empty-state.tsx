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
      className="rounded-3xl bg-[var(--surface)] border border-dashed border-[var(--border)] flex flex-col items-center justify-center p-10 my-4 text-center space-y-2.5"
    >
      <div className="w-13 h-13 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] mb-1">
        {icon || <FolderOpen size={24} />}
      </div>
      <h2 className="text-base font-bold text-[var(--text)]">{title}</h2>
      <p className="text-sm text-[var(--text-muted)] max-w-sm leading-relaxed">
        {description}
      </p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 px-4 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold hover:opacity-95 transition-opacity cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

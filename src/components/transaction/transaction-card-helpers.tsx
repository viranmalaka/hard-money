"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  MessageSquare,
  Scale,
  X,
} from "lucide-react";
import { LocalCategory, LocalTransaction } from "@/lib/db";
import { formatMoney } from "@/lib/finance-core/money";
import { CategoryIcon } from "@/components/ui/category-icon";
import { TransactionEditModal } from "@/components/transaction/transaction-edit-modal";
import {
  useTabNavigation,
  TabId,
} from "@/components/navigation/tab-navigation-context";
import type { HomeDashboardData } from "@/hooks/use-home-dashboard";

/**
 * Shared Navigation Link that cleanly activates main tabs (/stats, /accounts, /more)
 * or pushes subroutes (/budget, /more/inbox, etc.)
 */
export function SubNavAction({
  target,
  className,
  children,
  ariaLabel,
  dataTestId,
}: {
  target: TabId | string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const { switchToTab } = useTabNavigation();
  const router = useRouter();

  const href =
    target === "trans"
      ? "/"
      : target === "stats"
      ? "/stats"
      : target === "accounts"
      ? "/accounts"
      : target === "more"
      ? "/more"
      : target;

  return (
    <a
      href={href}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      onClick={(e) => {
        e.preventDefault();
        if (
          target === "trans" ||
          target === "stats" ||
          target === "accounts" ||
          target === "more"
        ) {
          switchToTab(target);
        } else {
          router.push(target);
        }
      }}
      className={className}
    >
      {children}
    </a>
  );
}

/**
 * Renders shared Transaction Edit Modal, Undo Delete Toast, and Raw SMS Modal
 */
export function HomeSharedOverlays({ data }: { data: HomeDashboardData }) {
  return (
    <>
      {data.selectedTxForEdit && (
        <TransactionEditModal
          transaction={data.selectedTxForEdit}
          isOpen={!!data.selectedTxForEdit}
          onClose={() => data.setSelectedTxForEdit(null)}
          onDeleted={(tx) => data.setDeletedTx(tx)}
        />
      )}

      {data.deletedTx && (
        <div
          data-testid="undo-toast"
          className="fixed bottom-mobile-offset left-1/2 -translate-x-1/2 z-50 bg-[var(--text)] text-[var(--bg)] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-4 text-sm font-medium whitespace-nowrap"
        >
          <span>Transaction deleted</span>
          <button
            type="button"
            data-testid="undo-delete-btn"
            onClick={data.handleUndoDelete}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--bg)] text-[var(--text)] font-bold text-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            Undo
          </button>
        </div>
      )}

      {data.activeSmsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-5 backdrop-blur-xs overflow-y-auto"
          onClick={() => data.setActiveSmsModal(null)}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 space-y-4 modal-sheet-dialog overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <MessageSquare size={18} className="text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text)]">
                  Bank SMS · {data.activeSmsModal.sender}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => data.setActiveSmsModal(null)}
                className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] font-mono text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">
              {data.activeSmsModal.rawMessage}
            </div>

            <div className="flex justify-between items-center text-xs text-[var(--text-muted)]">
              <span>{new Date(data.activeSmsModal.receivedAt).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => data.setActiveSmsModal(null)}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-semibold text-xs hover:opacity-90 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Cleanly extracts readable display fields for any transaction
 */
export function getTxDisplayInfo(
  tx: LocalTransaction,
  categoryMap: Map<string, LocalCategory>,
  accountMap: Map<string, string>
) {
  const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
  const fromAccount = accountMap.get(tx.accountId) || "Account";
  const toAccount = tx.toAccountId ? accountMap.get(tx.toAccountId) || "Account" : null;
  const isTransfer = tx.type === "TRANSFER";
  const isCalibration = tx.source === "CALIBRATION" || tx.type === "ADJUSTMENT";
  const isExpense = tx.type === "EXPENSE";
  const isIncome = tx.type === "INCOME" || tx.type === "REFUND";
  const isExcluded = Boolean(tx.excludeFromStats || tx.subType === "LOAN_DISBURSEMENT");

  const title = isCalibration
    ? "Balance Calibration"
    : isTransfer
    ? `${fromAccount} → ${toAccount || "Account"}`
    : tx.subType === "LOAN_DISBURSEMENT"
    ? "Loan Disbursement"
    : tx.isSplit
    ? category?.name
      ? `${category.name} (Split)`
      : "Split Expense"
    : category?.name || tx.type;

  const subtitle = isTransfer
    ? tx.note || "Internal Transfer"
    : tx.note
    ? `${fromAccount} · ${tx.note}`
    : fromAccount;

  const accentColor = isCalibration
    ? "#8B5CF6"
    : isTransfer
    ? "#64748B"
    : category?.color || (isIncome ? "#059669" : "#E11D48");

  const formattedAmount = formatMoney(tx.amountMinor);
  const signedAmount = isCalibration
    ? tx.direction === "IN"
      ? `+${formattedAmount}`
      : `-${formattedAmount}`
    : isExpense
    ? `-${formattedAmount}`
    : isIncome
    ? `+${formattedAmount}`
    : formattedAmount;

  const amountToneClass = isExcluded
    ? "text-[var(--text-muted)]"
    : isCalibration
    ? tx.direction === "IN"
      ? "text-income"
      : "text-expense"
    : isExpense
    ? "text-expense"
    : isIncome
    ? "text-income"
    : "text-[var(--text)]";

  return {
    category,
    fromAccount,
    toAccount,
    isTransfer,
    isCalibration,
    isExpense,
    isIncome,
    isExcluded,
    title,
    subtitle,
    accentColor,
    formattedAmount,
    signedAmount,
    amountToneClass,
    hasSms: Boolean(tx.source === "SMS" || tx.feeTransactionId),
  };
}

/**
 * Renders the appropriate category/transfer/calibration icon cleanly inside any container
 */
export function TxAvatarIcon({
  tx,
  category,
  size = 20,
}: {
  tx: LocalTransaction;
  category?: LocalCategory;
  size?: number;
}) {
  if (tx.source === "CALIBRATION" || tx.type === "ADJUSTMENT") {
    return <Scale size={size} />;
  }
  if (tx.type === "TRANSFER") {
    return <ArrowLeftRight size={size} />;
  }
  if (category?.icon) {
    const isAsciiWord = /^[A-Za-z0-9_-]+$/.test(category.icon.trim());
    if (!isAsciiWord) {
      return <span style={{ fontSize: size * 0.95, lineHeight: 1 }}>{category.icon}</span>;
    }
    return <CategoryIcon name={category.icon} size={size} />;
  }
  return <CategoryIcon name="Tag" size={size} />;
}

/**
 * Duplicate merge banner when a transaction is flagged as a possible duplicate
 */
export function DuplicateBanner({
  tx,
  data,
}: {
  tx: LocalTransaction;
  data: HomeDashboardData;
}) {
  if (!tx.possibleDuplicateOfTransactionId) return null;
  const busy = data.actionLoadingId === tx.id;

  return (
    <div
      data-testid="duplicate-banner"
      onClick={(e) => e.stopPropagation()}
      className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2.5 text-xs"
    >
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
        <AlertTriangle size={15} />
        <span>Possible duplicate entry</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="merge-duplicate-btn"
          disabled={busy}
          onClick={() => data.mergeDuplicateTx(tx.id)}
          className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors cursor-pointer"
        >
          Merge
        </button>
        <button
          type="button"
          data-testid="dismiss-duplicate-btn"
          disabled={busy}
          onClick={() => data.dismissDuplicateTx(tx.id)}
          className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          Keep Both
        </button>
      </div>
    </div>
  );
}


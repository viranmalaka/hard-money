"use client";

import { memo } from "react";
import { ArrowRightLeft, CheckCircle2, CreditCard, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import type { BankSmsItem } from "@/services/inbox-service";

export interface InboxAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
}

export interface InboxCategory {
  id: string;
  name: string;
  icon?: string;
}

export interface InboxFormValues {
  accountId: string;
  amount: string;
  categoryId: string;
  note: string;
  toAccountId: string;
  destinationAmount: string;
  exchangeRate: string;
}

type Field = keyof InboxFormValues;

interface InboxActions {
  onPost: (itemId: string) => void;
  onIgnore: (itemId: string) => void;
  onRetry: (itemId: string) => void;
  onMergeTransfer?: (itemId: string) => void;
  onFieldChange: (itemId: string, field: Field, value: string) => void;
}

function reviewReason(reason: string | null) {
  switch (reason) {
    case "NO_GEMINI_KEY": return "No Gemini key";
    case "LOW_CONFIDENCE": return "Low confidence";
    case "VALIDATION_FAILED": return "Validation failed";
    case "ACCOUNT_UNMATCHED": return "Account unmatched";
    case "ALWAYS_REVIEW": return "Always review";
    case "POSSIBLE_DUPLICATE": return "Possible duplicate";
    case "POSSIBLE_TRANSFER": return "Possible transfer";
    case "CREDIT_CARD_SETTLEMENT": return "Card Settlement Review";
    default: return reason || "Needs Review";
  }
}

function FormFields({
  item,
  form,
  accounts,
  categories,
  onFieldChange,
}: {
  item: BankSmsItem;
  form: InboxFormValues;
  accounts: InboxAccount[];
  categories: InboxCategory[];
  onFieldChange: InboxActions["onFieldChange"];
}) {
  const isSettlement = item.reviewReason === "CREDIT_CARD_SETTLEMENT";

  return (
    <>
      {isSettlement ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Funding Account (From) *</span>
              <select
                data-testid="inbox-account-select"
                value={form.accountId}
                onChange={(e) => onFieldChange(item.id, "accountId", e.target.value)}
                className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">-- Select Source Account --</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Credit Card (To) *</span>
              <select
                data-testid="inbox-to-account-select"
                value={form.toAccountId}
                onChange={(e) => onFieldChange(item.id, "toAccountId", e.target.value)}
                className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">-- Select Credit Card --</option>
                {accounts
                  .filter((a) => a.type === "CREDIT_CARD")
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Settlement Amount (LKR) *</span>
            <input
              data-testid="inbox-amount-input"
              type="text"
              value={form.amount}
              onChange={(e) => onFieldChange(item.id, "amount", e.target.value)}
              placeholder="e.g. 1500.00"
              className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Account *</span>
            <select data-testid="inbox-account-select" value={form.accountId} onChange={(e) => onFieldChange(item.id, "accountId", e.target.value)} className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">-- Select Account --</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type}, {account.currency})</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Amount (LKR) *</span>
            <input data-testid="inbox-amount-input" type="text" value={form.amount} onChange={(e) => onFieldChange(item.id, "amount", e.target.value)} placeholder="e.g. 1500.00" className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
          </label>
        </div>
      )}
      {item.parsedPayload?.currency === "USD" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Destination LKR account</span>
            <select data-testid="inbox-to-account-select" value={form.toAccountId} onChange={(e) => onFieldChange(item.id, "toAccountId", e.target.value)} className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">-- Optional --</option>
              {accounts.filter((account) => account.currency === "LKR").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            </label>
            <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Final LKR amount</span>
            <input data-testid="inbox-destination-amount" type="number" min="0" step="0.01" value={form.destinationAmount} onChange={(e) => onFieldChange(item.id, "destinationAmount", e.target.value)} placeholder="Optional" className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)]" />
            </label>
          </div>
          <label className="space-y-1 block">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Rate (LKR / USD)</span>
          <input data-testid="inbox-exchange-rate" type="number" min="0" step="0.000001" value={form.exchangeRate} onChange={(e) => onFieldChange(item.id, "exchangeRate", e.target.value)} placeholder="Optional if final LKR amount is entered" className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)]" />
          </label>
        </>
      )}
      {!isSettlement && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Category</span>
            <select data-testid="inbox-category-select" value={form.categoryId} onChange={(e) => onFieldChange(item.id, "categoryId", e.target.value)} className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">-- Optional Category --</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.icon || "📁"} {category.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Note / Entity</span>
            <input data-testid="inbox-note-input" type="text" value={form.note} onChange={(e) => onFieldChange(item.id, "note", e.target.value)} className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
          </label>
        </div>
      )}
      {isSettlement && (
        <label className="space-y-1 block">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Settlement Note</span>
          <input data-testid="inbox-note-input" type="text" value={form.note} onChange={(e) => onFieldChange(item.id, "note", e.target.value)} placeholder="e.g. Credit Card Settlement" className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
        </label>
      )}
    </>
  );
}

export const MobileInboxItem = memo(function MobileInboxItem({
  item,
  form,
  accounts,
  categories,
  submitting,
  actions,
}: {
  item: BankSmsItem;
  form: InboxFormValues;
  accounts: InboxAccount[];
  categories: InboxCategory[];
  submitting: boolean;
  actions: InboxActions;
}) {
  const hasSuggestedTransfer =
    Boolean(item.parsedPayload?.suggestedTransfer) &&
    (item.reviewReason === "POSSIBLE_TRANSFER" || item.reviewReason === "CREDIT_CARD_SETTLEMENT");

  return (
    <div data-testid="inbox-item" id={`inbox-item-${item.id}`} className="flat-card p-4 space-y-3 border-l-4 border-l-[var(--accent)]">
      <div className="flex items-center justify-between">
        <span data-testid="inbox-item-sender" className="font-bold text-xs text-[var(--text)]">{item.sender}</span>
        <span data-testid="inbox-review-reason" data-reason={item.reviewReason} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">{reviewReason(item.reviewReason)}</span>
      </div>
      <div data-testid="inbox-item-raw" className="p-2.5 rounded bg-[var(--bg)] border border-hairline font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed select-all">{item.rawMessage}</div>
      {item.failureReason && <div data-testid="inbox-failure-info" className="text-[11px] text-[var(--expense)] flex items-center gap-1.5"><ShieldAlert size={13} /><span>{item.failureReason}</span></div>}
      {hasSuggestedTransfer && actions.onMergeTransfer && (
        <div className="p-2.5 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/30 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
            <ArrowRightLeft size={13} />
            <span>
              {item.reviewReason === "CREDIT_CARD_SETTLEMENT"
                ? "Matching Settlement Debit Found"
                : "Possible Transfer Counterpart Found"}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {item.reviewReason === "CREDIT_CARD_SETTLEMENT"
              ? "Matches a recent debit transaction on another account. Merge both into a single verified Credit Card Settlement transfer."
              : "Matches a counterpart transaction on another account. Merge both into a single Transfer or post separately."}
          </p>
          <button
            type="button"
            data-testid="inbox-merge-transfer-btn"
            disabled={submitting}
            onClick={() => actions.onMergeTransfer!(item.id)}
            className="flex items-center justify-center gap-1.5 w-full h-7 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <ArrowRightLeft size={13} />
            <span>Merge as Transfer</span>
          </button>
        </div>
      )}
      {item.reviewReason === "CREDIT_CARD_SETTLEMENT" && !item.parsedPayload?.suggestedTransfer && (
        <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
            <CreditCard size={13} />
            <span>Credit Card Settlement Review</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            This inward payment is flagged for settlement handling. Select the funding account to record as a settlement transfer.
          </p>
        </div>
      )}
      <div className="space-y-2 pt-2 border-t border-hairline">
        <FormFields item={item} form={form} accounts={accounts} categories={categories} onFieldChange={actions.onFieldChange} />
        <div className="flex items-center gap-2 pt-2">
          <button type="button" data-testid="inbox-post-btn" disabled={submitting} onClick={() => actions.onPost(item.id)} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"><CheckCircle2 size={14} /><span>Post</span></button>
          <button type="button" data-testid="inbox-ignore-btn" disabled={submitting} onClick={() => actions.onIgnore(item.id)} className="flex items-center justify-center gap-1 h-8 px-3 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"><XCircle size={14} /><span>Ignore</span></button>
          <button type="button" data-testid="inbox-retry-btn" disabled={submitting} onClick={() => actions.onRetry(item.id)} className="flex items-center justify-center gap-1 h-8 px-3 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text-muted)] transition-colors"><RefreshCw size={13} className={submitting ? "animate-spin" : ""} /><span>Retry</span></button>
        </div>
      </div>
    </div>
  );
});

export const InboxMasterItem = memo(function InboxMasterItem({
  item,
  selected,
  onSelect,
}: {
  item: BankSmsItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div data-testid="inbox-item" onClick={() => onSelect(item.id)} className={`p-3 cursor-pointer transition-colors space-y-1.5 ${selected ? "bg-[var(--accent)]/10 border-l-4 border-l-[var(--accent)]" : "hover:bg-surface"}`}>
      <div className="flex items-center justify-between">
        <span data-testid="inbox-item-sender" className="font-semibold text-xs text-[var(--text)]">{item.sender}</span>
        <span data-testid="inbox-review-reason" data-reason={item.reviewReason} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">{reviewReason(item.reviewReason)}</span>
      </div>
      <p className="text-xs text-[var(--text-muted)] line-clamp-2 font-mono">{item.rawMessage}</p>
      <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between pt-1">
        <span>{new Date(item.receivedAt).toLocaleTimeString()}</span>
        {item.attempts > 1 && <span>Attempts: {item.attempts}</span>}
      </div>
    </div>
  );
});

"use client";

import React, { useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Wallet, Building2, CreditCard, ArrowLeftRight } from "lucide-react";
import { useAccounts, useTransactions, useCategories } from "@/components/sync-provider";
import { calculateLedgerBalance, LedgerTransaction } from "@/lib/finance-core/ledger";
import { formatMoney } from "@/lib/finance-core/money";
import { EmptyState } from "@/components/ui/empty-state";

export default function AccountDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <p className="text-xs text-[var(--text-muted)]">Loading account...</p>
        </main>
      }
    >
      <AccountDetailContent />
    </Suspense>
  );
}

function AccountDetailContent() {
  const params = useParams();
  const accountId = params?.id as string;

  const accounts = useAccounts();
  const transactions = useTransactions();
  const categories = useCategories();

  const account = useMemo(() => {
    return accounts.find((a) => a.id === accountId);
  }, [accounts, accountId]);

  // Derived balance from ledger
  const balance = useMemo(() => {
    if (!account) return 0;
    const ledgerTxList: LedgerTransaction[] = transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      amountMinor: t.amountMinor,
      type: t.type,
      direction: t.direction,
      transactionDate: t.transactionDate,
      excludeFromBalance: t.excludeFromBalance,
      deletedAt: t.deletedAt,
    }));

    return calculateLedgerBalance(
      {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      ledgerTxList
    );
  }, [account, transactions]);

  // Transactions involving this account, sorted by date desc
  const accountTransactions = useMemo(() => {
    if (!account) return [];
    return transactions
      .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  }, [account, transactions]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, color: c.color });
    }
    return map;
  }, [categories]);

  if (!account) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link
          href="/accounts"
          data-testid="back-button"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Accounts</span>
        </Link>
        <p className="text-sm text-[var(--text-muted)]">Account not found.</p>
      </main>
    );
  }

  const isCreditCard = account.type === "CREDIT_CARD";
  const outstandingDebt = isCreditCard && balance < 0 ? Math.abs(balance) : 0;

  return (
    <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between pb-2 border-b border-hairline">
        <div className="flex items-center gap-3">
          <Link
            href="/accounts"
            data-testid="back-button"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
            title="Back to Accounts"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1
              data-testid="account-detail-name"
              className="text-base font-semibold tracking-tight text-[var(--text)] flex items-center gap-2"
            >
              {account.type === "CASH" ? (
                <Wallet size={18} className="text-[var(--text-muted)]" />
              ) : account.type === "BANK_SAVINGS" ? (
                <Building2 size={18} className="text-[var(--text-muted)]" />
              ) : (
                <CreditCard size={18} className="text-[var(--text-muted)]" />
              )}
              <span>{account.name}</span>
            </h1>
            <p data-testid="account-detail-type" className="text-xs text-[var(--text-muted)]">
              {account.type === "CASH"
                ? "Cash Account"
                : account.type === "BANK_SAVINGS"
                ? `Bank Savings ${account.accountNumberLast4 ? `(•••• ${account.accountNumberLast4})` : ""}`
                : `Credit Card ${account.accountNumberLast4 ? `(•••• ${account.accountNumberLast4})` : ""}`}
            </p>
          </div>
        </div>

        {/* Current Balance Display */}
        <div className="text-right">
          <span className="text-[11px] font-medium text-[var(--text-muted)] block">
            {isCreditCard ? "Current Balance" : "Balance"}
          </span>
          <span
            data-testid="account-detail-balance"
            className={`text-lg font-bold font-mono tabular-nums ${
              balance < 0 ? "text-expense" : balance > 0 ? "text-income" : "text-[var(--text)]"
            }`}
          >
            {formatMoney(balance)}
          </span>
          {isCreditCard && (
            <div data-testid="account-detail-outstanding" className="text-xs font-semibold text-expense">
              Outstanding: {formatMoney(outstandingDebt)}
            </div>
          )}
        </div>
      </div>

      {/* Account Info Stats */}
      {isCreditCard && account.creditLimitMinor && (
        <div className="grid grid-cols-3 gap-2 p-3 bg-[var(--surface)] border border-hairline rounded-lg text-xs">
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Limit</span>
            <span className="font-mono font-semibold">{formatMoney(account.creditLimitMinor)}</span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Available Credit</span>
            <span className="font-mono font-semibold">
              {formatMoney(Math.max(0, account.creditLimitMinor - outstandingDebt))}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Due Day</span>
            <span className="font-mono font-semibold">Day {account.paymentDueDay || "N/A"}</span>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Transactions ({accountTransactions.length})
        </h2>

        {accountTransactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Transactions recorded to this account will appear here."
            icon={<ArrowLeftRight size={24} />}
          />
        ) : (
          <div className="border border-hairline rounded-lg divide-y divide-hairline bg-[var(--surface)] overflow-hidden">
            {accountTransactions.map((tx) => {
              const isOutgoing = tx.accountId === account.id;
              const isTransfer = tx.type === "TRANSFER";
              const isExpense = tx.type === "EXPENSE";
              const isIncome = tx.type === "INCOME";

              const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;

              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  className="flex items-center justify-between p-3 hover:bg-[var(--border)]/30 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      {category && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: category.color }}
                        />
                      )}
                      <span className="text-xs font-semibold text-[var(--text)] truncate">
                        {isTransfer
                          ? isOutgoing
                            ? `Transfer Out`
                            : `Transfer In`
                          : category?.name || tx.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                      <span>{tx.transactionDate}</span>
                      {tx.note && <span>• {tx.note}</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isExpense && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-semibold text-xs tabular-nums text-expense"
                      >
                        - {formatMoney(tx.amountMinor)}
                      </span>
                    )}
                    {isIncome && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-semibold text-xs tabular-nums text-income"
                      >
                        + {formatMoney(tx.amountMinor)}
                      </span>
                    )}
                    {isTransfer && (
                      <span
                        data-testid="transaction-amount"
                        className="font-mono font-semibold text-xs tabular-nums text-[var(--text-muted)]"
                      >
                        {isOutgoing ? `- ${formatMoney(tx.amountMinor)}` : `+ ${formatMoney(tx.amountMinor)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

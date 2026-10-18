"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Wallet, Building2, CreditCard, ArrowLeftRight, Scale } from "lucide-react";
import { useAccounts, useTransactions, useCategories, useCreditCardStatements, useInstallmentPlans, useSync } from "@/components/sync-provider";
import { calculateLedgerBalance, LedgerTransaction } from "@/lib/finance-core/ledger";
import { formatMoney } from "@/lib/finance-core/money";
import { calculateStatementCycle, calculateInstallmentProgress } from "@/lib/finance-core/credit-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalibrationModal } from "@/components/transaction/calibration-modal";
import { TransactionEditModal } from "@/components/transaction/transaction-edit-modal";
import { SettleModal } from "@/components/account/settle-modal";
import { EarlyPayoffModal } from "@/components/account/early-payoff-modal";
import { LocalTransaction, LocalInstallmentPlan } from "@/lib/db";
import { localUpdateTransaction, localDeleteInstallmentPlan } from "@/lib/sync/client";

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
  const statements = useCreditCardStatements();
  const installmentPlans = useInstallmentPlans();

  const { db } = useSync();
  const [isCalibrateOpen, setIsCalibrateOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<LocalTransaction | null>(null);
  const [payoffPlan, setPayoffPlan] = useState<LocalInstallmentPlan | null>(null);
  const [payoffRemainingMinor, setPayoffRemainingMinor] = useState(0);

  const account = useMemo(() => {
    return accounts.find((a) => a.id === accountId);
  }, [accounts, accountId]);

  const ledgerTxList: LedgerTransaction[] = useMemo(() => {
    return transactions.map((t) => ({
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
  }, [transactions]);

  const cardPlans = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return [];
    return installmentPlans.filter((p) => p.accountId === account.id);
  }, [account, installmentPlans]);

  const planProgressMap = useMemo(() => {
    const map = new Map<string, { paidInstallments: number; remainingInstallments: number; remainingPrincipalMinor: number }>();
    for (const plan of cardPlans) {
      const planTxBilled = transactions
        .filter((t) => !t.deletedAt && t.installmentPlanId === plan.id && t.type === "EXPENSE" && t.subType === "CC_INSTALLMENT")
        .map((t) => t.amountMinor);

      const prog = calculateInstallmentProgress(
        plan.totalAmountMinor,
        plan.tenureMonths,
        plan.initialPaidInstallments || 0,
        planTxBilled
      );
      map.set(plan.id, prog);
    }
    return map;
  }, [cardPlans, transactions]);

  // Blocked principal for this credit card
  const blockedPrincipalMinor = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return 0;
    let total = 0;
    for (const plan of cardPlans) {
      if (plan.status === "ACTIVE") {
        const prog = planProgressMap.get(plan.id);
        if (prog) total += prog.remainingPrincipalMinor;
      }
    }
    return total;
  }, [account, cardPlans, planProgressMap]);

  // Derived balance from ledger
  const balance = useMemo(() => {
    if (!account) return 0;
    return calculateLedgerBalance(
      {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      ledgerTxList
    );
  }, [account, ledgerTxList]);

  // Credit Card Statement Cycle
  const cycle = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return null;
    return calculateStatementCycle({
      account: {
        id: account.id,
        type: account.type,
        openingBalanceMinor: account.openingBalanceMinor,
      },
      transactions: ledgerTxList,
      creditLimitMinor: account.creditLimitMinor || 0,
      statementCutoffDay: account.statementCutoffDay || 20,
      paymentDueDay: account.paymentDueDay || 10,
      blockedPrincipalMinor,
    });
  }, [account, ledgerTxList, blockedPrincipalMinor]);

  // Card statement history
  const cardStatements = useMemo(() => {
    if (!account || account.type !== "CREDIT_CARD") return [];
    return statements
      .filter((s) => s.accountId === account.id)
      .sort((a, b) => new Date(b.cycleCutoffDate).getTime() - new Date(a.cycleCutoffDate).getTime());
  }, [statements, account]);

  // Transactions involving this account, sorted by date desc
  const accountTransactions = useMemo(() => {
    if (!account) return [];
    return transactions
      .filter((t) => !t.deletedAt && (t.accountId === account.id || t.toAccountId === account.id))
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

        {/* Current Balance Display & Calibrate Button */}
        <div className="flex flex-col items-end gap-1.5">
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

          <div className="flex items-center gap-2">
            {isCreditCard && (
              <button
                type="button"
                data-testid="credit-settle-btn"
                onClick={() => setIsSettleOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
              >
                Settle Card
              </button>
            )}

            <button
              type="button"
              data-testid="calibrate-balance-btn"
              onClick={() => setIsCalibrateOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-hairline text-[11px] font-semibold text-[var(--text)] hover:bg-[var(--border)] active:scale-95 transition-all"
            >
              <Scale size={13} />
              <span>Calibrate Balance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Account Info Stats */}
      {isCreditCard && cycle && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-[var(--surface)] border border-hairline rounded-lg text-xs">
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Billed Due</span>
            <span data-testid="credit-billed-amount" className="font-mono font-semibold text-expense">
              {formatMoney(cycle.billedBalanceMinor)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Unbilled Spend</span>
            <span data-testid="credit-unbilled-amount" className="font-mono font-semibold text-[var(--text)]">
              {formatMoney(cycle.unbilledBalanceMinor)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Blocked</span>
            <span data-testid="credit-blocked-amount" className="font-mono font-semibold text-amber-600 dark:text-amber-500">
              {formatMoney(blockedPrincipalMinor)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Available Credit</span>
            <span data-testid="credit-available-amount" className="font-mono font-semibold text-income">
              {formatMoney(cycle.availableCreditMinor)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text-muted)] block">Due Countdown</span>
            <span
              data-testid="credit-due-countdown"
              className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--border)] text-[var(--text)]"
            >
              {cycle.dueCountdownText}
            </span>
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
              const isIncome = tx.type === "INCOME" || tx.type === "REFUND";
              const isCalibration = tx.source === "CALIBRATION" || tx.type === "ADJUSTMENT";

              const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;

              return (
                <div
                  key={tx.id}
                  data-testid={`transaction-row-${tx.id}`}
                  onClick={() => setSelectedTxForEdit(tx)}
                  className="flex items-center justify-between p-3 hover:bg-[var(--border)]/30 active:bg-[var(--border)]/50 transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isCalibration ? (
                        <span
                          data-testid="calibration-icon"
                          className="p-1 rounded bg-[var(--border)] text-[var(--text)] shrink-0"
                          title="Balance Calibration"
                        >
                          <Scale size={12} />
                        </span>
                      ) : category ? (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: category.color }}
                        />
                      ) : null}

                      <span className="text-xs font-semibold text-[var(--text)] truncate">
                        {isCalibration
                          ? "Balance Calibration"
                          : isTransfer
                          ? isOutgoing
                            ? `Transfer Out`
                            : `Transfer In`
                          : category?.name || tx.type}
                      </span>

                      {isCalibration && (
                        <span
                          data-testid="calibration-badge"
                          className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.2 rounded font-mono font-medium ${
                            tx.direction === "IN" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
                          }`}
                        >
                          {tx.direction === "IN" ? "+ Calibration" : "- Calibration"}
                        </span>
                      )}
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
                    {isCalibration && (
                      <span
                        data-testid="transaction-amount"
                        className={`font-mono font-semibold text-xs tabular-nums ${
                          tx.direction === "IN" ? "text-income" : "text-expense"
                        }`}
                      >
                        {tx.direction === "IN" ? `+ ${formatMoney(tx.amountMinor)}` : `- ${formatMoney(tx.amountMinor)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Statement History for Credit Cards */}
      {isCreditCard && cardStatements.length > 0 && (
        <section data-testid="statement-list" className="space-y-2">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
            Billing Statements ({cardStatements.length})
          </h2>
          <div className="border border-hairline rounded-lg divide-y divide-hairline bg-[var(--surface)] overflow-hidden text-xs">
            {cardStatements.map((stmt) => (
              <div
                key={stmt.id}
                data-testid={`statement-row-${stmt.id}`}
                className="flex items-center justify-between p-3"
              >
                <div>
                  <div className="font-semibold text-[var(--text)]">
                    Cutoff {stmt.cycleCutoffDate ? stmt.cycleCutoffDate.slice(0, 10) : ""}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Due {stmt.dueDate ? stmt.dueDate.slice(0, 10) : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold tabular-nums text-expense">
                    {formatMoney(stmt.billedDebtMinor)}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {stmt.isSettled ? "Settled" : "Due"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 0% Installment Plans for this Card */}
      {isCreditCard && cardPlans.length > 0 && (
        <section data-testid="card-installment-plans" className="space-y-2">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
            0% Installment Plans ({cardPlans.length})
          </h2>
          <div className="space-y-2">
            {cardPlans.map((plan) => {
              const prog = planProgressMap.get(plan.id) || {
                paidInstallments: plan.initialPaidInstallments || 0,
                remainingInstallments: plan.tenureMonths,
                remainingPrincipalMinor: plan.totalAmountMinor,
              };
              const percent = Math.min(100, Math.round((prog.paidInstallments / plan.tenureMonths) * 100));

              return (
                <div
                  key={plan.id}
                  data-testid={`installment-plan-card-${plan.id}`}
                  className="p-3 rounded border border-hairline bg-[var(--surface)] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span data-testid="installment-merchant" className="text-xs font-semibold text-[var(--text)]">
                        {plan.merchantName}
                      </span>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                        <span>Total: {formatMoney(plan.totalAmountMinor)}</span>
                        {plan.status === "COMPLETED" && (
                          <span className="px-1.5 py-0.2 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-semibold text-[10px]">
                            COMPLETED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {plan.status === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            data-testid="installment-early-payoff-btn"
                            onClick={() => {
                              setPayoffPlan(plan);
                              setPayoffRemainingMinor(prog.remainingPrincipalMinor);
                            }}
                            className="px-2 py-0.5 rounded border border-hairline text-[11px] font-medium hover:bg-[var(--border)] text-[var(--text)] transition-colors"
                          >
                            Early Payoff
                          </button>
                          <button
                            type="button"
                            data-testid="cancel-plan-btn"
                            onClick={async () => {
                              if (plan.originalTransactionId) {
                                await localUpdateTransaction(db, plan.originalTransactionId, {
                                  excludeFromBalance: false,
                                  excludeFromStats: false,
                                  installmentPlanId: null,
                                });
                              }
                              await localDeleteInstallmentPlan(db, plan.id);
                            }}
                            className="px-2 py-0.5 rounded border border-hairline text-[11px] font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            Cancel Plan
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar & Stats */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span data-testid="installment-progress-text" className="text-[var(--text-muted)]">
                        {prog.paidInstallments} of {plan.tenureMonths}
                      </span>
                      <span data-testid="installment-monthly-amount" className="font-mono tabular-nums text-[var(--text)]">
                        {formatMoney(plan.monthlyAmountMinor)} / mo
                      </span>
                    </div>
                    <div
                      data-testid="installment-progress-bar"
                      className="w-full bg-[var(--border)] h-1.5 rounded-full overflow-hidden"
                    >
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-hairline text-[var(--text-muted)]">
                    <span>Remaining Principal</span>
                    <span data-testid="installment-remaining-amount" className="font-mono font-semibold tabular-nums text-[var(--text)]">
                      {formatMoney(prog.remainingPrincipalMinor)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Balance Calibration Sheet / Modal */}
      {isCalibrateOpen && (
        <CalibrationModal
          account={account}
          currentBalanceMinor={balance}
          isOpen={isCalibrateOpen}
          onClose={() => setIsCalibrateOpen(false)}
        />
      )}

      {/* Settle Modal */}
      {isSettleOpen && cycle && (
        <SettleModal
          card={account}
          billedBalanceMinor={cycle.billedBalanceMinor}
          totalDebtMinor={cycle.outstandingDebtMinor}
          isOpen={isSettleOpen}
          onClose={() => setIsSettleOpen(false)}
        />
      )}

      {/* Early Payoff Modal */}
      {payoffPlan && (
        <EarlyPayoffModal
          plan={payoffPlan}
          remainingPrincipalMinor={payoffRemainingMinor}
          isOpen={!!payoffPlan}
          onClose={() => setPayoffPlan(null)}
        />
      )}

      {/* Transaction Edit Sheet */}
      {selectedTxForEdit && (
        <TransactionEditModal
          transaction={selectedTxForEdit}
          isOpen={!!selectedTxForEdit}
          onClose={() => setSelectedTxForEdit(null)}
        />
      )}
    </main>
  );
}

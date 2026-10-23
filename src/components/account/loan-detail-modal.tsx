"use client";

import React, { useState, useEffect } from "react";
import { X, Edit2, Check } from "lucide-react";
import { LocalAccount, LocalLoan, LocalLoanScheduleEntry, LocalLoanPayment } from "@/lib/db";
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { useSync } from "@/components/sync-provider";

const getEntryEmi = (entry: LocalLoanScheduleEntry) =>
  entry.emiAmountMinor ?? (entry.principalComponentMinor + entry.interestComponentMinor);

interface LoanDetailModalProps {
  loan: LocalLoan | null;
  isOpen: boolean;
  onClose: () => void;
  accounts: LocalAccount[];
}

export function LoanDetailModal({ loan, isOpen, onClose, accounts }: LoanDetailModalProps) {
  const { sync, db } = useSync();

  const [schedule, setSchedule] = useState<LocalLoanScheduleEntry[]>([]);
  const [payments, setPayments] = useState<LocalLoanPayment[]>([]);
  const [loading, setLoading] = useState(false);

  // EMI Dialog State
  const [isEmiDialogOpen, setIsEmiDialogOpen] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmountStr, setPayAmountStr] = useState("");
  const [isExtraPrincipal, setIsExtraPrincipal] = useState(false);
  const [recalcMode, setRecalcMode] = useState<"LOWER_EMI" | "SHORTER_TENURE">("LOWER_EMI");
  const [submittingEmi, setSubmittingEmi] = useState(false);

  // Inline Override State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [overrideInterestStr, setOverrideInterestStr] = useState("");
  const [overridePrincipalStr, setOverridePrincipalStr] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [isLoanEditOpen, setIsLoanEditOpen] = useState(false);
  const [editPrincipal, setEditPrincipal] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editTenure, setEditTenure] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editPaidInstallments, setEditPaidInstallments] = useState("");
  const [editCalculationType, setEditCalculationType] = useState<"REDUCING_BALANCE" | "FLAT_RATE">("REDUCING_BALANCE");

  const eligibleAccounts = accounts.filter(
    (a) => !a.isArchived && (a.type === "BANK_SAVINGS" || a.type === "CASH")
  );

  const fetchDetails = async () => {
    if (!loan) return;
    setLoading(true);

    try {
      if (db) {
        const localEntries = await db.loanScheduleEntries
          .where("loanId")
          .equals(loan.id)
          .sortBy("installmentNumber");
        const localPayments = await db.loanPayments
          .where("loanId")
          .equals(loan.id)
          .toArray();

        if (localEntries.length > 0) {
          setSchedule(localEntries.filter((e) => !e.deletedAt));
        }
        if (localPayments.length > 0) {
          setPayments(localPayments);
        }
      }

      const res = await fetch(`/api/loans/${loan.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.loan?.scheduleEntries?.length > 0) {
          setSchedule(data.loan.scheduleEntries);
        }
        if (data.loan?.payments) {
          setPayments(data.loan.payments);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && loan) {
      fetchDetails();
      if (eligibleAccounts.length > 0 && !payAccountId) {
        setPayAccountId(eligibleAccounts[0].id);
      }
    }
  }, [isOpen, loan]);

  if (!isOpen || !loan) return null;

  const totalPrincipalPaid = payments.reduce((sum, p) => sum + p.principalComponentMinor, 0);
  const totalInterestPaid = payments.reduce((sum, p) => sum + p.interestComponentMinor, 0);
  const remainingPrincipal = Math.max(0, loan.originalPrincipalMinor - totalPrincipalPaid);

  const nextScheduled = schedule.find((e) => e.status !== "PAID");

  const openLogEmiDialog = () => {
    if (nextScheduled) {
      setPayAmountStr((getEntryEmi(nextScheduled) / 100).toFixed(2));
    } else {
      setPayAmountStr((loan.monthlyEmiAmountMinor / 100).toFixed(2));
    }
    setIsExtraPrincipal(false);
    setIsEmiDialogOpen(true);
  };

  const openLoanEdit = () => {
    setEditPrincipal((loan.originalPrincipalMinor / 100).toFixed(2));
    setEditRate((loan.annualInterestRateBps / 100).toFixed(2));
    setEditTenure(String(loan.tenureMonths));
    setEditStartDate(loan.startDate.slice(0, 10));
    setEditPaidInstallments(String(loan.paidInstallments || 0));
    setEditCalculationType(loan.calculationType);
    setIsLoanEditOpen(true);
  };

  const handleLoanEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch(`/api/loans/${loan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalPrincipalMinor: parseMoneyToMinor(editPrincipal),
        annualInterestRateBps: Math.round(Number(editRate) * 100),
        tenureMonths: Number(editTenure),
        startDate: editStartDate,
        paidInstallments: Number(editPaidInstallments),
        calculationType: editCalculationType,
      }),
    });
    if (!response.ok) return;
    setIsLoanEditOpen(false);
    await sync();
    await fetchDetails();
  };

  const handlePayEmi = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = parseMoneyToMinor(payAmountStr);
    if (!payAccountId || amountMinor <= 0) return;

    setSubmittingEmi(true);
    try {
      const res = await fetch(`/api/loans/${loan.id}/pay-emi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: payAccountId,
          scheduleEntryId: isExtraPrincipal ? null : nextScheduled?.id,
          amountMinor,
          isExtraPrincipal,
          mode: recalcMode,
        }),
      });

      if (res.ok) {
        setIsEmiDialogOpen(false);
        await sync();
        await fetchDetails();
      }
    } catch (err) {
      console.error("Failed to pay EMI:", err);
    } finally {
      setSubmittingEmi(false);
    }
  };

  const handleEarlyPayoff = async () => {
    if (!confirm("Are you sure you want to close this loan? All remaining schedule will be cleared.")) {
      return;
    }

    try {
      const res = await fetch(`/api/loans/${loan.id}/close`, { method: "POST" });
      if (res.ok) {
        if (typeof window !== "undefined") {
          await db.loans.update(loan.id, {
            status: "CLOSED",
            closedAt: new Date().toISOString(),
          });
        }
        await sync();
        onClose();
      }
    } catch {
      // ignore
    }
  };

  const handleSaveOverride = async (entryId: string) => {
    setSavingOverride(true);
    try {
      const payload: { interestComponentMinor?: number; principalComponentMinor?: number } = {};
      if (overrideInterestStr.trim()) {
        payload.interestComponentMinor = parseMoneyToMinor(overrideInterestStr);
      }
      if (overridePrincipalStr.trim()) {
        payload.principalComponentMinor = parseMoneyToMinor(overridePrincipalStr);
      }

      const res = await fetch(`/api/loans/${loan.id}/schedule/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditingEntryId(null);
        await sync();
        await fetchDetails();
      }
    } catch (err) {
      console.error("Failed to override entry:", err);
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div
      data-testid="loan-detail-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 md:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-3xl bg-[var(--surface)] border border-hairline rounded-xl shadow-2xl p-4 md:p-6 space-y-4 my-auto modal-sheet-dialog flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-hairline shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">{loan.lenderName}</h2>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  loan.kind === "LEASE"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                }`}
              >
                {loan.kind}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  loan.status === "ACTIVE"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-gray-500/10 text-gray-500"
                }`}
              >
                {loan.status}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Original: {formatMoney(loan.originalPrincipalMinor)} • APR:{" "}
              {(loan.annualInterestRateBps / 100).toFixed(2)}% • {loan.tenureMonths} Months •{" "}
              {loan.calculationType === "REDUCING_BALANCE" ? "Reducing Balance" : "Flat Rate"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
          <button type="button" onClick={openLoanEdit} className="px-2 py-1 rounded border border-hairline text-xs font-medium">
            Edit loan
          </button>
        </div>

        {isLoanEditOpen && (
          <form onSubmit={handleLoanEdit} className="grid grid-cols-2 gap-2 p-3 rounded border border-hairline bg-[var(--bg)] text-xs">
            <label>Principal<input value={editPrincipal} onChange={(e) => setEditPrincipal(e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]" /></label>
            <label>APR %<input type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]" /></label>
            <label>Tenure months<input type="number" value={editTenure} onChange={(e) => setEditTenure(e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]" /></label>
            <label>Started date<input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]" /></label>
            <label>Paid installments<input type="number" min="0" value={editPaidInstallments} onChange={(e) => setEditPaidInstallments(e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]" /></label>
            <label>Calculation<select value={editCalculationType} onChange={(e) => setEditCalculationType(e.target.value as "REDUCING_BALANCE" | "FLAT_RATE")} className="w-full mt-1 px-2 py-1 rounded border border-hairline bg-[var(--surface)]"><option value="REDUCING_BALANCE">Reducing balance</option><option value="FLAT_RATE">Flat rate</option></select></label>
            <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setIsLoanEditOpen(false)} className="px-2 py-1 rounded border border-hairline">Cancel</button><button type="submit" className="px-2 py-1 rounded bg-[var(--accent)] text-white">Save</button></div>
          </form>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2 px-3 bg-[var(--bg)] rounded-lg border border-hairline text-center">
          <div>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">
              Remaining Principal
            </span>
            <span
              data-testid="loan-detail-remaining-principal"
              className="text-xs md:text-sm font-semibold font-mono tabular-nums text-[var(--expense)]"
            >
              {formatMoney(remainingPrincipal)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">
              Principal Paid
            </span>
            <span
              data-testid="loan-paid-principal"
              className="text-xs md:text-sm font-semibold font-mono tabular-nums text-[var(--text)]"
            >
              {formatMoney(totalPrincipalPaid)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">
              Interest Paid
            </span>
            <span
              data-testid="loan-interest-paid"
              className="text-xs md:text-sm font-semibold font-mono tabular-nums text-[var(--text)]"
            >
              {formatMoney(totalInterestPaid)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">
              Next Due Date
            </span>
            <span
              data-testid="loan-next-due"
              className="text-xs md:text-sm font-semibold text-[var(--text)]"
            >
              {nextScheduled ? new Date(nextScheduled.dueDate).toLocaleDateString() : "Cleared"}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-[var(--text-muted)]">
            <span>Scheduled Monthly EMI: </span>
            <span data-testid="loan-detail-emi" className="font-semibold text-[var(--text)] font-mono">
              {formatMoney(nextScheduled ? getEntryEmi(nextScheduled) : loan.monthlyEmiAmountMinor)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {loan.status === "ACTIVE" && (
              <>
                <button
                  type="button"
                  data-testid="loan-log-emi-btn"
                  onClick={openLogEmiDialog}
                  className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  Log EMI
                </button>

                <button
                  type="button"
                  data-testid="loan-early-payoff-btn"
                  onClick={handleEarlyPayoff}
                  className="px-2.5 py-1.5 rounded border border-hairline text-xs font-medium text-[var(--expense)] hover:bg-[var(--border)] transition-colors"
                >
                  Early Payoff
                </button>
              </>
            )}
          </div>
        </div>

        {/* Schedule Table (Desktop) / Cards (Mobile) */}
        <div className="flex-1 min-h-0 overflow-y-auto min-h-[220px] border border-hairline rounded-lg">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading schedule...</div>
          ) : (
            <>
              {/* Desktop Table View */}
              <table className="hidden md:table w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg)] text-[var(--text-muted)] text-[11px] sticky top-0 border-b border-hairline">
                  <tr>
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Due Date</th>
                    <th className="py-2 px-3 font-medium text-right">Opening</th>
                    <th className="py-2 px-3 font-medium text-right">EMI</th>
                    <th className="py-2 px-3 font-medium text-right">Principal</th>
                    <th className="py-2 px-3 font-medium text-right">Interest</th>
                    <th className="py-2 px-3 font-medium text-right">Closing</th>
                    <th className="py-2 px-3 font-medium text-center">Status</th>
                    <th className="py-2 px-3 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {schedule.map((entry) => {
                    const isEditing = editingEntryId === entry.id;

                    return (
                      <tr
                        key={entry.id}
                        data-testid={`schedule-row-${entry.id}`}
                        className={`hover:bg-[var(--bg)]/50 transition-colors ${
                          entry.status === "PAID" ? "opacity-60 bg-[var(--bg)]/30" : ""
                        }`}
                      >
                        <td className="py-2 px-3 font-medium font-mono">{entry.installmentNumber}</td>
                        <td className="py-2 px-3 text-[var(--text-muted)]">
                          {new Date(entry.dueDate).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatMoney(entry.openingBalanceMinor)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-[var(--text)]">
                          {formatMoney(getEntryEmi(entry))}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-income">
                          {isEditing ? (
                            <input
                              type="text"
                              value={overridePrincipalStr}
                              onChange={(e) => setOverridePrincipalStr(e.target.value)}
                              className="w-20 px-1 py-0.5 rounded border border-hairline text-right font-mono text-xs bg-[var(--bg)]"
                            />
                          ) : (
                            formatMoney(entry.principalComponentMinor)
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-expense">
                          {isEditing ? (
                            <input
                              type="text"
                              value={overrideInterestStr}
                              onChange={(e) => setOverrideInterestStr(e.target.value)}
                              className="w-20 px-1 py-0.5 rounded border border-hairline text-right font-mono text-xs bg-[var(--bg)]"
                            />
                          ) : (
                            formatMoney(entry.interestComponentMinor)
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                          {formatMoney(entry.closingBalanceMinor)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                              entry.status === "PAID"
                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                : entry.status === "OVERRIDDEN"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {entry.status !== "PAID" && (
                            <>
                              {isEditing ? (
                                <button
                                  type="button"
                                  data-testid="save-override-btn"
                                  onClick={() => handleSaveOverride(entry.id)}
                                  disabled={savingOverride}
                                  className="p-1 rounded text-income hover:bg-green-500/10 transition-colors"
                                >
                                  <Check size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  data-testid="override-row-btn"
                                  onClick={() => {
                                    setEditingEntryId(entry.id);
                                    setOverridePrincipalStr(
                                      (entry.principalComponentMinor / 100).toFixed(2)
                                    );
                                    setOverrideInterestStr(
                                      (entry.interestComponentMinor / 100).toFixed(2)
                                    );
                                  }}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Card-Based Schedule View */}
              <div className="md:hidden divide-y divide-hairline">
                {schedule.map((entry) => (
                  <div
                    key={entry.id}
                    data-testid={`schedule-row-${entry.id}`}
                    className={`p-3 space-y-1.5 ${
                      entry.status === "PAID" ? "opacity-60 bg-[var(--bg)]/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text)]">
                        #{entry.installmentNumber} • {new Date(entry.dueDate).toLocaleDateString()}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                          entry.status === "PAID"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : entry.status === "OVERRIDDEN"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 text-[11px] gap-1 font-mono tabular-nums text-[var(--text-muted)]">
                      <div>
                        <span>EMI: </span>
                        <span className="font-semibold text-[var(--text)]">
                          {formatMoney(getEntryEmi(entry))}
                        </span>
                      </div>
                      <div>
                        <span>Closing: </span>
                        <span>{formatMoney(entry.closingBalanceMinor)}</span>
                      </div>
                      <div>
                        <span className="text-income">Principal: </span>
                        <span>{formatMoney(entry.principalComponentMinor)}</span>
                      </div>
                      <div>
                        <span className="text-expense">Interest: </span>
                        <span>{formatMoney(entry.interestComponentMinor)}</span>
                      </div>
                    </div>

                    {entry.status !== "PAID" && (
                      <div className="flex items-center justify-end pt-1">
                        {editingEntryId === entry.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={overridePrincipalStr}
                              onChange={(e) => setOverridePrincipalStr(e.target.value)}
                              placeholder="Principal"
                              className="w-20 px-1 py-0.5 rounded border border-hairline text-right font-mono text-xs bg-[var(--bg)]"
                            />
                            <input
                              type="text"
                              value={overrideInterestStr}
                              onChange={(e) => setOverrideInterestStr(e.target.value)}
                              placeholder="Interest"
                              className="w-20 px-1 py-0.5 rounded border border-hairline text-right font-mono text-xs bg-[var(--bg)]"
                            />
                            <button
                              type="button"
                              data-testid="save-override-btn"
                              onClick={() => handleSaveOverride(entry.id)}
                              disabled={savingOverride}
                              className="p-1 rounded text-income hover:bg-green-500/10 transition-colors"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            data-testid="override-row-btn"
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setOverridePrincipalStr(
                                (entry.principalComponentMinor / 100).toFixed(2)
                              );
                              setOverrideInterestStr(
                                (entry.interestComponentMinor / 100).toFixed(2)
                              );
                            }}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1 text-[11px]"
                          >
                            <Edit2 size={12} />
                            <span>Override</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Log EMI Sub-Dialog / Modal */}
        {isEmiDialogOpen && (
          <div
            data-testid="log-emi-dialog"
            className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-[var(--surface)] border border-hairline rounded-xl shadow-2xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {isExtraPrincipal ? "Pay Extra Principal" : "Log EMI Payment"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEmiDialogOpen(false)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handlePayEmi} className="space-y-3 text-xs">
                {/* Account Selection */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-muted)]">
                    Payment Account
                  </label>
                  <select
                    data-testid="emi-pay-account"
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {eligibleAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatMoney(a.openingBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-muted)]">
                    Payment Amount (LKR)
                  </label>
                  <input
                    type="text"
                    data-testid="emi-pay-amount"
                    value={payAmountStr}
                    onChange={(e) => setPayAmountStr(e.target.value)}
                    className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
                  />
                </div>

                {/* Extra Principal Toggle */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="emi-extra-principal-toggle"
                    data-testid="emi-extra-principal-toggle"
                    checked={isExtraPrincipal}
                    onChange={(e) => setIsExtraPrincipal(e.target.checked)}
                    className="rounded border-hairline"
                  />
                  <label
                    htmlFor="emi-extra-principal-toggle"
                    className="text-xs font-medium text-[var(--text)] cursor-pointer"
                  >
                    Extra Principal Payment
                  </label>
                </div>

                {/* Recalculation Mode (if Extra Principal) */}
                {isExtraPrincipal && (
                  <div className="space-y-1 pt-1">
                    <label className="block text-xs font-medium text-[var(--text-muted)]">
                      Schedule Adjustment
                    </label>
                    <select
                      data-testid="emi-recalc-mode"
                      value={recalcMode}
                      onChange={(e) =>
                        setRecalcMode(e.target.value as "LOWER_EMI" | "SHORTER_TENURE")
                      }
                      className="w-full h-8 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="LOWER_EMI">Lower EMI (Keep tenure)</option>
                      <option value="SHORTER_TENURE">Shorter Tenure (Keep monthly EMI)</option>
                    </select>
                  </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
                  <button
                    type="button"
                    onClick={() => setIsEmiDialogOpen(false)}
                    className="px-3 py-1.5 rounded border border-hairline text-xs font-medium hover:bg-[var(--border)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="emi-pay-submit"
                    disabled={submittingEmi}
                    className="px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {submittingEmi ? "Processing..." : "Confirm Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

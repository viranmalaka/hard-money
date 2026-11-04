"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Code,
  Play,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";

interface ParsedSmsPayload {
  amountText?: string | null;
  merchantOrEntity?: string | null;
  [key: string]: unknown;
}

interface BankSmsItem {
  id: string;
  sender: string;
  rawMessage: string;
  receivedAt: string;
  createdAt?: string;
  status: string;
  parseMethod: string | null;
  parsedPayload: ParsedSmsPayload | null;
  reviewReason: string | null;
  failureReason?: string | null;
  attempts?: number;
  transaction?: {
    id: string;
    amountMinor: number;
    type: string;
    subType: string;
    note: string | null;
  } | null;
}

export default function SmsActivityPage() {
  const [items, setItems] = useState<BankSmsItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const refreshList = useCallback(
    async (status = filterStatus) => {
      setLoading(true);
      try {
        const url =
          status === "ALL"
            ? "/api/sms/activity"
            : `/api/sms/activity?status=${encodeURIComponent(status)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [filterStatus]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const url =
          filterStatus === "ALL"
            ? "/api/sms/activity"
            : `/api/sms/activity?status=${encodeURIComponent(filterStatus)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok && active) {
          const data = await res.json();
          setItems(data.items || []);
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [filterStatus]);

  const handleForceProcess = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/sms/inbox/${id}/retry?force=true`, {
        method: "POST",
      });
      if (res.ok) {
        await refreshList(filterStatus);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || data.message || "Failed to process SMS");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      alert(msg);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const statuses = [
    { label: "All", value: "ALL" },
    { label: "Processing", value: "PROCESSING" },
    { label: "Processed", value: "PROCESSED" },
    { label: "Needs Review", value: "NEEDS_REVIEW" },
    { label: "Ignored", value: "IGNORED_NON_TX" },
    { label: "Pending", value: "PENDING" },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Bank SMS Activity"
        subtitle="Audit Log & Parser Results"
        backHref="/more"
        backLabel="Back to More"
        rightSlot={
          <button
            type="button"
            onClick={() => refreshList(filterStatus)}
            disabled={loading}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* Status Filters */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
        {statuses.map((s) => (
          <button
            key={s.value}
            type="button"
            data-testid={`status-filter-${s.value}`}
            onClick={() => setFilterStatus(s.value)}
            className={`h-9 px-4 rounded-2xl font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
              filterStatus === s.value
                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* List of Activity items */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center text-sm text-[var(--text-muted)]">
            {loading ? "Loading bank SMS log..." : "No bank SMS activity found for this filter."}
          </div>
        ) : (
          items.map((item) => {
            const isExpanded = expandedId === item.id;
            const parsed = item.parsedPayload;
            const parsedAmount =
              parsed?.amountText ||
              (item.transaction?.amountMinor
                ? (item.transaction.amountMinor / 100).toFixed(2)
                : null);

            const ingressTime = new Date(item.createdAt || item.receivedAt).getTime();
            const elapsedSeconds = Math.max(0, Math.floor((now - ingressTime) / 1000));
            const canForceProcess = elapsedSeconds >= 60;
            const secondsRemaining = Math.max(0, 60 - elapsedSeconds);

            return (
              <div
                key={item.id}
                data-testid={`sms-activity-row-${item.id}`}
                className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden transition-all shadow-xs"
              >
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[var(--surface-hover)]/60 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[var(--text)] uppercase tracking-wide">
                        {item.sender}
                      </span>

                      <span
                        data-testid="sms-status-badge"
                        className={`px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase ${
                          item.status === "PROCESSED"
                            ? "bg-[var(--income)]/12 text-[var(--income)]"
                            : item.status === "IGNORED_NON_TX"
                              ? "bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]"
                              : item.status === "NEEDS_REVIEW"
                                ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                                : item.status === "PROCESSING"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse"
                                  : "bg-blue-500/12 text-blue-500"
                        }`}
                      >
                        {item.status}
                      </span>

                      {item.status === "PROCESSING" &&
                        (canForceProcess ? (
                          <button
                            type="button"
                            data-testid={`force-process-btn-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleForceProcess(item.id);
                            }}
                            disabled={processingIds.has(item.id)}
                            className="px-2.5 py-1 rounded-full text-2xs font-bold bg-[var(--accent)] hover:opacity-95 text-white inline-flex items-center gap-1 transition-opacity shadow-xs cursor-pointer"
                            title="SMS has been processing for more than 1 minute. Click to forcefully reprocess."
                          >
                            {processingIds.has(item.id) ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <Play size={11} />
                            )}
                            <span>
                              {processingIds.has(item.id) ? "Processing..." : "Force Process"}
                            </span>
                          </button>
                        ) : (
                          <span
                            className="px-2.5 py-0.5 rounded-full text-2xs font-mono text-[var(--text-muted)] bg-[var(--bg)] border border-[var(--border)] inline-flex items-center gap-1"
                            title={`Processing started ${elapsedSeconds}s ago.`}
                          >
                            <Clock size={11} className="text-amber-500" />
                            Wait {secondsRemaining}s
                          </span>
                        ))}

                      {item.status === "NEEDS_REVIEW" && item.reviewReason && (
                        <span
                          data-testid="sms-review-reason"
                          className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                        >
                          {item.reviewReason === "CREDIT_CARD_SETTLEMENT"
                            ? "Card Settlement Review"
                            : item.reviewReason}
                        </span>
                      )}

                      {item.parseMethod && (
                        <span
                          data-testid="sms-parse-method"
                          className="px-2 py-0.5 rounded-full text-2xs font-mono bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)]"
                        >
                          {item.parseMethod}
                        </span>
                      )}

                      {item.transaction?.id && (
                        <Link
                          href={`/?highlight=${item.transaction.id}`}
                          data-testid="sms-tx-link"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline font-semibold"
                        >
                          <span>View Transaction →</span>
                        </Link>
                      )}
                    </div>

                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 flex-wrap">
                      <span>{new Date(item.receivedAt).toLocaleString()}</span>
                      {parsed?.merchantOrEntity && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--text)] font-semibold">
                            {parsed.merchantOrEntity}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {parsedAmount && (
                      <span
                        data-testid="sms-amount"
                        className="text-sm font-bold font-mono text-[var(--text)]"
                      >
                        LKR {parsedAmount}
                      </span>
                    )}
                    <button
                      type="button"
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-[var(--bg)] border-t border-[var(--border)] space-y-4 text-xs">
                    {item.status === "PROCESSING" && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={15} />
                            <span>Stuck in PROCESSING?</span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {canForceProcess
                              ? "This message has been in processing state for over 1 minute. You can safely force continue processing now."
                              : `Processing was initiated ${elapsedSeconds}s ago. Force trigger unlocks in ${secondsRemaining}s.`}
                          </p>
                          {item.failureReason && (
                            <p className="text-2xs text-[var(--expense)] font-mono mt-0.5">
                              Failure hint: {item.failureReason}
                            </p>
                          )}
                        </div>

                        {canForceProcess && (
                          <button
                            type="button"
                            data-testid={`drawer-force-btn-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleForceProcess(item.id);
                            }}
                            disabled={processingIds.has(item.id)}
                            className="h-10 px-4 rounded-2xl text-xs font-bold bg-[var(--accent)] hover:opacity-95 text-white inline-flex items-center gap-1.5 shrink-0 transition-opacity cursor-pointer"
                          >
                            <RefreshCw
                              size={13}
                              className={processingIds.has(item.id) ? "animate-spin" : ""}
                            />
                            <span>
                              {processingIds.has(item.id) ? "Processing..." : "Force Continue"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Raw SMS Viewer */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        <FileText size={13} />
                        <span>Raw SMS Message</span>
                      </div>
                      <div
                        data-testid="raw-sms-viewer"
                        className="p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] font-mono text-xs text-[var(--text)] break-words whitespace-pre-wrap leading-relaxed"
                      >
                        {item.rawMessage}
                      </div>
                    </div>

                    {/* Parsed JSON Inspect */}
                    {item.parsedPayload && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          <Code size={13} />
                          <span>Parsed JSON Payload</span>
                        </div>
                        <pre
                          data-testid="parsed-json-inspect"
                          className="p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] font-mono text-xs text-[var(--text)] overflow-x-auto leading-relaxed"
                        >
                          {JSON.stringify(item.parsedPayload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  Code,
  Play,
  Clock,
  AlertTriangle,
} from "lucide-react";

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

  // Update clock every 2 seconds to refresh countdown timers for PROCESSING items
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const refreshList = useCallback(async (status = filterStatus) => {
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
  }, [filterStatus]);

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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/more"
            transitionTypes={["nav-back"]}
            className="p-1.5 rounded hover:bg-surface border border-hairline text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
              Bank SMS Activity Log
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Real-time audit log of incoming bank SMS messages and parse results
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refreshList(filterStatus)}
          disabled={loading}
          className="p-2 rounded hover:bg-surface border border-hairline text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <Filter size={14} className="text-[var(--text-muted)] mr-1 flex-shrink-0" />
        {statuses.map((s) => (
          <button
            key={s.value}
            type="button"
            data-testid={`status-filter-${s.value}`}
            onClick={() => setFilterStatus(s.value)}
            className={`px-3 py-1 rounded font-medium border border-hairline whitespace-nowrap transition-colors ${
              filterStatus === s.value
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-surface hover:bg-surface-hover text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* List of Activity items */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="flat-card p-8 text-center text-xs text-[var(--text-muted)]">
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

            // Ingress timestamp comparison for PROCESSING guard
            const ingressTime = new Date(item.createdAt || item.receivedAt).getTime();
            const elapsedSeconds = Math.max(0, Math.floor((now - ingressTime) / 1000));
            const canForceProcess = elapsedSeconds >= 60;
            const secondsRemaining = Math.max(0, 60 - elapsedSeconds);

            return (
              <div
                key={item.id}
                data-testid={`sms-activity-row-${item.id}`}
                className="flat-card overflow-hidden transition-all border border-hairline"
              >
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-surface/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-[var(--text)] uppercase tracking-wide">
                        {item.sender}
                      </span>

                      {/* Status Badge */}
                      <span
                        data-testid="sms-status-badge"
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          item.status === "PROCESSED"
                            ? "bg-[var(--income)]/10 text-[var(--income)]"
                            : item.status === "IGNORED_NON_TX"
                            ? "bg-[var(--text-muted)]/15 text-[var(--text-muted)]"
                            : item.status === "NEEDS_REVIEW"
                            ? "bg-amber-500/10 text-amber-500"
                            : item.status === "PROCESSING"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse"
                            : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {item.status}
                      </span>

                      {/* Force Process Trigger for stuck PROCESSING state */}
                      {item.status === "PROCESSING" && (
                        canForceProcess ? (
                          <button
                            type="button"
                            data-testid={`force-process-btn-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleForceProcess(item.id);
                            }}
                            disabled={processingIds.has(item.id)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--accent)] hover:opacity-90 text-white flex items-center gap-1 transition-opacity shadow-sm"
                            title="SMS has been processing for more than 1 minute. Click to forcefully reprocess."
                          >
                            {processingIds.has(item.id) ? (
                              <RefreshCw size={10} className="animate-spin" />
                            ) : (
                              <Play size={10} />
                            )}
                            <span>{processingIds.has(item.id) ? "Processing..." : "Force Process"}</span>
                          </button>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded text-[9px] font-mono text-[var(--text-muted)] bg-surface border border-hairline flex items-center gap-1"
                            title={`Processing started ${elapsedSeconds}s ago. Force trigger enabled after 1 minute to prevent race conditions.`}
                          >
                            <Clock size={10} className="text-amber-500" />
                            Wait {secondsRemaining}s
                          </span>
                        )
                      )}

                      {/* Review Reason Badge */}
                      {item.status === "NEEDS_REVIEW" && item.reviewReason && (
                        <span
                          data-testid="sms-review-reason"
                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        >
                          {item.reviewReason === "CREDIT_CARD_SETTLEMENT"
                            ? "Card Settlement Review"
                            : item.reviewReason}
                        </span>
                      )}

                      {/* Parse Method */}
                      {item.parseMethod && (
                        <span
                          data-testid="sms-parse-method"
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-hairline text-[var(--text-muted)]"
                        >
                          {item.parseMethod}
                        </span>
                      )}

                      {/* Transaction Link */}
                      {item.transaction?.id && (
                        <Link
                          href={`/?highlight=${item.transaction.id}`}
                          data-testid="sms-tx-link"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline font-medium"
                        >
                          <span>View Transaction →</span>
                        </Link>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                      <span>{new Date(item.receivedAt).toLocaleString()}</span>
                      {parsed?.merchantOrEntity && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--text)] font-medium">
                            {parsed.merchantOrEntity}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    {parsedAmount && (
                      <div className="text-right">
                        <span
                          data-testid="sms-amount"
                          className="text-xs font-semibold text-[var(--text)]"
                        >
                          LKR {parsedAmount}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Inspection Drawer */}
                {isExpanded && (
                  <div className="p-3.5 bg-[var(--surface-hover)]/40 border-t border-hairline space-y-3 text-xs">
                    {/* Stuck in Processing Alert & Manual Action */}
                    {item.status === "PROCESSING" && (
                      <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={14} />
                            <span>Stuck in PROCESSING?</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            {canForceProcess
                              ? "This message has been in processing state for over 1 minute. It may have stalled due to a serverless freeze or timeout. You can safely force continue processing now."
                              : `Processing was initiated ${elapsedSeconds}s ago. To guarantee against duplicate processing, force trigger unlocks in ${secondsRemaining}s.`}
                          </p>
                          {item.failureReason && (
                            <p className="text-[10px] text-red-500 font-mono mt-0.5">
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
                            className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] hover:opacity-90 text-white flex items-center gap-1.5 shrink-0 transition-opacity"
                          >
                            <RefreshCw size={12} className={processingIds.has(item.id) ? "animate-spin" : ""} />
                            <span>{processingIds.has(item.id) ? "Processing..." : "Force Continue"}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Raw SMS Viewer */}
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                        <FileText size={13} />
                        <span>Raw SMS Message</span>
                      </div>
                      <div
                        data-testid="raw-sms-viewer"
                        className="p-2.5 rounded bg-[var(--bg)] border border-hairline font-mono text-[11px] text-[var(--text)] break-words whitespace-pre-wrap"
                      >
                        {item.rawMessage}
                      </div>
                    </div>

                    {/* Parsed JSON Inspect */}
                    {item.parsedPayload && (
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                          <Code size={13} />
                          <span>Parsed JSON Payload</span>
                        </div>
                        <pre
                          data-testid="parsed-json-inspect"
                          className="p-2.5 rounded bg-[var(--bg)] border border-hairline font-mono text-[11px] text-[var(--text)] overflow-x-auto"
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

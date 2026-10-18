"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Filter, ChevronDown, ChevronUp, FileText, Code } from "lucide-react";
import { formatMoney } from "@/lib/finance-core/money";

interface BankSmsItem {
  id: string;
  sender: string;
  rawMessage: string;
  receivedAt: string;
  status: string;
  parseMethod: string | null;
  parsedPayload: any | null;
  reviewReason: string | null;
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

  const fetchItems = async (status = filterStatus) => {
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
  };

  useEffect(() => {
    fetchItems(filterStatus);
  }, [filterStatus]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const statuses = [
    { label: "All", value: "ALL" },
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
          onClick={() => fetchItems(filterStatus)}
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
            const parsedAmount =
              item.parsedPayload?.amountText ||
              (item.transaction?.amountMinor
                ? (item.transaction.amountMinor / 100).toFixed(2)
                : null);

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
                    <div className="flex items-center gap-2">
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
                            : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {item.status}
                      </span>

                      {/* Parse Method */}
                      {item.parseMethod && (
                        <span
                          data-testid="sms-parse-method"
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-hairline text-[var(--text-muted)]"
                        >
                          {item.parseMethod}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                      <span>{new Date(item.receivedAt).toLocaleString()}</span>
                      {item.parsedPayload?.merchantOrEntity && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--text)] font-medium">
                            {item.parsedPayload.merchantOrEntity}
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

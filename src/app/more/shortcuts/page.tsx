"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, ShieldCheck, Zap } from "lucide-react";

export default function ShortcutsGuidePage() {
  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/more" transitionTypes={["nav-back"]}
          className="p-1.5 rounded hover:bg-surface border border-hairline text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Apple Shortcuts Setup Guide
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Automatically ingest bank transaction SMS on iOS via Apple Shortcuts
          </p>
        </div>
      </div>

      {/* Quick Download Card */}
      <div className="flat-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--surface)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Zap size={16} className="text-[var(--accent)]" />
            <span>Pre-built Apple Shortcut</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Download our ready-to-use iOS Shortcut configured for Sri Lankan banks.
          </p>
        </div>
        <a
          href="/api/shortcuts/download"
          download="HardMoney_SMS_Ingress.shortcut"
          data-testid="download-shortcut-btn"
          className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
        >
          <Download size={14} />
          <span>Download Shortcut</span>
        </a>
      </div>

      <div className="flat-card p-4 flex items-start gap-3 bg-[var(--expense)]/5 border border-[var(--expense)]/30">
        <AlertTriangle size={20} className="text-[var(--expense)] flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-semibold text-[var(--text)] block">API key warning</span>
          <p className="text-[var(--text-muted)]">
            The downloaded Shortcut contains your current webhook API key. If you regenerate or rotate the key, older Shortcuts will stop working and must be downloaded again.
          </p>
        </div>
      </div>

      {/* Step-by-step instructions */}
      <div className="space-y-3">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Step-by-Step Instructions
        </span>

        <div className="flat-card p-4 space-y-4 text-xs text-[var(--text)]">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-bold flex items-center justify-center flex-shrink-0">
              1
            </div>
            <div className="space-y-1">
              <span className="font-semibold block">Generate your Webhook API Key</span>
              <p className="text-[var(--text-muted)]">
                Go to <Link href="/more" transitionTypes={["nav-back"]} className="text-[var(--accent)] underline">More &gt; User Settings</Link> and generate a Webhook API Key. Copy the key as it is only displayed once.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-bold flex items-center justify-center flex-shrink-0">
              2
            </div>
            <div className="space-y-1">
              <span className="font-semibold block">Create an iOS Automation</span>
              <p className="text-[var(--text-muted)]">
                Open the <strong>Shortcuts</strong> app on your iPhone or iPad, tap the <strong>Automation</strong> tab, and tap <strong>New Automation</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-bold flex items-center justify-center flex-shrink-0">
              3
            </div>
            <div className="space-y-1">
              <span className="font-semibold block">Select Message Trigger</span>
              <p className="text-[var(--text-muted)]">
                Choose <strong>Message</strong>. Add your bank senders (e.g. <code>COMBANK</code>, <code>SAMPATH</code>, <code>HNB</code>) and select <strong>Run Immediately</strong> (without asking to run).
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-bold flex items-center justify-center flex-shrink-0">
              4
            </div>
            <div className="space-y-1">
              <span className="font-semibold block">Forward Payload to Webhook</span>
              <p className="text-[var(--text-muted)]">
                Add a <strong>Get Contents of URL</strong> action:
                <br />• <strong>URL:</strong> <code>https://your-domain.com/api/v1/webhooks/sms-ingress</code>
                <br />• <strong>Method:</strong> POST
                <br />• <strong>Headers:</strong> <code>x-api-key: [YOUR_API_KEY]</code>, <code>Content-Type: application/json</code>
                <br />• <strong>Request Body:</strong> JSON with fields <code>rawSms</code>, <code>sender</code>, and <code>receivedAt</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy disclosure */}
      <div className="flat-card p-4 flex items-start gap-3 bg-[var(--surface-hover)]/30 border border-hairline">
        <ShieldCheck size={20} className="text-[var(--income)] flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-semibold text-[var(--text)] block">Privacy & Security Guarantee</span>
          <p className="text-[var(--text-muted)]">
            Raw SMS messages are processed strictly in memory and encrypted or archived securely. Your sensitive credentials and account numbers are never printed to public server logs.
          </p>
        </div>
      </div>
    </main>
  );
}

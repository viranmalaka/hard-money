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
          href="/HardMoney_SMS_Ingress.shortcut"
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
            The downloaded Shortcut is a template. Open it in Apple Shortcuts and replace the placeholder URL and API key with your HardMoney values before using it.
          </p>
        </div>
      </div>

      <div className="flat-card p-4 space-y-2 bg-[var(--surface)] border border-hairline">
        <span className="font-semibold text-sm text-[var(--text)] block">
          Before you start
        </span>
        <ul className="text-xs text-[var(--text-muted)] space-y-1.5 list-disc pl-4">
          <li>Your HardMoney website must use a public <strong>HTTPS</strong> address. An iPhone cannot call <code>localhost</code> on your computer.</li>
          <li>Apple lets an automation run when a message arrives, but iOS does not let an app secretly read every SMS. You choose the sender or senders in the automation.</li>
          <li>The shortcut sends the message text and sender to HardMoney. It does not create a transaction directly; HardMoney parses the SMS after it receives it.</li>
        </ul>
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
              <span className="font-semibold block">Open the Automation screen</span>
              <p className="text-[var(--text-muted)]">
                Open the <strong>Shortcuts</strong> app on your iPhone, tap <strong>Automation</strong>, tap <strong>New Automation</strong> (or the <strong>+</strong> button), then choose <strong>Message</strong>.
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
                Under <strong>Sender</strong>, add the bank sender names exactly as they appear in your Messages app, for example <code>COMBANK</code> or <code>SAMPATH</code>. Choose <strong>Run Immediately</strong> (or turn off <strong>Ask Before Running</strong>), then tap <strong>Next</strong>.
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
                Open the downloaded Shortcut, then update its <strong>Get Contents of URL</strong> action. Set:
                <br />• <strong>URL:</strong> <code>https://your-domain.com/api/v1/webhooks/sms-ingress</code>
                <br />• <strong>Method:</strong> POST
                <br />• <strong>Headers:</strong> <code>x-api-key: [YOUR_API_KEY]</code>, <code>Content-Type: application/json</code>
                <br />• <strong>Request Body:</strong> JSON
                <br />• <strong>rawSms:</strong> choose the trigger&apos;s <strong>Message</strong> magic variable
                <br />• <strong>sender:</strong> choose the trigger&apos;s <strong>Sender</strong> magic variable
                <br />• <strong>receivedAt:</strong> choose <strong>Current Date</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Tiny example
        </span>
        <div className="flat-card p-4 space-y-2 text-xs text-[var(--text)]">
          <p>
            Imagine your bank sends: <code>LKR 2,000.00 debited from AC **4681 for groceries</code>.
          </p>
          <p className="text-[var(--text-muted)]">
            The automation sends this small package:
          </p>
          <pre className="overflow-x-auto rounded bg-[var(--bg)] border border-hairline p-3 text-[11px]">
{`{
  "rawSms": "LKR 2,000.00 debited from AC **4681 for groceries",
  "sender": "SAMPATH",
  "receivedAt": "2026-10-23T09:00:00.000Z"
}`}
          </pre>
          <p className="text-[var(--text-muted)]">
            HardMoney stores the SMS, tries its normal template parser first, and only uses Gemini if the template parser cannot understand the message.
          </p>
        </div>
      </div>

      <div className="flat-card p-4 space-y-2 bg-[var(--surface)] border border-hairline">
        <span className="font-semibold text-sm text-[var(--text)] block">
          How to test it
        </span>
        <ol className="text-xs text-[var(--text-muted)] space-y-1.5 list-decimal pl-4">
          <li>Send a test bank SMS to the iPhone, or wait for a real bank alert.</li>
          <li>Open HardMoney and visit <strong>More &gt; SMS Activity</strong>.</li>
          <li>Look for <strong>PROCESSED</strong> and <strong>TEMPLATE</strong>. Unknown formats may show <strong>GEMINI</strong> or <strong>NEEDS_REVIEW</strong>.</li>
          <li>If nothing appears, check that the sender filter matches exactly and that the webhook key was copied correctly.</li>
        </ol>
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

"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, Download, ShieldCheck, Zap } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";

export default function ShortcutsGuidePage() {
  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Apple Shortcuts Guide"
        subtitle="Automated iOS Bank SMS Forwarding"
        backHref="/more"
        backLabel="Back to More"
      />

      {/* Quick Download Card */}
      <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
            <Zap size={20} />
          </div>
          <div className="space-y-1">
            <span className="text-base font-bold text-[var(--text)] block">
              Pre-built Apple Shortcut
            </span>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Download our ready-to-use iOS Shortcut configured for Sri Lankan banks.
            </p>
          </div>
        </div>
        <a
          href="/HardMoney_SMS_Ingress.shortcut"
          download="HardMoney_SMS_Ingress.shortcut"
          data-testid="download-shortcut-btn"
          className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all shrink-0"
        >
          <Download size={15} />
          <span>Download Shortcut</span>
        </a>
      </div>

      <div className="rounded-3xl p-5 flex items-start gap-3.5 bg-[var(--expense)]/8 border border-[var(--expense)]/30">
        <AlertTriangle size={20} className="text-[var(--expense)] shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 leading-relaxed">
          <span className="font-bold text-[var(--text)] block">API Key Warning</span>
          <p className="text-[var(--text-muted)]">
            The downloaded Shortcut is a template. Open it in Apple Shortcuts and replace the
            placeholder URL and API key with your HardMoney values before using it.
          </p>
        </div>
      </div>

      <div className="rounded-3xl p-5 sm:p-6 space-y-3 bg-[var(--surface)] border border-[var(--border)] shadow-xs">
        <span className="font-bold text-sm text-[var(--text)] block">Before You Start</span>
        <ul className="text-xs text-[var(--text-muted)] space-y-2 list-disc pl-4 leading-relaxed">
          <li>
            Your HardMoney website must use a public <strong>HTTPS</strong> address. An iPhone
            cannot call <code>localhost</code> on your computer.
          </li>
          <li>
            Apple lets an automation run when a message arrives, but iOS does not let an app
            secretly read every SMS. You choose the sender or senders in the automation.
          </li>
          <li>
            The shortcut sends the message text and sender to HardMoney. HardMoney parses the SMS
            after receiving it.
          </li>
        </ul>
      </div>

      {/* Step-by-step instructions */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Step-by-Step Instructions
        </h2>

        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 text-xs text-[var(--text)] shadow-xs">
          <div className="flex gap-3.5">
            <div className="w-8 h-8 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
              1
            </div>
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-sm block">Generate your Webhook API Key</span>
              <p className="text-[var(--text-muted)]">
                Go to{" "}
                <Link
                  href="/more/developer"
                  transitionTypes={["nav-forward"]}
                  className="text-[var(--accent)] font-semibold underline"
                >
                  More &gt; Developer &amp; API Keys
                </Link>{" "}
                and generate a Webhook API Key. Copy the key as it is only displayed once.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="w-8 h-8 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
              2
            </div>
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-sm block">Open the Automation screen</span>
              <p className="text-[var(--text-muted)]">
                Open the <strong>Shortcuts</strong> app on your iPhone, tap{" "}
                <strong>Automation</strong>, tap <strong>New Automation</strong> (or the{" "}
                <strong>+</strong> button), then choose <strong>Message</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="w-8 h-8 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
              3
            </div>
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-sm block">Select Message Trigger</span>
              <p className="text-[var(--text-muted)]">
                Under <strong>Sender</strong>, add the bank sender names exactly as they appear in
                your Messages app, e.g. <code>COMBANK</code> or <code>SAMPATH</code>. Choose{" "}
                <strong>Run Immediately</strong>, then tap <strong>Next</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="w-8 h-8 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
              4
            </div>
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-sm block">Forward Payload to Webhook</span>
              <p className="text-[var(--text-muted)]">
                Open the downloaded Shortcut, then update its <strong>Get Contents of URL</strong>{" "}
                action:
                <br />• <strong>URL:</strong>{" "}
                <code>https://your-domain.com/api/v1/webhooks/sms-ingress</code>
                <br />• <strong>Method:</strong> POST
                <br />• <strong>Headers:</strong> <code>x-api-key: [YOUR_API_KEY]</code>,{" "}
                <code>Content-Type: application/json</code>
                <br />• <strong>Request Body:</strong> JSON (<code>rawSms</code>,{" "}
                <code>sender</code>, <code>receivedAt</code>)
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Example Payload
        </h2>
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-3 text-xs text-[var(--text)] shadow-xs">
          <p className="leading-relaxed">
            Imagine your bank sends:{" "}
            <code>LKR 2,000.00 debited from AC **4681 for groceries</code>.
          </p>
          <pre className="overflow-x-auto rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-4 text-xs font-mono leading-relaxed">
{`{
  "rawSms": "LKR 2,000.00 debited from AC **4681 for groceries",
  "sender": "SAMPATH",
  "receivedAt": "2026-10-23T09:00:00.000Z"
}`}
          </pre>
          <p className="text-[var(--text-muted)] leading-relaxed">
            HardMoney stores the SMS, runs its deterministic template parser first, and only uses
            Gemini when the format is unrecognized.
          </p>
        </div>
      </section>

      {/* Privacy disclosure */}
      <div className="rounded-3xl p-5 flex items-start gap-3.5 bg-[var(--surface)] border border-[var(--border)] shadow-xs">
        <ShieldCheck size={20} className="text-[var(--income)] shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 leading-relaxed">
          <span className="font-bold text-[var(--text)] block">Privacy & Security Guarantee</span>
          <p className="text-[var(--text-muted)]">
            Raw SMS messages are processed strictly in memory and archived securely. Sensitive
            credentials and full card numbers are never printed to server logs.
          </p>
        </div>
      </div>
    </main>
  );
}

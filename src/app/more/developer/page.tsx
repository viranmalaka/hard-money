"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  Key,
  Save,
  Shield,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { parseBankSmsTemplate } from "@/lib/sms/template-parser";
import type { TemplateParseResult } from "@/lib/sms/types";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export default function DeveloperPage() {
  // Webhook Key state
  const [hasKey, setHasKey] = useState(false);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [justGeneratedKey, setJustGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Gemini Settings state
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [maskedGeminiKey, setMaskedGeminiKey] = useState<string | null>(null);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [smsAutoPostMode, setSmsAutoPostMode] = useState("AUTO_VALIDATED");
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiSavedNotice, setGeminiSavedNotice] = useState(false);
  const [smsTestSender, setSmsTestSender] = useState("");
  const [smsTestMessage, setSmsTestMessage] = useState("");
  const [smsTestApiKey, setSmsTestApiKey] = useState("");
  const [smsTestResult, setSmsTestResult] = useState<TemplateParseResult | null>(null);
  const [smsIngressResult, setSmsIngressResult] = useState<{ status: number; message: string } | null>(null);
  const [smsIngressSending, setSmsIngressSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [wRes, gRes] = await Promise.all([
          fetch("/api/user/webhook-key", { cache: "no-store" }),
          fetch("/api/user/gemini-settings", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (wRes.ok) {
          const wData = await wRes.json();
          setHasKey(wData.hasKey);
          setApiKeyPrefix(wData.apiKeyPrefix);
        }
        if (gRes.ok) {
          const gData = await gRes.json();
          setHasGeminiKey(gData.hasKey);
          setMaskedGeminiKey(gData.maskedKey);
          if (gData.geminiModel) setGeminiModel(gData.geminiModel);
          if (gData.smsAutoPostMode) setSmsAutoPostMode(gData.smsAutoPostMode);
        }
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateKey = async () => {
    try {
      const res = await fetch("/api/user/webhook-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setJustGeneratedKey(data.apiKey);
        setApiKeyPrefix(data.apiKeyPrefix);
        setHasKey(true);
      }
    } catch {
      // ignore
    }
  };

  const promptGenerateKey = () => {
    if (hasKey) {
      setShowRegenerateConfirm(true);
    } else {
      handleGenerateKey();
    }
  };

  const handleCopyKey = () => {
    if (justGeneratedKey) {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(justGeneratedKey);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveGeminiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiSaving(true);
    setGeminiSavedNotice(false);

    try {
      const payload: {
        geminiApiKey?: string;
        geminiModel?: string;
        smsAutoPostMode?: string;
      } = {
        geminiModel,
        smsAutoPostMode,
      };

      if (geminiApiKeyInput.trim().length > 0) {
        payload.geminiApiKey = geminiApiKeyInput.trim();
      }

      const res = await fetch("/api/user/gemini-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasKey);
        setMaskedGeminiKey(data.maskedKey);
        setGeminiApiKeyInput("");
        setGeminiSavedNotice(true);
      }
    } catch {
      // ignore
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleTestSms = (e: React.FormEvent) => {
    e.preventDefault();
    setSmsTestResult(parseBankSmsTemplate(smsTestSender, smsTestMessage));
  };

  const handleIngressSms = async () => {
    setSmsIngressSending(true);
    setSmsIngressResult(null);

    try {
      const response = await fetch("/api/v1/webhooks/sms-ingress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": smsTestApiKey.trim(),
        },
        body: JSON.stringify({
          rawSms: smsTestMessage,
          sender: smsTestSender.trim(),
          receivedAt: new Date().toISOString(),
        }),
      });
      const data = await response.json().catch(() => null);
      setSmsIngressResult({
        status: response.status,
        message: data?.message || data?.status || data?.error || "Ingress request completed",
      });
    } catch {
      setSmsIngressResult({
        status: 0,
        message: "Could not reach the SMS ingress endpoint",
      });
    } finally {
      setSmsIngressSending(false);
    }
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Developer & API Keys"
        subtitle="SMS Webhook Ingress & Gemini Parser"
        backHref="/more"
        backLabel="Back to More"
      />

      {/* Webhook API Key Card */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          SMS Webhook Ingress
        </h2>
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                <Key size={19} />
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-base font-bold text-[var(--text)] block">Webhook API Key</span>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Use this key in the <code className="font-mono text-[var(--text)]">x-api-key</code>{" "}
                  header to forward incoming SMS alerts to HardMoney.
                </p>
              </div>
            </div>

            <div className="shrink-0">
              {hasKey ? (
                <button
                  type="button"
                  data-testid="regenerate-webhook-key-btn"
                  onClick={promptGenerateKey}
                  className="h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-xs font-semibold text-[var(--text)] transition-colors cursor-pointer"
                >
                  Regenerate Key
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="generate-webhook-key-btn"
                  onClick={handleGenerateKey}
                  className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 transition-all shadow-xs cursor-pointer"
                >
                  Generate Webhook Key
                </button>
              )}
            </div>
          </div>

          {justGeneratedKey && (
            <div className="p-4 rounded-2xl bg-[var(--income)]/8 border border-[var(--income)]/30 space-y-2.5">
              <span className="text-xs font-bold text-[var(--income)] block">
                New Key Generated — Copy it now! It will not be shown again:
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <code
                  data-testid="webhook-key-display"
                  className="flex-1 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] font-mono text-xs text-[var(--text)] break-all select-all"
                >
                  {justGeneratedKey}
                </code>
                <button
                  type="button"
                  data-testid="copy-webhook-key-btn"
                  onClick={handleCopyKey}
                  className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all shrink-0 cursor-pointer"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? "Copied" : "Copy Key"}</span>
                </button>
              </div>
            </div>
          )}

          {hasKey && !justGeneratedKey && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)]">
              <span className="text-xs text-[var(--text-muted)]">Active Key:</span>
              <code
                data-testid="webhook-key-prefix"
                className="font-mono text-xs font-bold text-[var(--text)]"
              >
                {apiKeyPrefix}
              </code>
            </div>
          )}
        </div>
      </section>

      {/* AI & Gemini Parser Settings Card */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          AI & Gemini Parsing
        </h2>
        <form
          onSubmit={handleSaveGeminiSettings}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="gemini-key-input"
                className="text-sm font-bold text-[var(--text)] flex items-center gap-2"
              >
                <Sparkles size={16} className="text-[var(--accent)]" />
                <span>Google Gemini API Key</span>
              </label>
              {hasGeminiKey && maskedGeminiKey && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Saved Key:</span>
                  <code
                    data-testid="gemini-masked-key"
                    className="font-mono text-xs font-bold text-[var(--income)] bg-[var(--bg)] px-2.5 py-1 rounded-xl border border-[var(--border)]"
                  >
                    {maskedGeminiKey}
                  </code>
                </div>
              )}
            </div>

            <input
              id="gemini-key-input"
              data-testid="gemini-api-key-input"
              type="password"
              value={geminiApiKeyInput}
              onChange={(e) => setGeminiApiKeyInput(e.target.value)}
              placeholder={hasGeminiKey ? "Enter new key to replace existing..." : "AIzaSy..."}
              className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />

            {/* Privacy Disclosure */}
            <div
              data-testid="gemini-privacy-disclosure"
              className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text-muted)] leading-relaxed"
            >
              <Shield size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <span>
                SMS messages not matching standard templates are processed using Google Gemini.
                Account and card numbers longer than 4 digits are masked prior to submission for
                your privacy.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="gemini-model-select"
                className="block text-xs font-semibold text-[var(--text-muted)]"
              >
                Gemini Model
              </label>
              <select
                id="gemini-model-select"
                data-testid="gemini-model-select"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Fast & Recommended)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="sms-auto-post-mode"
                className="block text-xs font-semibold text-[var(--text-muted)]"
              >
                SMS Auto-Post Mode
              </label>
              <select
                id="sms-auto-post-mode"
                data-testid="sms-auto-post-mode"
                value={smsAutoPostMode}
                onChange={(e) => setSmsAutoPostMode(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="AUTO_VALIDATED">Auto-post High Confidence</option>
                <option value="ALWAYS_REVIEW_GEMINI" data-testid="mode-always-review">
                  Always Review Gemini Parses
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            {geminiSavedNotice ? (
              <span
                data-testid="gemini-settings-saved"
                className="text-xs font-semibold text-[var(--income)]"
              >
                Gemini settings saved successfully
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Keys are encrypted server-side before storage
              </span>
            )}

            <button
              type="submit"
              data-testid="save-gemini-key-btn"
              disabled={geminiSaving}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Save size={15} />
              <span>{geminiSaving ? "Saving..." : "Save Gemini Settings"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Integration Shortcuts Guide Card */}
      <Link
        href="/more/shortcuts"
        transitionTypes={["nav-forward"]}
        data-testid="shortcuts-guide-link"
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 flex items-center justify-between gap-4 hover:bg-[var(--surface-hover)] transition-colors group shadow-xs"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
            <Smartphone size={19} />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold text-[var(--text)] block">
              iOS Shortcuts & Automation
            </span>
            <span className="text-xs text-[var(--text-muted)] block mt-0.5">
              Forward bank SMS automatically using Apple Shortcuts
            </span>
          </div>
        </div>
        <span className="h-10 px-4 inline-flex items-center gap-1 text-xs font-semibold rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] shrink-0">
          View Guide <ChevronRight size={15} />
        </span>
      </Link>

      {/* SMS Template Tester */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          SMS Template Tester
        </h2>
        <form
          onSubmit={handleTestSms}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Test the standard bank SMS parser locally, or send the SMS through the real
            authenticated ingress endpoint.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="sms-test-api-key"
                className="block text-xs font-semibold text-[var(--text-muted)]"
              >
                Webhook API Key (for live ingress test)
              </label>
              <input
                id="sms-test-api-key"
                data-testid="sms-test-api-key-input"
                type="password"
                value={smsTestApiKey}
                onChange={(e) => setSmsTestApiKey(e.target.value)}
                placeholder="hm_live_..."
                autoComplete="off"
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="sms-test-sender"
                className="block text-xs font-semibold text-[var(--text-muted)]"
              >
                Sender
              </label>
              <input
                id="sms-test-sender"
                data-testid="sms-test-sender-input"
                type="text"
                value={smsTestSender}
                onChange={(e) => setSmsTestSender(e.target.value)}
                placeholder="e.g. COMBANK"
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sms-test-message"
              className="block text-xs font-semibold text-[var(--text-muted)]"
            >
              Message Content
            </label>
            <textarea
              id="sms-test-message"
              data-testid="sms-test-message-input"
              value={smsTestMessage}
              onChange={(e) => setSmsTestMessage(e.target.value)}
              placeholder="Paste the bank SMS message here..."
              rows={4}
              className="w-full p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm font-mono text-[var(--text)] resize-y focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
            <button
              type="submit"
              data-testid="sms-test-submit"
              disabled={!smsTestSender.trim() || !smsTestMessage.trim()}
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              Test SMS Locally
            </button>
            <button
              type="button"
              data-testid="sms-ingress-submit"
              onClick={handleIngressSms}
              disabled={
                smsIngressSending ||
                !smsTestApiKey.trim() ||
                !smsTestSender.trim() ||
                !smsTestMessage.trim()
              }
              className="h-11 px-5 rounded-2xl bg-[var(--income)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              {smsIngressSending ? "Sending..." : "Send to Ingress"}
            </button>
          </div>

          {smsIngressResult && (
            <div
              data-testid="sms-ingress-result"
              className={`p-3.5 rounded-2xl border text-xs font-medium ${
                smsIngressResult.status >= 200 && smsIngressResult.status < 300
                  ? "bg-[var(--income)]/10 border-[var(--income)]/30 text-[var(--income)]"
                  : "bg-[var(--expense)]/10 border-[var(--expense)]/30 text-[var(--expense)]"
              }`}
            >
              Ingress response ({smsIngressResult.status || "network error"}):{" "}
              {smsIngressResult.message}
            </div>
          )}

          {smsTestResult && (
            <div
              data-testid="sms-test-result"
              className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text)]">Parser Result</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-2xs font-bold ${
                    smsTestResult.matched
                      ? "bg-[var(--income)]/12 text-[var(--income)]"
                      : "bg-[var(--surface)] text-[var(--text-muted)]"
                  }`}
                >
                  {smsTestResult.matched ? "MATCHED" : "NO MATCH"}
                </span>
              </div>

              {smsTestResult.payload ? (
                <pre className="overflow-x-auto rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3 text-xs font-mono leading-relaxed text-[var(--text)]">
                  {JSON.stringify(
                    { bank: smsTestResult.bank, ...smsTestResult.payload },
                    null,
                    2
                  )}
                </pre>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  No known bank template matched this sender and message.
                </p>
              )}
            </div>
          )}
        </form>
      </section>

      <ConfirmationModal
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        onConfirm={handleGenerateKey}
        title="Regenerate Webhook Key"
        message="Generating a new webhook key will immediately invalidate your previous key. Any Apple Shortcuts, scripts, or automated webhooks using the old key will stop working until updated."
        confirmText="Regenerate Key"
        variant="warning"
      />
    </main>
  );
}

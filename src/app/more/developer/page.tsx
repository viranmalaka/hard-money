"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Key,
  Save,
  Shield,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { parseBankSmsTemplate } from "@/lib/sms/template-parser";
import type { TemplateParseResult } from "@/lib/sms/types";

export default function DeveloperPage() {
  // Webhook Key state
  const [hasKey, setHasKey] = useState(false);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [justGeneratedKey, setJustGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Link
            href="/more" transitionTypes={["nav-back"]}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
              Developer & API Integrations
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Manage webhook ingress keys, Google Gemini parsing and automated workflows
            </p>
          </div>
        </div>
      </div>

      {/* Webhook API Key Card */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          SMS Webhook Ingress
        </span>
        <div className="flat-card p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Key size={15} className="text-[var(--accent)]" />
                <span className="text-xs font-semibold text-[var(--text)]">Webhook API Key</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Use this key in the <code>x-api-key</code> header to forward incoming SMS alerts to HardMoney.
              </p>
            </div>

            <div>
              {hasKey ? (
                <button
                  type="button"
                  data-testid="regenerate-webhook-key-btn"
                  onClick={handleGenerateKey}
                  className="px-3 py-1.5 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text)] transition-colors"
                >
                  Regenerate Key
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="generate-webhook-key-btn"
                  onClick={handleGenerateKey}
                  className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
                >
                  Generate Webhook Key
                </button>
              )}
            </div>
          </div>

          {/* When newly generated, display full key once with copy button */}
          {justGeneratedKey && (
            <div className="p-3 rounded bg-[var(--surface-hover)] border border-[var(--income)]/30 space-y-2">
              <span className="text-[11px] font-semibold text-[var(--income)] block">
                New Key Generated — Copy it now! It will not be shown again:
              </span>
              <div className="flex items-center gap-2">
                <code
                  data-testid="webhook-key-display"
                  className="flex-1 p-2 rounded bg-[var(--bg)] border border-hairline font-mono text-xs text-[var(--text)] break-all select-all"
                >
                  {justGeneratedKey}
                </code>
                <button
                  type="button"
                  data-testid="copy-webhook-key-btn"
                  onClick={handleCopyKey}
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy Key"}</span>
                </button>
              </div>
            </div>
          )}

          {/* When key exists and not newly generated in this view, display prefix */}
          {hasKey && !justGeneratedKey && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-[var(--surface-hover)]/40 border border-hairline">
              <span className="text-[11px] text-[var(--text-muted)]">Active Key:</span>
              <code
                data-testid="webhook-key-prefix"
                className="font-mono text-xs font-semibold text-[var(--text)]"
              >
                {apiKeyPrefix}
              </code>
            </div>
          )}
        </div>
      </div>

      {/* AI & Gemini Parser Settings Card */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          AI & Gemini Parsing
        </span>
        <form onSubmit={handleSaveGeminiSettings} className="flat-card p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="gemini-key-input"
                className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5"
              >
                <Sparkles size={14} className="text-[var(--accent)]" />
                <span>Google Gemini API Key</span>
              </label>
              {hasGeminiKey && maskedGeminiKey && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-muted)]">Saved Key:</span>
                  <code
                    data-testid="gemini-masked-key"
                    className="font-mono text-xs font-semibold text-[var(--income)] bg-[var(--surface-hover)] px-2 py-0.5 rounded border border-hairline"
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
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />

            {/* Privacy Disclosure */}
            <div
              data-testid="gemini-privacy-disclosure"
              className="flex items-start gap-2 p-2.5 rounded bg-[var(--surface-hover)]/40 border border-hairline text-[11px] text-[var(--text-muted)] leading-relaxed"
            >
              <Shield size={14} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
              <span>
                SMS messages not matching standard templates are processed using Google Gemini. Account and card numbers longer than 4 digits are masked prior to submission for your privacy.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label
                htmlFor="gemini-model-select"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                Gemini Model
              </label>
              <select
                id="gemini-model-select"
                data-testid="gemini-model-select"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Fast & Recommended)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="sms-auto-post-mode"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                SMS Auto-Post Mode
              </label>
              <select
                id="sms-auto-post-mode"
                data-testid="sms-auto-post-mode"
                value={smsAutoPostMode}
                onChange={(e) => setSmsAutoPostMode(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="AUTO_VALIDATED">Auto-post High Confidence</option>
                <option value="ALWAYS_REVIEW_GEMINI" data-testid="mode-always-review">
                  Always Review Gemini Parses
                </option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {geminiSavedNotice ? (
              <span
                data-testid="gemini-settings-saved"
                className="text-xs font-semibold text-[var(--income)]"
              >
                Gemini settings saved successfully
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              data-testid="save-gemini-key-btn"
              disabled={geminiSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save size={14} />
              <span>{geminiSaving ? "Saving..." : "Save Gemini Settings"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Integration Shortcuts Guide Card */}
      <div className="flat-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] border border-hairline flex items-center justify-center text-[var(--accent)]">
            <Smartphone size={16} />
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--text)] block">
              iOS Shortcuts & Automation
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Forward bank SMS automatically using Apple Shortcuts
            </span>
          </div>
        </div>
        <Link
          href="/more/shortcuts" transitionTypes={["nav-forward"]}
          data-testid="shortcuts-guide-link"
          className="px-3 py-1.5 text-xs font-medium rounded border border-hairline hover:bg-surface text-[var(--text)] transition-colors"
        >
          View Guide
        </Link>
      </div>

      {/* SMS Template Tester */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          SMS Template Tester
        </span>
        <form onSubmit={handleTestSms} className="flat-card p-4 space-y-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Test the standard bank SMS parser locally, or send the SMS through the real authenticated ingress endpoint.
          </p>

          <div className="space-y-1">
            <label
              htmlFor="sms-test-api-key"
              className="block text-xs font-medium text-[var(--text-muted)]"
            >
              Webhook API key
            </label>
            <input
              id="sms-test-api-key"
              data-testid="sms-test-api-key-input"
              type="password"
              value={smsTestApiKey}
              onChange={(e) => setSmsTestApiKey(e.target.value)}
              placeholder="hm_live_..."
              autoComplete="off"
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-muted)]">
              Used only for this request as the <code>x-api-key</code> header and never saved or decrypted.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="sms-test-sender"
              className="block text-xs font-medium text-[var(--text-muted)]"
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
              className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="sms-test-message"
              className="block text-xs font-medium text-[var(--text-muted)]"
            >
              Message content
            </label>
            <textarea
              id="sms-test-message"
              data-testid="sms-test-message-input"
              value={smsTestMessage}
              onChange={(e) => setSmsTestMessage(e.target.value)}
              placeholder="Paste the bank SMS message here..."
              rows={5}
              className="w-full px-2.5 py-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] resize-y focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="submit"
              data-testid="sms-test-submit"
              disabled={!smsTestSender.trim() || !smsTestMessage.trim()}
              className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              Test SMS
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
              className="px-3 py-1.5 rounded bg-[var(--income)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {smsIngressSending ? "Sending..." : "Send to Ingress"}
            </button>
          </div>

          {smsIngressResult && (
            <div
              data-testid="sms-ingress-result"
              className={`p-3 rounded border text-[11px] ${
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
              className="p-3 rounded bg-[var(--surface-hover)]/40 border border-hairline space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text)]">Parser result</span>
                <span
                  className={`text-[10px] font-semibold ${
                    smsTestResult.matched
                      ? "text-[var(--income)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {smsTestResult.matched ? "MATCHED" : "NO MATCH"}
                </span>
              </div>

              {smsTestResult.payload ? (
                <pre className="overflow-x-auto rounded bg-[var(--bg)] border border-hairline p-2 text-[11px] leading-relaxed text-[var(--text)]">
                  {JSON.stringify(
                    { bank: smsTestResult.bank, ...smsTestResult.payload },
                    null,
                    2
                  )}
                </pre>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">
                  No known bank template matched this sender and message.
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

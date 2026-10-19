"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Database,
  FileText,
  Inbox,
  Key,
  LogOut,
  Moon,
  Paintbrush,
  Save,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  User,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  defaultCurrency: string;
}

export default function MorePage() {
  const router = useRouter();
  const { resolvedTheme, toggleTheme, colorSwap, toggleColorSwap } = useTheme();
  const mounted = useMounted();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Colombo");
  const [currency, setCurrency] = useState("LKR");
  const [whtRate, setWhtRate] = useState("0.0");
  const isWhtDirtyRef = useRef(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Push Reminders state
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderStatusNotice, setReminderStatusNotice] = useState("");
  const [isIosDevice, setIsIosDevice] = useState(false);
  const isPushDirtyRef = useRef(false);

  // Inbox count
  const [inboxCount, setInboxCount] = useState(0);

  const fetchPushSettings = async () => {
    try {
      const res = await fetch("/api/push/settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (!isPushDirtyRef.current) {
          setRemindersEnabled(!!data.enabled);
          if (data.reminderTime) setReminderTime(data.reminderTime);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchWebhookKey = async () => {
    try {
      const res = await fetch("/api/user/webhook-key", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHasKey(data.hasKey);
        setApiKeyPrefix(data.apiKeyPrefix);
      }
    } catch {
      // ignore
    }
  };

  const fetchGeminiSettings = async () => {
    try {
      const res = await fetch("/api/user/gemini-settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasKey);
        setMaskedGeminiKey(data.maskedKey);
        if (data.geminiModel) setGeminiModel(data.geminiModel);
        if (data.smsAutoPostMode) setSmsAutoPostMode(data.smsAutoPostMode);
      }
    } catch {
      // ignore
    }
  };

  const fetchInboxCount = async () => {
    try {
      const res = await fetch("/api/sms/inbox", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setInboxCount(data.count ?? (data.items?.length || 0));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isIos =
        /iPhone|iPad|iPod/.test(navigator.userAgent) &&
        !(window as any).navigator?.standalone &&
        !window.matchMedia?.("(display-mode: standalone)").matches;
      setIsIosDevice(isIos);
    }
  }, []);

  useEffect(() => {
    fetch("/api/user/settings", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setName(data.user.name || "");
          setTimezone(data.user.timezone || "Asia/Colombo");
          setCurrency(data.user.defaultCurrency || "LKR");
          if (!isWhtDirtyRef.current && data.user.defaultWithholdingTaxRateBps !== undefined) {
            setWhtRate(((data.user.defaultWithholdingTaxRateBps || 0) / 100).toFixed(1));
          }
        }
      })
      .catch(() => {});

    fetchWebhookKey();
    fetchGeminiSettings();
    fetchInboxCount();
    fetchPushSettings();
  }, []);

  const handleSaveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    setReminderSaving(true);
    setReminderStatusNotice("");

    try {
      if (remindersEnabled) {
        if (typeof window !== "undefined" && "Notification" in window) {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            setReminderStatusNotice("Notification permission not granted");
            setReminderSaving(false);
            return;
          }
        }

        const subData = {
          endpoint: `https://fcm.googleapis.com/fcm/send/test-${Math.random().toString(36).slice(2, 9)}`,
          keys: {
            p256dh: "BMo9aW7-test-p256dh-key-mock",
            auth: "mockAuthKey123",
          },
        };

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subData),
        });
      } else {
        await fetch("/api/push/unsubscribe", { method: "POST" });
      }

      const res = await fetch("/api/push/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: remindersEnabled,
          reminderTime,
        }),
      });

      if (res.ok) {
        setReminderStatusNotice(remindersEnabled ? "Reminders active" : "Reminders disabled");
      }
    } catch {
      setReminderStatusNotice("Failed to save push settings");
    } finally {
      setReminderSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("hardmoney_active_user");
    }
    router.push("/login");
  };

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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);

    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          timezone: timezone.trim(),
          defaultCurrency: currency.trim().toUpperCase(),
          defaultWithholdingTaxRateBps: Math.round(parseFloat(whtRate || "0") * 100),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          setName(data.user.name);
          setTimezone(data.user.timezone);
          setCurrency(data.user.defaultCurrency);
          if (data.user.defaultWithholdingTaxRateBps !== undefined) {
            setWhtRate(((data.user.defaultWithholdingTaxRateBps || 0) / 100).toFixed(1));
          }
        }
        setSavedNotice(true);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
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

  const menuSections = [
    {
      title: "Organization",
      items: [
        { label: "Bookmarks & Templates", icon: Bookmark, badge: null, href: "/more/bookmarks", testId: "more-bookmarks-link" },
        { label: "Categories", icon: Paintbrush, badge: null, href: "/more/categories", testId: "more-categories-link" },
      ],
    },
    {
      title: "Automation & Data",
      items: [
        {
          label: "SMS Review Inbox",
          icon: Inbox,
          badge: inboxCount > 0 ? String(inboxCount) : null,
          badgeTestId: "inbox-badge",
          href: "/more/inbox",
          testId: "more-sms-inbox-link",
        },
        { label: "Bank SMS Activity", icon: FileText, badge: null, href: "/more/sms-activity", testId: "more-sms-activity-link" },
        { label: "Apple Shortcuts Setup Guide", icon: Smartphone, badge: null, href: "/more/shortcuts", testId: "shortcuts-guide-link" },
        { label: "Export & Import", icon: Database, badge: null, href: null, testId: null },
        { label: "Household Collaboration", icon: Users, badge: null, href: "/more/household", testId: "more-household-link" },
      ],
    },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      <div className="flex items-center justify-between py-1">
        <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
          More
        </h1>
      </div>

      {/* User Account / Profile Card */}
      <div className="flat-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-hover)] border border-hairline flex items-center justify-center text-[var(--text)] font-semibold text-sm">
            {user?.name ? user.name.charAt(0).toUpperCase() : <User size={18} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                data-testid="user-display-name"
                className="text-sm font-semibold text-[var(--text)]"
              >
                {user?.name || "User"}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {user?.email || "treasury-admin@local"}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="logout-button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--expense)] border border-hairline rounded hover:bg-[var(--expense)]/10 transition-colors"
        >
          <LogOut size={14} />
          <span>Log Out</span>
        </button>
      </div>

      {/* User Settings Form */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          User Settings
        </span>
        <form onSubmit={handleSaveSettings} className="flat-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="settings-name"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                Display Name
              </label>
              <input
                id="settings-name"
                data-testid="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="settings-timezone"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                Timezone
              </label>
              <input
                id="settings-timezone"
                data-testid="settings-timezone"
                type="text"
                list="timezones-list"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
              <datalist id="timezones-list">
                <option value="Asia/Colombo" />
                <option value="America/New_York" />
                <option value="America/Los_Angeles" />
                <option value="America/Chicago" />
                <option value="Europe/London" />
                <option value="Europe/Paris" />
                <option value="Asia/Singapore" />
                <option value="Asia/Tokyo" />
                <option value="UTC" />
              </datalist>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="settings-currency"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                Default Currency
              </label>
              <input
                id="settings-currency"
                data-testid="settings-currency"
                type="text"
                list="currencies-list"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] uppercase focus:outline-none focus:border-[var(--accent)]"
              />
              <datalist id="currencies-list">
                <option value="LKR" />
                <option value="USD" />
                <option value="EUR" />
                <option value="GBP" />
                <option value="AUD" />
                <option value="CAD" />
                <option value="JPY" />
                <option value="SGD" />
              </datalist>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="settings-wht-rate"
                className="block text-xs font-medium text-[var(--text-muted)]"
              >
                Default WHT (%)
              </label>
              <input
                id="settings-wht-rate"
                data-testid="settings-wht-rate"
                type="number"
                step="0.1"
                min="0"
                value={whtRate}
                onFocus={() => {
                  isWhtDirtyRef.current = true;
                }}
                onInput={() => {
                  isWhtDirtyRef.current = true;
                }}
                onChange={(e) => {
                  isWhtDirtyRef.current = true;
                  setWhtRate(e.target.value);
                }}
                className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {savedNotice ? (
              <span
                data-testid="settings-saved"
                className="text-xs font-semibold text-[var(--income)]"
              >
                Settings saved successfully
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              data-testid="settings-save"
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        </form>
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
                  className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-all"
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

      {/* Notifications & Daily Reminders */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Notifications & Reminders
        </span>
        <form onSubmit={handleSaveReminders} className="flat-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-[var(--text)] block">
                Daily Spending Reminders
              </span>
              <p className="text-[11px] text-[var(--text-muted)]">
                Receive a push reminder notification to review and log daily expenses.
              </p>
            </div>
            <label
              data-testid="toggle-reminders-label"
              className="relative inline-flex items-center cursor-pointer"
            >
              <input
                type="checkbox"
                data-testid="toggle-reminders"
                checked={remindersEnabled}
                onChange={(e) => {
                  isPushDirtyRef.current = true;
                  setRemindersEnabled(e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)]" />
            </label>
          </div>

          {remindersEnabled && (
            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              <label
                htmlFor="reminder-time-input"
                className="text-xs font-medium text-[var(--text-muted)]"
              >
                Reminder Time
              </label>
              <input
                id="reminder-time-input"
                type="time"
                data-testid="reminder-time-input"
                value={reminderTime}
                onChange={(e) => {
                  isPushDirtyRef.current = true;
                  setReminderTime(e.target.value);
                }}
                className="h-8 px-2.5 rounded bg-[var(--surface)] border border-hairline text-xs font-medium text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            {reminderStatusNotice ? (
              <span data-testid="reminder-status" className="text-xs font-medium text-[var(--income)]">
                {reminderStatusNotice}
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              data-testid="save-reminders-btn"
              disabled={reminderSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save size={14} />
              <span>{reminderSaving ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* iOS Install Note (Shown on iPhone/iPad WebKit when not in standalone mode) */}
      {isIosDevice && (
        <div
          data-testid="ios-install-note"
          className="flat-card p-4 space-y-2 bg-[var(--surface)] border-l-4 border-l-[var(--accent)]"
        >
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text)]">Install on iPhone / iPad</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            To install Hard Money as a native app and enable web push notifications on iOS: Tap the <strong>Share</strong> button at the bottom of Safari, scroll down, and tap <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}

      {/* Preferences Section: Theme & Color Swap */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Preferences
        </span>
        <div className="flat-card divide-y divide-hairline">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              {mounted && resolvedTheme === "dark" ? (
                <Sun size={18} className="text-amber-400" />
              ) : (
                <Moon size={18} className="text-[var(--text-muted)]" />
              )}
              <span className="text-sm font-medium text-[var(--text)]">Appearance</span>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-2.5 py-1 text-xs rounded border border-hairline font-medium hover:bg-surface text-[var(--text)]"
            >
              {mounted && resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
            </button>
          </div>

          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border border-hairline flex overflow-hidden">
                <span className="w-1/2 bg-[var(--income)]" />
                <span className="w-1/2 bg-[var(--expense)]" />
              </span>
              <div>
                <span className="text-sm font-medium text-[var(--text)] block">
                  Income / Expense Colors
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {colorSwap
                    ? "Swapped (Red = income, Blue = expense)"
                    : "Default (Blue = income, Red = expense)"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleColorSwap}
              className="px-2.5 py-1 text-xs rounded border border-hairline font-medium hover:bg-surface text-[var(--text)]"
            >
              {colorSwap ? "Reset to Default" : "Swap Colors"}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
            {section.title}
          </span>
          <div className="flat-card divide-y divide-hairline">
            {section.items.map((item) => {
              const Icon = item.icon;
              const content = (
                <div
                  data-testid={item.testId || undefined}
                  className="flex items-center justify-between p-3 hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className="text-[var(--text-muted)]" />
                    <span className="text-sm font-medium text-[var(--text)]">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span
                        data-testid={(item as any).badgeTestId || undefined}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent)] text-white border border-hairline"
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-[var(--text-muted)]" />
                  </div>
                </div>
              );

              if (item.href) {
                return (
                  <Link key={item.label} href={item.href} className="block">
                    {content}
                  </Link>
                );
              }
              return <React.Fragment key={item.label}>{content}</React.Fragment>;
            })}
          </div>
        </div>
      ))}

      {/* Empty State requirement */}
      <EmptyState
        title="Settings & Tools"
        description="All system configurations, backup tools, and household settings are available here."
      />
    </main>
  );
}

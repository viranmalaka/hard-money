"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Moon,
  Save,
  Smartphone,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";
import { queryKeys } from "@/lib/api/query-keys";
import { getSettings, updateSettings } from "@/services/user-service";
import { getPushSettings, savePushSettings, subscribePush, unsubscribePush } from "@/services/push-service";

export default function PreferencesPage() {
  const { resolvedTheme, toggleTheme, colorSwap, toggleColorSwap } = useTheme();
  const mounted = useMounted();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Colombo");
  const [currency, setCurrency] = useState("LKR");
  const [whtRate, setWhtRate] = useState("0.0");
  const isNameDirtyRef = useRef(false);
  const isTimezoneDirtyRef = useRef(false);
  const isCurrencyDirtyRef = useRef(false);
  const isWhtDirtyRef = useRef(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Push Reminders state
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderStatusNotice, setReminderStatusNotice] = useState("");
  const [isIosDevice, setIsIosDevice] = useState(false);
  const isPushDirtyRef = useRef(false);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: queryKeys.settings.user(), queryFn: getSettings });
  const pushQuery = useQuery({ queryKey: queryKeys.settings.push(), queryFn: getPushSettings });
  const saveSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.settings.user(), data);
    },
  });
  const savePushMutation = useMutation({
    mutationFn: async (input: { enabled: boolean; reminderTime: string; subscription?: Record<string, unknown> }) => {
      if (input.enabled && input.subscription) await subscribePush(input.subscription);
      if (!input.enabled) await unsubscribePush();
      return savePushSettings({ enabled: input.enabled, reminderTime: input.reminderTime });
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.settings.push(), data),
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const nav = window.navigator as unknown as { standalone?: boolean };
      const isIos =
        /iPhone|iPad|iPod/.test(navigator.userAgent) &&
        !nav?.standalone &&
        !window.matchMedia?.("(display-mode: standalone)").matches;
      queueMicrotask(() => {
        setIsIosDevice(isIos);
      });
    }
  }, []);

  useEffect(() => {
    const user = settingsQuery.data?.user;
    queueMicrotask(() => {
      if (user) {
        if (!isNameDirtyRef.current) setName(user.name || "");
        if (!isTimezoneDirtyRef.current) setTimezone(user.timezone || "Asia/Colombo");
        if (!isCurrencyDirtyRef.current) setCurrency(user.defaultCurrency || "LKR");
        if (!isWhtDirtyRef.current && user.defaultWithholdingTaxRateBps !== undefined) {
          setWhtRate(((user.defaultWithholdingTaxRateBps || 0) / 100).toFixed(1));
        }
      }
      if (pushQuery.data && !isPushDirtyRef.current) {
        setRemindersEnabled(!!pushQuery.data.enabled);
        if (pushQuery.data.reminderTime) setReminderTime(pushQuery.data.reminderTime);
      }
    });
  }, [pushQuery.data, settingsQuery.data]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);

    try {
      const data = await saveSettingsMutation.mutateAsync({
          name: name.trim(),
          timezone: timezone.trim(),
          defaultCurrency: currency.trim().toUpperCase(),
          defaultWithholdingTaxRateBps: Math.round(parseFloat(whtRate || "0") * 100),
      });

      isNameDirtyRef.current = false;
      isTimezoneDirtyRef.current = false;
      isCurrencyDirtyRef.current = false;
      isWhtDirtyRef.current = false;
      if (data?.user) {
        setName(data.user.name);
        setTimezone(data.user.timezone);
        setCurrency(data.user.defaultCurrency);
        if (data.user.defaultWithholdingTaxRateBps !== undefined) {
          setWhtRate(((data.user.defaultWithholdingTaxRateBps || 0) / 100).toFixed(1));
        }
      }
      setSavedNotice(true);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    setReminderSaving(true);
    setReminderStatusNotice("");

    try {
      let subscription: Record<string, unknown> | undefined;
      if (remindersEnabled) {
        if (typeof window !== "undefined" && "Notification" in window) {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            setReminderStatusNotice("Notification permission not granted");
            setReminderSaving(false);
            return;
          }
        }

        subscription = {
          endpoint: `https://fcm.googleapis.com/fcm/send/test-${Math.random().toString(36).slice(2, 9)}`,
          keys: {
            p256dh: "BMo9aW7-test-p256dh-key-mock",
            auth: "mockAuthKey123",
          },
        };

      }

      await savePushMutation.mutateAsync({ enabled: remindersEnabled, reminderTime, subscription });
      setReminderStatusNotice(remindersEnabled ? "Reminders active" : "Reminders disabled");
    } catch {
      setReminderStatusNotice("Failed to save push settings");
    } finally {
      setReminderSaving(false);
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
              Preferences & Profile
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Customize appearance, currency, tax rates and daily reminders
            </p>
          </div>
        </div>
      </div>

      {/* User Profile Form */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Profile & Defaults
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
                onFocus={() => {
                  isNameDirtyRef.current = true;
                }}
                onChange={(e) => {
                  isNameDirtyRef.current = true;
                  setName(e.target.value);
                }}
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
                onFocus={() => {
                  isTimezoneDirtyRef.current = true;
                }}
                onChange={(e) => {
                  isTimezoneDirtyRef.current = true;
                  setTimezone(e.target.value);
                }}
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
                onFocus={() => {
                  isCurrencyDirtyRef.current = true;
                }}
                onChange={(e) => {
                  isCurrencyDirtyRef.current = true;
                  setCurrency(e.target.value.toUpperCase());
                }}
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

      {/* Preferences Section: Theme & Color Swap */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Appearance
        </span>
        <div className="flat-card divide-y divide-hairline">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              {mounted && resolvedTheme === "dark" ? (
                <Sun size={18} className="text-amber-400" />
              ) : (
                <Moon size={18} className="text-[var(--text-muted)]" />
              )}
              <span className="text-sm font-medium text-[var(--text)]">Theme Mode</span>
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
    </main>
  );
}

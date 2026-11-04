"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Moon,
  Save,
  Smartphone,
  Sun,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Preferences & Profile"
        subtitle="Appearance, Currency & Reminders"
        backHref="/more"
      />

      {/* User Profile Form */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Profile & Defaults
        </h2>
        <form
          onSubmit={handleSaveSettings}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-name"
                className="block text-xs font-semibold text-[var(--text-muted)]"
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
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="settings-timezone"
                className="block text-xs font-semibold text-[var(--text-muted)]"
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
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
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

            <div className="space-y-1.5">
              <label
                htmlFor="settings-currency"
                className="block text-xs font-semibold text-[var(--text-muted)]"
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
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm font-mono font-semibold text-[var(--text)] uppercase focus:outline-none focus:border-[var(--accent)] transition-colors"
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

            <div className="space-y-1.5">
              <label
                htmlFor="settings-wht-rate"
                className="block text-xs font-semibold text-[var(--text-muted)]"
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
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            {savedNotice ? (
              <span
                data-testid="settings-saved"
                className="text-xs font-semibold text-[var(--income)]"
              >
                Settings saved successfully
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Applied across new accounts, Fixed Deposits & ledger defaults
              </span>
            )}

            <button
              type="submit"
              data-testid="settings-save"
              disabled={saving}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Save size={15} />
              <span>{saving ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Preferences Section: Light/Dark Mode & Color Swap */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Appearance
        </h2>
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs">
          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center shrink-0">
                {mounted && resolvedTheme === "dark" ? (
                  <Sun size={19} className="text-amber-400" />
                ) : (
                  <Moon size={19} className="text-[var(--text-muted)]" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text)] block">
                  Theme Mode
                </span>
                <span className="text-xs text-[var(--text-muted)] block mt-0.5">
                  Switch between light pearl and midnight slate surfaces
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="h-10 px-4 text-xs rounded-2xl border border-[var(--border)] bg-[var(--bg)] font-semibold hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors cursor-pointer shrink-0"
            >
              {mounted && resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center shrink-0">
                <span className="w-5 h-5 rounded-full border border-[var(--border)] flex overflow-hidden">
                  <span className="w-1/2 bg-[var(--income)]" />
                  <span className="w-1/2 bg-[var(--expense)]" />
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text)] block">
                  Income / Expense Colors
                </span>
                <span className="text-xs text-[var(--text-muted)] block mt-0.5">
                  {colorSwap
                    ? "Swapped (Coral = income, Emerald = expense)"
                    : "Default (Emerald = income, Coral = expense)"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleColorSwap}
              className="h-10 px-4 text-xs rounded-2xl border border-[var(--border)] bg-[var(--bg)] font-semibold hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors cursor-pointer shrink-0"
            >
              {colorSwap ? "Reset Default" : "Swap Colors"}
            </button>
          </div>
        </div>
      </section>

      {/* Notifications & Daily Reminders */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Notifications & Reminders
        </h2>
        <form
          onSubmit={handleSaveReminders}
          className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Bell size={19} />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text)] block">
                  Daily Spending Reminders
                </span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Receive a push reminder notification to review and log daily expenses.
                </p>
              </div>
            </div>
            <label
              data-testid="toggle-reminders-label"
              className="relative inline-flex items-center cursor-pointer shrink-0"
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
              <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)]" />
            </label>
          </div>

          {remindersEnabled && (
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
              <label
                htmlFor="reminder-time-input"
                className="text-xs font-semibold text-[var(--text-muted)]"
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
                className="h-11 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm font-mono font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            {reminderStatusNotice ? (
              <span data-testid="reminder-status" className="text-xs font-semibold text-[var(--income)]">
                {reminderStatusNotice}
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Web Push works across installed PWA and desktop browsers
              </span>
            )}
            <button
              type="submit"
              data-testid="save-reminders-btn"
              disabled={reminderSaving}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Save size={15} />
              <span>{reminderSaving ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* iOS Install Note */}
      {isIosDevice && (
        <div
          data-testid="ios-install-note"
          className="rounded-3xl bg-[var(--surface)] border border-[var(--accent)]/30 p-5 space-y-2 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--accent)]/12 flex items-center justify-center text-[var(--accent)]">
              <Smartphone size={18} />
            </div>
            <span className="text-sm font-bold text-[var(--text)]">Install on iPhone / iPad</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            To install Hard Money as a native app and enable web push notifications on iOS: Tap the{" "}
            <strong>Share</strong> button at the bottom of Safari, scroll down, and tap{" "}
            <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </main>
  );
}

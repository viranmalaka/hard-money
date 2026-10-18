"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bookmark,
  ChevronRight,
  Database,
  Inbox,
  LogOut,
  Moon,
  Paintbrush,
  Save,
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
  const [savedNotice, setSavedNotice] = useState(false);
  const [saving, setSaving] = useState(false);

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
        }
      })
      .catch(() => {});
  }, []);

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
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          setName(data.user.name);
          setTimezone(data.user.timezone);
          setCurrency(data.user.defaultCurrency);
        }
        setSavedNotice(true);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
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
        { label: "SMS Review Inbox", icon: Inbox, badge: "0", href: null, testId: null },
        { label: "Export & Import", icon: Database, badge: null, href: null, testId: null },
        { label: "Household Collaboration", icon: Users, badge: null, href: null, testId: null },
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface border border-hairline text-[var(--text-muted)]">
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

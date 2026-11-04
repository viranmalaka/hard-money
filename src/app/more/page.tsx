"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bookmark,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Inbox,
  LogOut,
  LoaderCircle,
  Paintbrush,
  PieChart,
  Sliders,
  Smartphone,
  User,
  Users,
  ShoppingBasket,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { queryKeys } from "@/lib/api/query-keys";
import { logout } from "@/services/auth-service";
import { getSettings } from "@/services/user-service";
import { listInbox } from "@/services/inbox-service";
import { getShoppingListCount } from "@/services/shopping-list-service";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

interface MenuItem {
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href: string;
  testId: string;
  badge: string | null;
  badgeTestId?: string;
  highlight?: boolean;
}

export default function MorePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const settingsQuery = useQuery({ queryKey: queryKeys.settings.user(), queryFn: getSettings });
  const inboxQuery = useQuery({ queryKey: queryKeys.inbox.all(), queryFn: listInbox });
  const shoppingCountQuery = useQuery({
    queryKey: queryKeys.shoppingList.count(),
    queryFn: getShoppingListCount,
  });
  const user: UserProfile | null = settingsQuery.data?.user ?? null;
  const inboxCount = inboxQuery.data?.length ?? 0;
  const shoppingListCount = shoppingCountQuery.data?.count ?? 0;
  const userLoading = settingsQuery.isLoading;
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      localStorage.removeItem("hardmoney_active_user");
      router.push("/login");
    },
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: "Planning & Budgets",
      items: [
        {
          label: "Monthly Budgets",
          description: "Spending limits, safe-to-spend burn rate & monthly rollover",
          icon: PieChart,
          href: "/budget",
          testId: "more-budget-link",
          badge: null,
          highlight: true,
        },
      ],
    },
    {
      title: "Household & Collaboration",
      items: [
        {
          label: "Household Collaboration",
          description: "Joint treasury, partner ledger sync & permissions",
          icon: Users,
          href: "/more/household",
          testId: "more-household-link",
          badge: null,
        },
        {
          label: "Shopping List",
          description: "Shared household items to buy",
          icon: ShoppingBasket,
          href: "/more/shopping-list",
          testId: "more-shopping-list-link",
          badge: shoppingListCount > 0 ? String(shoppingListCount) : null,
          badgeTestId: "shopping-list-badge",
        },
      ],
    },
    {
      title: "General & Customization",
      items: [
        {
          label: "Preferences & Profile",
          description: "Appearance, currency, tax rates & daily reminders",
          icon: Sliders,
          href: "/more/preferences",
          testId: "more-preferences-link",
          badge: null,
        },
        {
          label: "Transaction Categories",
          description: "Manage dynamic categories & Lucide icons",
          icon: Paintbrush,
          href: "/more/categories",
          testId: "more-categories-link",
          badge: null,
        },
        {
          label: "Bookmarks & Templates",
          description: "Quick transaction shortcuts & recurring forms",
          icon: Bookmark,
          href: "/more/bookmarks",
          testId: "more-bookmarks-link",
          badge: null,
        },
        {
          label: "Data & Backup",
          description: "Export JSON archive & restore treasury database",
          icon: Database,
          href: "/more/backup",
          testId: "more-backup-link",
          badge: null,
        },
      ],
    },
    {
      title: "Developer & Automation",
      items: [
        {
          label: "Developer & API Keys",
          description: "SMS Webhook ingress key & Gemini AI parser",
          icon: Code2,
          href: "/more/developer",
          testId: "more-developer-link",
          badge: null,
        },
        {
          label: "SMS Review Inbox",
          description: "Unconfirmed parsed SMS transactions",
          icon: Inbox,
          href: "/more/inbox",
          testId: "more-sms-inbox-link",
          badge: inboxCount > 0 ? String(inboxCount) : null,
          badgeTestId: "inbox-badge",
        },
        {
          label: "Bank SMS Activity",
          description: "Complete raw SMS audit trail and ingress status",
          icon: FileText,
          href: "/more/sms-activity",
          testId: "more-sms-activity-link",
          badge: null,
        },
        {
          label: "Apple Shortcuts Guide",
          description: "Step-by-step iOS background SMS forwarding",
          icon: Smartphone,
          href: "/more/shortcuts",
          testId: "shortcuts-guide-link",
          badge: null,
        },
      ],
    },
  ];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Settings & More"
        subtitle="Treasury Planning, Household & Automation"
      />

      {/* User Account / Profile Card */}
      <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-13 h-13 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] font-bold text-base shrink-0">
            {userLoading ? (
              <LoaderCircle size={20} className="animate-spin" />
            ) : user?.name ? (
              user.name.charAt(0).toUpperCase()
            ) : (
              <User size={20} />
            )}
          </div>
          <div className="min-w-0">
            <span
              data-testid="user-display-name"
              className="text-base font-bold text-[var(--text)] block truncate"
            >
              {userLoading ? "Loading profile…" : user?.name || "User"}
            </span>
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
              {userLoading ? "Loading account details…" : user?.email || "treasury-admin@local"}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="logout-button"
          onClick={() => setShowLogoutConfirm(true)}
          className="h-11 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-[var(--expense)] bg-[var(--expense)]/8 border border-[var(--expense)]/25 rounded-2xl hover:bg-[var(--expense)]/15 transition-colors cursor-pointer shrink-0"
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>

      {/* Categorized Settings Cards */}
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2.5">
            <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
              {section.title}
            </h2>
            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    transitionTypes={["nav-forward"]}
                    data-testid={item.testId}
                    className="flex items-center justify-between gap-4 p-4 sm:p-5 hover:bg-[var(--surface-hover)] transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-colors shrink-0 ${
                          item.highlight
                            ? "bg-[var(--accent)]/12 border-[var(--accent)]/30 text-[var(--accent)]"
                            : "bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)]/40"
                        }`}
                      >
                        <Icon size={19} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-[var(--text)] block truncate">
                          {item.label}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] block mt-0.5 leading-relaxed">
                          {item.description}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {item.badge && (
                        <span
                          data-testid={item.badgeTestId}
                          className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-[var(--accent)] text-white shadow-xs"
                        >
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight
                        size={18}
                        className="text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <EmptyState
        title="Settings & Tools"
        description="All system configurations, monthly budgets, backup tools, and household settings are available here."
      />

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Log Out"
        message="Are you sure you want to log out? Any pending local changes will be preserved on this device, but you will need to log back in to sync."
        confirmText="Log Out"
        variant="danger"
      />
    </main>
  );
}

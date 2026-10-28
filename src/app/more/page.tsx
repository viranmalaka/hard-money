"use client";

import React from "react";
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
  Sliders,
  Smartphone,
  User,
  Users,
  ShoppingBasket,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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

export default function MorePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const sections = [
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
          description: "Theme, currency, tax rates & daily reminders",
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
            Settings & More
          </h1>
          <p className="text-[11px] text-[var(--text-muted)]">
            Personal treasury preferences, integrations and automation
          </p>
        </div>
      </div>

      {/* User Account / Profile Card */}
      <div className="flat-card p-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface)] border border-hairline flex items-center justify-center text-[var(--accent)] font-semibold text-sm">
            {userLoading ? <LoaderCircle size={18} className="animate-spin" /> : user?.name ? user.name.charAt(0).toUpperCase() : <User size={18} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                data-testid="user-display-name"
                className="text-sm font-semibold text-[var(--text)]"
              >
                {userLoading ? "Loading profile…" : user?.name || "User"}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {userLoading ? "Loading account details…" : user?.email || "treasury-admin@local"}
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

      {/* Categorized Settings Cards */}
      {sections.map((section) => (
        <div key={section.title} className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
            {section.title}
          </span>
          <div className="flat-card divide-y divide-hairline">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  transitionTypes={["nav-forward"]}
                  data-testid={item.testId}
                  className="flex items-center justify-between p-3.5 hover:bg-[var(--surface-hover)] transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-hairline flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:border-[var(--accent)] transition-colors shrink-0">
                      <Icon size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-[var(--text)] block">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {item.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span
                        data-testid={(item as { badgeTestId?: string }).badgeTestId}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent)] text-white shadow-xs"
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight
                      size={16}
                      className="text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform"
                    />
                  </div>
                </Link>
              );
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

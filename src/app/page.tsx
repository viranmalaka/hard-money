"use client";

import React from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  Landmark,
  MessageSquare,
  Moon,
  Search,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { formatMoney } from "@/lib/finance-core/money";
import { SyncIndicator } from "@/components/sync-provider";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";
import {
  DuplicateBanner,
  getTxDisplayInfo,
  HomeSharedOverlays,
  SubNavAction,
  TxAvatarIcon,
} from "@/components/transaction/transaction-card-helpers";

export default function HomePage() {
  const data = useHomeDashboard();
  const activeAccountId = data.filters.accountId;
  const selectedAccount =
    data.visibleAccounts.find((a) => a.id === activeAccountId) || null;

  return (
    <main className="min-h-full bg-[var(--bg)] text-[var(--text)] pb-8">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]/60 select-none">
        <div className="max-w-4xl mx-auto px-5 sm:px-7 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              data-testid="app-title"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Hard Money · Wallet
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <button
                type="button"
                data-testid="month-prev"
                onClick={data.prevMonth}
                aria-label="Previous month"
                className="p-1.5 -ml-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
              >
                <ChevronLeft size={19} />
              </button>
              <h1
                data-testid="month-label"
                onClick={!data.isCurrentMonth ? data.goToCurrentMonth : undefined}
                title={!data.isCurrentMonth ? "Jump to current month" : undefined}
                className={`text-lg sm:text-xl font-bold tracking-tight ${
                  !data.isCurrentMonth ? "cursor-pointer hover:text-[var(--accent)]" : ""
                }`}
              >
                {data.monthLabel}
              </h1>
              <button
                type="button"
                data-testid="month-next"
                onClick={data.nextMonth}
                aria-label="Next month"
                className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {data.pendingInboxCount > 0 && (
              <SubNavAction
                target="/more/inbox"
                dataTestId="sms-inbox-badge"
                className="h-10 px-3.5 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center gap-1.5 text-xs font-bold hover:bg-[var(--accent)]/18 transition-colors"
              >
                <Inbox size={16} />
                <span>{data.pendingInboxCount} SMS</span>
              </SubNavAction>
            )}

            {/* Mobile Top Controls (Desktop has these in Sidebar) */}
            <div className="mobile-only flex items-center gap-2">
              <SyncIndicator isMobile={true} />
              <button
                type="button"
                data-testid="color-swap-toggle"
                onClick={data.toggleColorSwap}
                aria-label="Swap income/expense colors"
                title={`Color swap: ${data.colorSwap ? "Active" : "Default"}`}
                className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <CreditCard size={17} />
              </button>
              <button
                type="button"
                data-testid="theme-toggle"
                onClick={data.toggleTheme}
                aria-label="Toggle theme"
                className="w-10 h-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                {data.mounted && data.resolvedTheme === "dark" ? (
                  <Sun size={17} className="text-amber-400" />
                ) : (
                  <Moon size={17} />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto pt-2 sm:pt-4 space-y-4 sm:space-y-5">

        {/* Horizontal Snap-Scrolling Wallet Cards */}
        <section aria-label="Accounts Carousel">
          <div className="flex items-stretch gap-3.5 md:gap-4 overflow-x-auto snap-x snap-mandatory px-6 sm:px-8 py-4 scroll-px-6 sm:scroll-px-8 no-scrollbar">
            {/* Master All-Accounts Card */}
            <button
              type="button"
              data-testid="wallet-card-all"
              onClick={() =>
                data.setFilters((prev) => ({ ...prev, accountId: "" }))
              }
              className={`snap-start shrink-0 w-[240px] md:w-[325px] rounded-2xl md:rounded-3xl p-4 md:p-5 text-left transition-all duration-200 flex flex-col justify-between min-h-[142px] md:min-h-[180px] cursor-pointer ${
                !activeAccountId
                  ? "bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#022C22] text-white shadow-md ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)] scale-[1.02]"
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--text-muted)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] md:text-xs font-semibold uppercase tracking-wider opacity-80 truncate">
                  All Accounts ({data.visibleAccounts.length})
                </span>
                <Wallet size={18} className="opacity-85 shrink-0 md:w-5 md:h-5" />
              </div>

              <div className="space-y-0.5 md:space-y-1 my-2 md:my-3">
                <p className="text-[11px] md:text-xs opacity-75">Total Net Worth</p>
                <p
                  data-testid="summary-total"
                  className="text-xl md:text-2xl font-extrabold font-mono tabular-nums tracking-tight truncate"
                >
                  {formatMoney(data.netWorthTotal)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] md:text-xs pt-2 md:pt-2.5 border-t border-current/15 font-mono tabular-nums">
                <span data-testid="summary-income" className="opacity-90 truncate">
                  In: {formatMoney(data.incomeMinor)}
                </span>
                <span data-testid="summary-expense" className="opacity-90 truncate">
                  Out: {formatMoney(data.expenseMinor)}
                </span>
              </div>
            </button>

            {/* Individual Live Account Cards */}
            {data.visibleAccounts.map((acc) => {
              const selected = activeAccountId === acc.id;
              const bal = data.balanceFor(acc);
              const isCredit = acc.type === "CREDIT_CARD";
              const isCash = acc.type === "CASH";

              const cardTone = selected
                ? isCredit
                  ? "bg-gradient-to-br from-rose-700 to-rose-950 text-white shadow-md ring-2 ring-rose-400 ring-offset-2 ring-offset-[var(--bg)] scale-[1.02]"
                  : isCash
                    ? "bg-gradient-to-br from-emerald-700 to-teal-950 text-white shadow-md ring-2 ring-emerald-400 ring-offset-2 ring-offset-[var(--bg)] scale-[1.02]"
                    : "bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-md ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)] scale-[1.02]"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--text-muted)]";

              return (
                <button
                  key={acc.id}
                  type="button"
                  data-testid={`wallet-card-${acc.id}`}
                  onClick={() =>
                    data.setFilters((prev) => ({
                      ...prev,
                      accountId: prev.accountId === acc.id ? "" : acc.id,
                    }))
                  }
                  className={`snap-start shrink-0 w-[220px] md:w-[295px] rounded-2xl md:rounded-3xl p-4 md:p-5 text-left transition-all duration-200 flex flex-col justify-between min-h-[142px] md:min-h-[180px] cursor-pointer ${cardTone}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] md:text-xs font-semibold uppercase tracking-wider opacity-80 truncate">
                      {isCredit
                        ? "Credit Card"
                        : isCash
                          ? "Cash Wallet"
                          : "Bank Account"}
                    </span>
                    {isCredit ? (
                      <CreditCard size={17} className="shrink-0 opacity-85 md:w-[19px] md:h-[19px]" />
                    ) : isCash ? (
                      <Banknote size={17} className="shrink-0 opacity-85 md:w-[19px] md:h-[19px]" />
                    ) : (
                      <Landmark size={17} className="shrink-0 opacity-85 md:w-[19px] md:h-[19px]" />
                    )}
                  </div>

                  <div className="space-y-0.5 md:space-y-1 my-2 md:my-3">
                    <p className="text-xs md:text-sm font-semibold truncate">{acc.name}</p>
                    <p className="text-xl md:text-2xl font-extrabold font-mono tabular-nums tracking-tight truncate">
                      {formatMoney(bal, acc.currency || "LKR")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] md:text-xs pt-2 md:pt-2.5 border-t border-current/15 opacity-80">
                    <span className="font-mono">
                      {acc.accountNumberLast4
                        ? `•••• ${acc.accountNumberLast4}`
                        : acc.currency}
                    </span>
                    <span>
                      {selected ? "Active Filter ✓" : "Tap to filter"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4-Button Quick-Action Card Strip */}
        <section aria-label="Quick Actions" className="px-5 sm:px-7">
          <div className="grid grid-cols-4 gap-3 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4">
            <button
              type="button"
              data-testid="quick-action-spend"
              onClick={() =>
                data.openQuickAdd({
                  type: "EXPENSE",
                  accountId: activeAccountId || undefined,
                })
              }
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <span className="w-12 h-12 rounded-2xl bg-[var(--expense)]/12 text-expense flex items-center justify-center group-hover:scale-103 group-active:scale-95 transition-transform">
                <ArrowUpRight size={22} />
              </span>
              <span className="text-xs font-semibold">Spend</span>
            </button>

            <button
              type="button"
              data-testid="quick-action-receive"
              onClick={() =>
                data.openQuickAdd({
                  type: "INCOME",
                  accountId: activeAccountId || undefined,
                })
              }
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <span className="w-12 h-12 rounded-2xl bg-[var(--income)]/12 text-income flex items-center justify-center group-hover:scale-103 group-active:scale-95 transition-transform">
                <ArrowDownLeft size={22} />
              </span>
              <span className="text-xs font-semibold">Receive</span>
            </button>

            <button
              type="button"
              data-testid="quick-action-move"
              onClick={() =>
                data.openQuickAdd({
                  type: "TRANSFER",
                  accountId: activeAccountId || undefined,
                })
              }
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <span className="w-12 h-12 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center group-hover:scale-103 group-active:scale-95 transition-transform">
                <ArrowLeftRight size={20} />
              </span>
              <span className="text-xs font-semibold">Move</span>
            </button>

            <SubNavAction
              target="accounts"
              dataTestId="quick-action-manage"
              className="flex flex-col items-center gap-2 group"
            >
              <span className="w-12 h-12 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center group-hover:scale-103 group-active:scale-95 transition-transform">
                <Wallet size={20} />
              </span>
              <span className="text-xs font-semibold">Manage</span>
            </SubNavAction>
          </div>
        </section>

        {/* Search, Filter Chips & Active Scope Indicator */}
        <section className="px-5 sm:px-7 space-y-3">
          <div className="relative flex items-center">
            <Search
              size={17}
              className="absolute left-4 text-[var(--text-muted)] pointer-events-none"
            />
            <input
              type="text"
              data-testid="search-input"
              value={data.filters.searchQuery}
              onChange={(e) =>
                data.setFilters((prev) => ({
                  ...prev,
                  searchQuery: e.target.value,
                }))
              }
              placeholder={
                selectedAccount
                  ? `Search in ${selectedAccount.name}...`
                  : "Search notes, categories, or amounts..."
              }
              className="w-full pl-11 pr-16 py-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            {data.hasActiveFilters && (
              <button
                type="button"
                data-testid="filter-clear-btn"
                onClick={data.resetFilters}
                className="absolute right-3 px-2.5 py-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Chips (Type + Top Categories) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {(
              [
                { value: "", label: "All" },
                { value: "EXPENSE", label: "Expenses" },
                { value: "INCOME", label: "Income" },
                { value: "TRANSFER", label: "Transfers" },
              ] as const
            ).map((chip) => {
              const active =
                data.filters.type === chip.value && !data.filters.categoryId;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() =>
                    data.setFilters((prev) => ({
                      ...prev,
                      type: chip.value,
                      categoryId: chip.value === "" ? "" : prev.categoryId,
                    }))
                  }
                  className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                      : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}

            {data.categoryBreakdown.slice(0, 6).map((cat) => {
              const active = data.filters.categoryId === cat.categoryId;
              return (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() =>
                    data.setFilters((prev) => ({
                      ...prev,
                      categoryId:
                        prev.categoryId === cat.categoryId
                          ? ""
                          : cat.categoryId,
                    }))
                  }
                  className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                      : "bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {selectedAccount && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-xs font-semibold">
              <span>Showing activity for {selectedAccount.name}</span>
              <button
                type="button"
                onClick={() =>
                  data.setFilters((prev) => ({ ...prev, accountId: "" }))
                }
                className="inline-flex items-center gap-1 text-[var(--accent)] cursor-pointer"
              >
                <span>Show all</span>
                <X size={14} />
              </button>
            </div>
          )}
        </section>

        {/* Day-Grouped Standalone Card Transaction Feed */}
        <section
          aria-label="Transactions List"
          className="px-5 sm:px-7 space-y-5"
        >
          {data.groupedByDay.length === 0 ? (
            <div
              data-testid="empty-state"
              className="rounded-3xl bg-[var(--surface)] border border-dashed border-[var(--border)] p-10 text-center space-y-2.5"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] flex items-center justify-center mx-auto">
                <ArrowLeftRight size={22} />
              </div>
              <p className="text-base font-bold text-[var(--text)]">
                {data.hasActiveFilters
                  ? "No matching transactions"
                  : "No transactions this month"}
              </p>
              <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                {data.hasActiveFilters
                  ? "Try clearing your search or account filter to see all entries."
                  : `Tap Spend, Receive, or the + button to record your first entry${
                      selectedAccount ? ` in ${selectedAccount.name}` : ""
                    }.`}
              </p>
            </div>
          ) : (
            data.groupedByDay.map((group) => (
              <div
                key={group.dateKey}
                data-testid={`day-group-${group.dateKey}`}
                className="space-y-3"
              >
                <div
                  data-testid={`day-header-${group.dateKey}`}
                  className="flex items-center justify-between px-1"
                >
                  <h2 className="text-sm font-bold text-[var(--text)]">
                    {group.titleLabel}
                  </h2>
                  <div className="flex items-center gap-3 text-xs font-mono font-semibold tabular-nums">
                    {group.incomeMinor > 0 && (
                      <span className="text-income">
                        +{formatMoney(group.incomeMinor)}
                      </span>
                    )}
                    {group.expenseMinor > 0 && (
                      <span className="text-expense">
                        -{formatMoney(group.expenseMinor)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {group.transactions.map((tx) => {
                    const info = getTxDisplayInfo(
                      tx,
                      data.categoryMap,
                      data.accountMap,
                    );
                    return (
                      <div
                        key={tx.id}
                        data-testid={`transaction-row-${tx.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => data.setSelectedTxForEdit(tx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            data.setSelectedTxForEdit(tx);
                          }
                        }}
                        className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--text-muted)]/60 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5">
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${info.accentColor}1C`,
                              color: info.accentColor,
                            }}
                          >
                            <TxAvatarIcon
                              tx={tx}
                              category={info.category}
                              size={21}
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm sm:text-base font-bold text-[var(--text)] truncate">
                                {info.title}
                              </span>
                              {info.hasSms && (
                                <button
                                  type="button"
                                  data-testid={`sms-badge-${tx.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    data.openSmsModal(tx);
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] text-2xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <MessageSquare size={10} />
                                  SMS
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] min-w-0">
                              <span className="px-2 py-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] font-medium text-[var(--text)]/85 shrink-0 truncate max-w-[140px]">
                                {info.fromAccount}
                              </span>
                              {tx.note && (
                                <span className="truncate">{tx.note}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <span
                              className={`text-sm sm:text-base font-extrabold font-mono tabular-nums whitespace-nowrap ${info.amountToneClass}`}
                            >
                              {info.signedAmount}
                            </span>
                          </div>
                        </div>

                        <DuplicateBanner tx={tx} data={data} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <HomeSharedOverlays data={data} />
    </main>
  );
}

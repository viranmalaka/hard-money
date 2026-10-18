"use client";

import React, { useState } from "react";
import { Search, Filter, X } from "lucide-react";
import { LocalAccount, LocalCategory } from "@/lib/db";

export interface TransFilterState {
  searchQuery: string;
  accountId: string;
  categoryId: string;
  type: string;
}

interface TransFilterBarProps {
  filters: TransFilterState;
  onChange: (filters: TransFilterState) => void;
  accounts: LocalAccount[];
  categories: LocalCategory[];
}

export function TransFilterBar({
  filters,
  onChange,
  accounts,
  categories,
}: TransFilterBarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(Boolean(filters.searchQuery));

  const hasActiveFilters = Boolean(
    filters.accountId || filters.categoryId || filters.type
  );

  const handleSearchChange = (query: string) => {
    onChange({ ...filters, searchQuery: query });
  };

  const clearSearch = () => {
    onChange({ ...filters, searchQuery: "" });
  };

  const clearAllFilters = () => {
    onChange({
      searchQuery: filters.searchQuery,
      accountId: "",
      categoryId: "",
      type: "",
    });
    setIsFilterOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Search bar or search toggle */}
        <div className="flex-1 relative flex items-center">
          <input
            type="text"
            data-testid="trans-search-input"
            value={filters.searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search note, category, amount..."
            className="w-full pl-8 pr-7 py-1.5 rounded border border-hairline bg-[var(--surface)] text-[var(--text)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
          />
          <Search size={14} className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
          {filters.searchQuery && (
            <button
              type="button"
              data-testid="trans-search-clear"
              onClick={clearSearch}
              className="absolute right-2 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Dialog Toggle Button */}
        <button
          type="button"
          data-testid="trans-filter-btn"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-hairline text-xs font-medium transition-colors ${
            hasActiveFilters
              ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)] font-semibold"
              : "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
          title="Filter transactions"
        >
          <Filter size={13} />
          <span>Filter</span>
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent ml-0.5" />
          )}
        </button>
      </div>

      {/* Filter Modal / Popover */}
      {isFilterOpen && (
        <div
          data-testid="filter-dialog"
          className="p-3 bg-[var(--surface)] border border-hairline rounded-lg space-y-3 text-xs shadow-md"
        >
          <div className="flex items-center justify-between pb-1 border-b border-hairline">
            <span className="font-semibold text-[var(--text)]">Filter Transactions</span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Account Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Account</label>
              <select
                data-testid="filter-account"
                value={filters.accountId}
                onChange={(e) => onChange({ ...filters, accountId: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                <option value="">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Category</label>
              <select
                data-testid="filter-category"
                value={filters.categoryId}
                onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Type</label>
              <select
                data-testid="filter-type"
                value={filters.type}
                onChange={(e) => onChange({ ...filters, type: e.target.value })}
                className="w-full px-2 py-1.5 rounded border border-hairline bg-[var(--bg)] text-[var(--text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
              >
                <option value="">All Types</option>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              data-testid="filter-clear-btn"
              onClick={clearAllFilters}
              className="text-xs text-[var(--text-muted)] hover:text-red-500 font-medium transition-colors"
            >
              Clear filters
            </button>
            <button
              type="button"
              data-testid="filter-apply-btn"
              onClick={() => setIsFilterOpen(false)}
              className="px-3 py-1 rounded bg-[var(--text)] text-[var(--bg)] font-semibold text-xs hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

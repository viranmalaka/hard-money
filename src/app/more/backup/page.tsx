"use client";

import React, { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  ShieldCheck,
  RefreshCw,
  FolderArchive,
  Layers,
  CreditCard,
  Receipt,
  FileText,
  Home,
  CheckSquare,
  Bookmark,
  MessageSquare,
  Settings,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { downloadBackup, importBackup } from "@/services/backup-service";
import {
  HardMoneyBackupPayload,
  BackupEntityCounts,
  extractBackupCounts,
  ExportOptions,
  DEFAULT_EXPORT_OPTIONS,
} from "@/lib/backup/types";
import { ImportResult } from "@/lib/backup/import";
import { useModalHistory } from "@/hooks/use-modal-history";

const EXPORT_CATEGORY_ITEMS: Array<{
  key: keyof ExportOptions;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    key: "accounts",
    label: "Accounts",
    description: "Bank savings, checking, cash, and asset accounts",
    icon: CreditCard,
  },
  {
    key: "transactions",
    label: "Transactions & Splits",
    description: "Income, expense, transfer records, and split breakdowns",
    icon: Receipt,
  },
  {
    key: "categories",
    label: "Categories",
    description: "Custom and system transaction category hierarchies",
    icon: Layers,
  },
  {
    key: "budgets",
    label: "Budgets & Snapshots",
    description: "Monthly budget allocations, rollovers, and history",
    icon: FolderArchive,
  },
  {
    key: "fixedDeposits",
    label: "Fixed Deposits",
    description: "Deposit contracts, compounding schedules, and payout settings",
    icon: Database,
  },
  {
    key: "loans",
    label: "Loans & Leases",
    description: "Loan terms, amortization schedule entries, and payments",
    icon: FileText,
  },
  {
    key: "creditCards",
    label: "Credit Cards & Plans",
    description: "Statements, statement cycles, and active installment plans",
    icon: CreditCard,
  },
  {
    key: "templates",
    label: "Transaction Templates",
    description: "Quick Add bookmarks, favorites, and shortcuts",
    icon: Bookmark,
  },
  {
    key: "households",
    label: "Households & Shopping Lists",
    description: "Shared households, members, and shopping checklist items",
    icon: Home,
  },
  {
    key: "bankSms",
    label: "Bank SMS Records",
    description: "Financial SMS audit trail and review inbox logs",
    icon: MessageSquare,
  },
  {
    key: "settings",
    label: "Settings & Preferences",
    description: "User profile, default currency, tax rates, and AI model configs",
    icon: Settings,
  },
];

export default function BackupPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<Required<ExportOptions>>(DEFAULT_EXPORT_OPTIONS);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  // Import State
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<HardMoneyBackupPayload | null>(null);
  const [entityCounts, setEntityCounts] = useState<BackupEntityCounts | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useModalHistory(isExportModalOpen, () => setIsExportModalOpen(false), "export-modal");

  const totalOptionsCount = EXPORT_CATEGORY_ITEMS.length;
  const selectedOptionsCount = Object.values(exportOptions).filter(Boolean).length;
  const isAllSelected = selectedOptionsCount === totalOptionsCount;

  const handleToggleOption = (key: keyof ExportOptions) => {
    setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    setExportOptions(DEFAULT_EXPORT_OPTIONS);
  };

  const handleDeselectAll = () => {
    const empty = Object.keys(DEFAULT_EXPORT_OPTIONS).reduce(
      (acc, k) => ({ ...acc, [k]: false }),
      {} as Required<ExportOptions>
    );
    setExportOptions(empty);
  };

  const handleExport = async () => {
    if (selectedOptionsCount === 0) return;

    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      await downloadBackup(isAllSelected ? undefined : exportOptions);
      setExportSuccess(true);
      setIsExportModalOpen(false);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download backup";
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const processFile = async (file: File) => {
    setParseError(null);
    setImportError(null);
    setImportResult(null);

    if (!file.name.endsWith(".json")) {
      setParseError("Please select a valid .json backup file.");
      setSelectedFile(null);
      setParsedBackup(null);
      setEntityCounts(null);
      return;
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json || json.version !== 1 || !json.user) {
        setParseError(
          "Unrecognized backup file format. Expected a HardMoney backup JSON file with version 1."
        );
        setSelectedFile(null);
        setParsedBackup(null);
        setEntityCounts(null);
        return;
      }

      setSelectedFile(file);
      setParsedBackup(json);
      setEntityCounts(extractBackupCounts(json));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Syntax error";
      setParseError("Could not parse file as JSON: " + msg);
      setSelectedFile(null);
      setParsedBackup(null);
      setEntityCounts(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleResetImport = () => {
    setSelectedFile(null);
    setParsedBackup(null);
    setEntityCounts(null);
    setParseError(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedBackup) return;
    setIsImporting(true);
    setImportError(null);

    try {
      const result = await importBackup(parsedBackup);
      setImportResult(result);
      queryClient.invalidateQueries();
      handleResetImport();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import backup data";
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Data & Backup"
        subtitle="Portable JSON Archive & Treasury Restore"
        backHref="/more"
        backLabel="Back to More"
      />

      {/* Export Section */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Export Treasury Data
        </h2>
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                <Database size={20} />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-base font-bold text-[var(--text)]">Full JSON Backup</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Download a complete, portable JSON snapshot of all your entities: accounts,
                  transactions, split items, categories, budgets, loans, fixed deposits, credit
                  cards, SMS activity, and settings.
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="export-json-btn"
              disabled={isExporting}
              onClick={() => setIsExportModalOpen(true)}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-xs shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <Download size={15} />
              <span>Export Data</span>
            </button>
          </div>

          <div className="flex items-start sm:items-center gap-2.5 p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text-muted)] leading-relaxed">
            <ShieldCheck size={17} className="text-[var(--income)] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Sensitive authentication credentials (like account passwords) are excluded, while
              preserving all intra-entity relationships, balances, and configurations.
            </span>
          </div>

          {exportSuccess && (
            <div
              data-testid="export-success-banner"
              className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
            >
              <CheckCircle2 size={17} className="shrink-0" />
              <span>Backup file downloaded successfully!</span>
            </div>
          )}

          {exportError && (
            <div
              data-testid="export-error-banner"
              className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-[var(--expense)] text-xs font-medium"
            >
              <AlertCircle size={17} className="shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </section>

      {/* Import Section */}
      <section className="space-y-2.5">
        <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Import & Restore Data
        </h2>
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
              <RefreshCw size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--text)]">Restore from Backup</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Upload a previously exported HardMoney JSON file to reimport or recover your data.
                Records are safely merged and upserted using original entity identifiers.
              </p>
            </div>
          </div>

          {/* Import Success Banner */}
          {importResult && (
            <div
              data-testid="import-success-banner"
              className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-3 text-xs text-emerald-700 dark:text-emerald-300"
            >
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400" />
                <span>Data restored successfully!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--text-muted)] text-2xs block">Accounts</span>
                  <span className="font-bold font-mono text-sm text-[var(--text)]">
                    {importResult.importedCounts.accounts}
                  </span>
                </div>
                <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--text-muted)] text-2xs block">Transactions</span>
                  <span className="font-bold font-mono text-sm text-[var(--text)]">
                    {importResult.importedCounts.transactions}
                  </span>
                </div>
                <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--text-muted)] text-2xs block">Categories</span>
                  <span className="font-bold font-mono text-sm text-[var(--text)]">
                    {importResult.importedCounts.categories}
                  </span>
                </div>
                <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--text-muted)] text-2xs block">Budgets</span>
                  <span className="font-bold font-mono text-sm text-[var(--text)]">
                    {importResult.importedCounts.budgets}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Import Error Banner */}
          {importError && (
            <div
              data-testid="import-error-banner"
              className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-[var(--expense)] text-xs font-medium"
            >
              <AlertCircle size={17} className="shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* File Picker / Drop Zone */}
          {!parsedBackup ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                data-testid="backup-file-input"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="backup-dropzone"
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--accent)] bg-[var(--accent)]/8"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg)]"
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)] shadow-xs">
                    <Upload size={22} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[var(--text)]">
                      Click to choose or drag & drop backup JSON
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Supports files created with HardMoney Backup (v1)
                    </p>
                  </div>
                </div>
              </div>

              {parseError && (
                <div
                  data-testid="parse-error-banner"
                  className="mt-3 flex items-center gap-2.5 p-3.5 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-[var(--expense)] text-xs font-medium"
                >
                  <AlertCircle size={17} className="shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            /* Backup Inspection Preview Card */
            <div
              data-testid="backup-preview-card"
              className="space-y-4 p-4 sm:p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center justify-center shrink-0">
                    <FileJson size={20} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-[var(--text)] block truncate">
                      {selectedFile?.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] block mt-0.5">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB • ` : ""}
                      Exported {new Date(parsedBackup.exportedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="cancel-file-btn"
                  onClick={handleResetImport}
                  className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] cursor-pointer shrink-0"
                >
                  Change File
                </button>
              </div>

              {/* Entity Breakdown Stats */}
              {entityCounts && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: "Accounts", count: entityCounts.accounts, icon: CreditCard },
                    { label: "Transactions", count: entityCounts.transactions, icon: Receipt },
                    { label: "Categories", count: entityCounts.categories, icon: Layers },
                    { label: "Budgets", count: entityCounts.budgets, icon: FolderArchive },
                    { label: "Loans", count: entityCounts.loans, icon: FileText },
                    { label: "Fixed Deposits", count: entityCounts.fixedDeposits, icon: Database },
                    { label: "Households", count: entityCounts.households, icon: Home },
                    { label: "Shopping Items", count: entityCounts.shoppingListItems, icon: CheckSquare },
                  ].map(({ label, count, icon: ItemIcon }) => (
                    <div
                      key={label}
                      className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center gap-2.5"
                    >
                      <ItemIcon size={15} className="text-[var(--accent)] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-2xs text-[var(--text-muted)] block truncate">
                          {label}
                        </span>
                        <span className="text-xs font-bold font-mono text-[var(--text)]">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Warning Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs leading-relaxed">
                <strong>Restore Strategy:</strong> Existing entities matching these IDs will be
                updated, and any missing records will be inserted into your active account.
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  data-testid="cancel-import-preview-btn"
                  onClick={handleResetImport}
                  className="h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  data-testid="start-import-btn"
                  disabled={isImporting}
                  onClick={() => setIsImportModalOpen(true)}
                  className="h-11 px-5 inline-flex items-center gap-2 rounded-2xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Restoring Data...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      <span>Confirm & Restore Data</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Export Window Modal */}
      {isExportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          data-testid="export-modal"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs select-none overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isExporting) setIsExportModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-sheet-safe sm:pb-6 space-y-4 my-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[var(--border)] shrink-0">
              <div>
                <div className="flex items-center gap-2.5">
                  <Database size={18} className="text-[var(--accent)]" />
                  <h2 id="export-modal-title" className="text-base font-bold text-[var(--text)]">
                    Export Treasury Data
                  </h2>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  Select the data categories to include in this JSON export.
                </p>
              </div>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setIsExportModalOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors disabled:opacity-50 cursor-pointer"
                aria-label="Close export window"
              >
                <X size={18} />
              </button>
            </div>

            {/* Toolbar: Counter & Quick Selection */}
            <div className="flex items-center justify-between gap-2 px-1 shrink-0">
              <span
                className={`px-2.5 py-1 rounded-full text-2xs font-bold border ${
                  isAllSelected
                    ? "bg-[var(--accent)]/12 text-[var(--accent)] border-[var(--accent)]/30"
                    : selectedOptionsCount > 0
                      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                      : "bg-[var(--expense)]/15 text-[var(--expense)] border-[var(--expense)]/30"
                }`}
              >
                {isAllSelected
                  ? `All Categories (${totalOptionsCount})`
                  : `${selectedOptionsCount} of ${totalOptionsCount} selected`}
              </span>

              <div className="flex items-center gap-2.5 text-xs">
                <button
                  type="button"
                  disabled={isExporting || isAllSelected}
                  onClick={handleSelectAll}
                  className="text-[var(--accent)] hover:underline disabled:opacity-40 disabled:no-underline font-semibold cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-[var(--text-muted)]">•</span>
                <button
                  type="button"
                  disabled={isExporting || selectedOptionsCount === 0}
                  onClick={handleDeselectAll}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Categories List */}
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 border border-[var(--border)] rounded-2xl p-2.5 bg-[var(--bg)]">
              {EXPORT_CATEGORY_ITEMS.map((item) => {
                const isChecked = exportOptions[item.key];
                const Icon = item.icon;

                return (
                  <label
                    key={item.key}
                    data-testid={`export-item-${item.key}`}
                    className={`flex items-start gap-3 p-3 rounded-2xl cursor-pointer transition-all ${
                      isChecked
                        ? "bg-[var(--surface)] border border-[var(--border)] shadow-2xs"
                        : "opacity-60 hover:opacity-100 hover:bg-[var(--surface)] border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isExporting}
                      onChange={() => handleToggleOption(item.key)}
                      className="mt-1 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-0 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/12 flex items-center justify-center text-[var(--accent)] shrink-0">
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-[var(--text)] block truncate">
                        {item.label}
                      </span>
                      <p className="text-2xs text-[var(--text-muted)] leading-relaxed mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Warning if 0 selected */}
            {selectedOptionsCount === 0 && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/25 text-[var(--expense)] text-xs font-medium"
              >
                Please select at least one data category to generate an export.
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border)] shrink-0">
              <p className="text-xs text-[var(--text-muted)] hidden sm:block">
                {isAllSelected ? "Full snapshot of your treasury data" : "Custom partial snapshot"}
              </p>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setIsExportModalOpen(false)}
                  className="h-11 px-4 rounded-2xl border border-[var(--border)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-export-btn"
                  disabled={isExporting || selectedOptionsCount === 0}
                  onClick={handleExport}
                  className="h-11 px-5 inline-flex items-center gap-2 rounded-2xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>
                        {isAllSelected
                          ? "Download All Data"
                          : `Download Selected (${selectedOptionsCount})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirm={handleConfirmImport}
        title="Restore Treasury Data"
        message={`Are you sure you want to restore data from ${selectedFile?.name || "this backup"}? This will upsert ${
          entityCounts
            ? `${entityCounts.accounts} accounts, ${entityCounts.transactions} transactions, and related records`
            : "all entities"
        } into your account.`}
        confirmText="Yes, Restore Data"
        cancelText="Cancel"
        variant="warning"
        icon="alert"
        testId="import-confirmation-modal"
      />
    </main>
  );
}

"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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

  // Handle Export
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

  // Process selected file
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

  // Perform Import
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
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <Link
            href="/more"
            transitionTypes={["nav-back"]}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">
              Data & Backup
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Export full JSON backup archives or restore treasury database
            </p>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Export Treasury Data
        </span>
        <div className="flat-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Database size={16} className="text-[var(--accent)]" />
                <span>Full JSON Backup</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Download a complete, portable JSON snapshot of all your entities: accounts,
                transactions, split items, categories, budgets, loans, fixed deposits, credit
                cards, SMS activity, and settings.
              </p>
            </div>
            <button
              type="button"
              data-testid="export-json-btn"
              disabled={isExporting}
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all shadow-xs shrink-0 disabled:opacity-50"
            >
              <Download size={14} />
              <span>Export Data</span>
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--surface-hover)] border border-hairline text-[11px] text-[var(--text-muted)]">
            <ShieldCheck size={14} className="text-[var(--income)] shrink-0" />
            <span>
              Sensitive authentication credentials (like account passwords) are excluded, while
              preserving all intra-entity relationships, balances, and configurations.
            </span>
          </div>

          {exportSuccess && (
            <div
              data-testid="export-success-banner"
              className="flex items-center gap-2 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs"
            >
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Backup file downloaded successfully!</span>
            </div>
          )}

          {exportError && (
            <div
              data-testid="export-error-banner"
              className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
          Import & Restore Data
        </span>
        <div className="flat-card p-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <RefreshCw size={16} className="text-[var(--accent)]" />
              <span>Restore from Backup</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Upload a previously exported HardMoney JSON file to reimport or recover your data.
              Records are safely merged and upserted using original entity identifiers.
            </p>
          </div>

          {/* Import Success Banner */}
          {importResult && (
            <div
              data-testid="import-success-banner"
              className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2 text-xs text-emerald-700 dark:text-emerald-300"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span>Data restored successfully!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="bg-[var(--surface)] p-2 rounded border border-hairline">
                  <span className="text-[var(--text-muted)] block">Accounts</span>
                  <span className="font-semibold text-[var(--text)]">{importResult.importedCounts.accounts}</span>
                </div>
                <div className="bg-[var(--surface)] p-2 rounded border border-hairline">
                  <span className="text-[var(--text-muted)] block">Transactions</span>
                  <span className="font-semibold text-[var(--text)]">{importResult.importedCounts.transactions}</span>
                </div>
                <div className="bg-[var(--surface)] p-2 rounded border border-hairline">
                  <span className="text-[var(--text-muted)] block">Categories</span>
                  <span className="font-semibold text-[var(--text)]">{importResult.importedCounts.categories}</span>
                </div>
                <div className="bg-[var(--surface)] p-2 rounded border border-hairline">
                  <span className="text-[var(--text-muted)] block">Budgets</span>
                  <span className="font-semibold text-[var(--text)]">{importResult.importedCounts.budgets}</span>
                </div>
              </div>
            </div>
          )}

          {/* Import Error Banner */}
          {importError && (
            <div
              data-testid="import-error-banner"
              className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle size={16} className="shrink-0" />
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
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-hairline hover:border-[var(--accent)]/50 bg-[var(--surface-hover)]/30"
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-[var(--surface)] border border-hairline flex items-center justify-center text-[var(--text-muted)]">
                    <Upload size={20} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-[var(--text)]">
                      Click to choose or drag & drop backup JSON
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Supports files created with HardMoney Backup (v1)
                    </p>
                  </div>
                </div>
              </div>

              {parseError && (
                <div
                  data-testid="parse-error-banner"
                  className="mt-2 flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            /* Backup Inspection Preview Card */
            <div data-testid="backup-preview-card" className="space-y-3 p-4 rounded-lg border border-hairline bg-[var(--surface)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
                    <FileJson size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[var(--text)] block truncate max-w-xs sm:max-w-md">
                      {selectedFile?.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB • ` : ""}
                      Exported {new Date(parsedBackup.exportedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="cancel-file-btn"
                  onClick={handleResetImport}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-2 py-1 rounded"
                >
                  Change File
                </button>
              </div>

              {/* Entity Breakdown Stats */}
              {entityCounts && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <CreditCard size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Accounts</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.accounts}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <Receipt size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Transactions</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.transactions}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <Layers size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Categories</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.categories}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <FolderArchive size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Budgets</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.budgets}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <FileText size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Loans</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.loans}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <Database size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Fixed Deposits</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.fixedDeposits}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <Home size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Households</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.households}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-[var(--surface-hover)] border border-hairline flex items-center gap-2">
                    <CheckSquare size={14} className="text-[var(--accent)] shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Shopping Items</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{entityCounts.shoppingListItems}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning Notice */}
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
                <strong>Restore Strategy:</strong> Existing entities matching these IDs will be
                updated, and any missing records will be inserted into your active account.
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  data-testid="cancel-import-preview-btn"
                  onClick={handleResetImport}
                  className="px-3 py-1.5 rounded border border-hairline text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  data-testid="start-import-btn"
                  disabled={isImporting}
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Restoring Data...</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>Confirm & Restore Data</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  </div>

  {/* Export Window Modal */}
  {isExportModalOpen && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      data-testid="export-modal"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs select-none overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) setIsExportModalOpen(false);
      }}
    >
      <div className="w-full max-w-lg bg-[var(--surface)] border border-hairline rounded-2xl shadow-2xl p-4 sm:p-5 space-y-4 my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3 border-b border-hairline shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Database size={18} className="text-[var(--accent)]" />
              <h2 id="export-modal-title" className="text-sm sm:text-base font-semibold text-[var(--text)]">
                Export Treasury Data
              </h2>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Select the data categories you want to include in this JSON export. All categories are selected by default.
            </p>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => setIsExportModalOpen(false)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
            aria-label="Close export window"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Counter & Quick Selection */}
        <div className="flex items-center justify-between gap-2 px-1 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                isAllSelected
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30"
                  : selectedOptionsCount > 0
                  ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                  : "bg-red-500/15 text-red-500 border-red-500/30"
              }`}
            >
              {isAllSelected
                ? `All Categories (${totalOptionsCount})`
                : `${selectedOptionsCount} of ${totalOptionsCount} selected`}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={isExporting || isAllSelected}
              onClick={handleSelectAll}
              className="text-[var(--accent)] hover:underline disabled:opacity-40 disabled:no-underline font-medium"
            >
              Select All
            </button>
            <span className="text-[var(--text-muted)]">•</span>
            <button
              type="button"
              disabled={isExporting || selectedOptionsCount === 0}
              onClick={handleDeselectAll}
              className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Categories List */}
        <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 border border-hairline rounded-xl p-2 bg-[var(--bg)]/50 divide-y divide-hairline/40">
          {EXPORT_CATEGORY_ITEMS.map((item) => {
            const isChecked = exportOptions[item.key];
            const Icon = item.icon;

            return (
              <label
                key={item.key}
                data-testid={`export-item-${item.key}`}
                className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                  isChecked
                    ? "bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
                    : "opacity-60 hover:opacity-100 hover:bg-[var(--surface)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isExporting}
                  onChange={() => handleToggleOption(item.key)}
                  className="mt-0.5 rounded border-hairline bg-[var(--bg)] text-[var(--accent)] focus:ring-0 cursor-pointer"
                />
                <div className="w-7 h-7 rounded-lg bg-[var(--surface-hover)] border border-hairline flex items-center justify-center text-[var(--accent)] shrink-0">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text)] block truncate">
                      {item.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                    {item.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Warning if 0 selected */}
        {selectedOptionsCount === 0 && (
          <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            Please select at least one data category to generate an export.
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-hairline shrink-0">
          <p className="text-[11px] text-[var(--text-muted)] hidden sm:block">
            {isAllSelected ? "Full snapshot of your treasury data" : "Custom partial snapshot"}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={isExporting}
              onClick={() => setIsExportModalOpen(false)}
              className="px-3.5 py-1.5 rounded border border-hairline text-xs font-medium text-[var(--text)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-export-btn"
              disabled={isExporting || selectedOptionsCount === 0}
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none"
            >
              {isExporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>
                    {isAllSelected ? "Download All Data" : `Download Selected (${selectedOptionsCount})`}
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

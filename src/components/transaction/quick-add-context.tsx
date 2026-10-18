"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER";

interface QuickAddOptions {
  type?: TransactionType;
  accountId?: string;
}

interface QuickAddContextType {
  isOpen: boolean;
  initialType: TransactionType;
  initialAccountId?: string;
  openQuickAdd: (options?: QuickAddOptions) => void;
  closeQuickAdd: () => void;
}

const QuickAddContext = createContext<QuickAddContextType | null>(null);

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>("EXPENSE");
  const [initialAccountId, setInitialAccountId] = useState<string | undefined>(undefined);

  const openQuickAdd = useCallback((options?: QuickAddOptions) => {
    if (options?.type) setInitialType(options.type);
    if (options?.accountId) setInitialAccountId(options.accountId);
    setIsOpen(true);
  }, []);

  const closeQuickAdd = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <QuickAddContext.Provider
      value={{
        isOpen,
        initialType,
        initialAccountId,
        openQuickAdd,
        closeQuickAdd,
      }}
    >
      {children}
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) {
    throw new Error("useQuickAdd must be used within a QuickAddProvider");
  }
  return ctx;
}

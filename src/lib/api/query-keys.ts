export const queryKeys = {
  session: () => ["session"] as const,
  households: {
    all: () => ["households"] as const,
    detail: (id: string) => ["households", id] as const,
  },
  settings: {
    all: () => ["settings"] as const,
    user: () => ["settings", "user"] as const,
    push: () => ["settings", "push"] as const,
    gemini: () => ["settings", "gemini"] as const,
    webhookKey: () => ["settings", "webhook-key"] as const,
  },
  inbox: {
    all: () => ["sms", "inbox"] as const,
  },
  accounts: {
    all: () => ["user", "accounts"] as const,
  },
  categories: {
    all: () => ["user", "categories"] as const,
  },
  transactions: {
    all: () => ["transactions"] as const,
    byMonth: (month: string) => ["transactions", "month", month] as const,
    summary: (month?: string) => ["transactions", "summary", month ?? "all"] as const,
  },
  templates: {
    all: () => ["templates"] as const,
  },
  budgets: {
    all: () => ["budgets"] as const,
    snapshots: () => ["budgets", "snapshots"] as const,
  },
  creditCardStatements: {
    all: () => ["credit-card-statements"] as const,
  },
  installmentPlans: {
    all: () => ["installment-plans"] as const,
  },
  fixedDeposits: {
    all: () => ["fixed-deposits"] as const,
    payouts: () => ["fixed-deposits", "payouts"] as const,
  },
  loans: {
    all: () => ["loans"] as const,
    scheduleEntries: () => ["loans", "schedule-entries"] as const,
    payments: () => ["loans", "payments"] as const,
    detail: (id: string) => ["loans", id] as const,
    schedule: (id: string) => ["loans", id, "schedule"] as const,
  },
  shoppingList: {
    count: () => ["shopping-list", "count"] as const,
  },
  smsActivity: {
    all: () => ["sms", "activity"] as const,
  },
  rawSms: {
    detail: (id: string) => ["transactions", id, "raw-sms"] as const,
  },
} as const;

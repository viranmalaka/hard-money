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
  shoppingList: {
    count: () => ["shopping-list", "count"] as const,
  },
  smsActivity: {
    all: () => ["sms", "activity"] as const,
  },
  loans: {
    detail: (id: string) => ["loans", id] as const,
    schedule: (id: string) => ["loans", id, "schedule"] as const,
  },
  rawSms: {
    detail: (id: string) => ["transactions", id, "raw-sms"] as const,
  },
} as const;

# MISSION

You are an expert full-stack software architect and senior engineer. Your task is to build "Hard Money" — a high-performance, offline-first Progressive Web App (PWA) for comprehensive personal finance management. Hard Money is an **open-source, self-hosted** application: anyone can clone the repository, deploy it themselves (Docker Compose), and track their finances freely with no vendor dependency.

Feature areas:

1. Daily Expense & Income Tracker (with split categories, custom arithmetic keypad, and template bookmarks).
2. Credit Card Billing & Settlement Cycle Engine (including 0% Installment Plan / EMI management, credit limit blocking, and 1-tap settlement).
3. Fixed Deposit (FD) Investment Tracker (with compounding interest, monthly interest payouts to savings, and configurable withholding tax handling).
4. Loan & Lease Liability Tracker (with amortization schedules, auto-calculated reducing balance EMI splits, and extra principal payments). A lease is modeled as a Loan variant (`kind = LEASE`).
5. Multi-User Household Collaboration (e.g., Husband & Wife with granular roles: OWNER, CO_OWNER, CONTRIBUTOR_ADD_ONLY, VIEWER via simple email assignment).
6. Automated Bank SMS Pipeline: Raw SMS Ingestion & Archival in DB, deterministic template parsing with Gemini structured-JSON extraction as fallback, intelligent two-way de-duplication against manual entries, a review inbox for low-confidence items, and a decoupled Transaction Ingestion Service for categorized Expenses, ATM Withdrawals (with automatic Cash Wallet transfer and surcharge fees), and Deposits/Income.
7. Account Balance Calibration & Reconciliation Engine: 1-tap alignment of account balances with actual bank/cash values, automatically creating audit-trail adjustment transactions (+ or -) without skewing monthly spending budgets.

> **Reading guide**: Section 2 (Cross-Cutting Conventions) defines rules that apply to _every_ section below it (money, time, ledger semantics, sync, edit/delete). If a later section seems to conflict with Section 2, Section 2 wins.

---

## 1. TECH STACK & SYSTEM ARCHITECTURE

- **Frontend & Full-Stack Core**: Next.js (App Router) with TypeScript, tRPC, and Prisma ORM with PostgreSQL.
  - Internal application data communication (including sync) is handled via **tRPC**.
  - External integrations are handled via dedicated Next.js **Route Handlers**: `POST /api/v1/webhooks/sms-ingress` (Apple Shortcuts SMS webhook) and `POST /api/v1/cron/tick` (optional external scheduler trigger).
- **Shared Finance Core**: all money, ledger, statement-cycle, EMI, FD, loan and budget math lives in one pure TypeScript package (e.g., `packages/finance-core`) with no I/O. The **same code** runs on the client (Dexie-derived views) and on the server (scheduler, validation). It is the primary target of the test suite.
- **Styling & UI**: Tailwind CSS, Radix UI / shadcn/ui, Lucide Icons.
  - Mobile: Bottom navigation bar, thumb-friendly numeric keypads with arithmetic operators, touch gestures.
  - Desktop: Multi-column responsive layout with collapsible sidebar and analytical dashboards.
- **Offline-First Persistence**: Dexie.js (IndexedDB wrapper) with an **Outbox Mutation Queue** pattern.
  - **Universal UUIDs**: All client-created entities use client-generated UUIDv4 (or CUID2) so IDs never change or require re-mapping upon sync. System-generated entities (scheduled installments, statements, SMS-derived records) use **deterministic UUIDv5 IDs** (see Section 2.7).
  - **Two-Way Delta Sync**: Client pushes outbox mutations and pulls downstream changes using a server-issued cursor (see Section 2.6).
  - **Dexie schema versioning**: every IndexedDB schema change ships as a numbered `db.version(n).stores(...).upgrade(...)` migration, covered by migration tests.
- **Background Jobs**: `pg-boss` (Postgres-backed queue, no extra infrastructure) running in a dedicated `worker` process/container started alongside the web app (`docker compose up`). It runs the scheduled jobs (installment billing, statement snapshots, budget month-close, FD payouts) and the SMS processing queue with retry/backoff. `POST /api/v1/cron/tick` (protected by an optional `CRON_SECRET`) runs the same idempotent jobs for hosts that prefer an external cron (cron-job.org, GitHub Actions, Vercel Cron).
- **PWA Capabilities**: Service Worker (Workbox / Serwist), Web App Manifest (standalone mode), Web Push API (VAPID) for daily logging reminders. _iOS caveat_: Web Push works only when the PWA is installed to the Home Screen on iOS/iPadOS 16.4+; the UI must explain this.
- **AI Processing Engine**: `@google/genai` (Google Gen AI SDK) with Zod-based Structured Outputs. The model name is configuration (default `gemini-2.5-flash`, overridable per user in Settings) so deprecations do not require a code change. Gemini is a **fallback** parser (see Subsystem 1).
- **Authentication & User Sovereignty**: Auth.js (NextAuth).
  - Default provider: Credentials (email + password, Argon2id hashing). Optional OAuth providers (e.g., Google) enabled purely by environment variables.
  - `ALLOW_REGISTRATION` env flag (default `true`) lets a self-hoster close sign-ups after creating their household's accounts.
  - **Offline session behavior**: the app must remain fully usable offline with an expired session. Expiry only pauses sync; it never clears IndexedDB or the outbox. Local data is namespaced per user (`hardmoney-{userId}`); logging out with a non-empty outbox requires explicit confirmation.
  - User Settings Dashboard provides:
    - Personal Gemini API Key configuration (stored encrypted per user in PostgreSQL). **There is no server-wide fallback key**: users without a key get template-only SMS parsing and the rest go to the review inbox.
    - Webhook API Key generator/regenerator (`x-api-key`) with Apple Shortcuts setup guide and download template. The key is displayed **once** at creation and stored only as a hash.
    - Timezone and default currency, reminder time, SMS auto-post mode.
    - Full sovereignty over user financial data (full JSON/CSV export and import, see Section 6).
- **Deployment**: Docker Compose (`web`, `worker`, `postgres`). Required environment variables: `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY` (32-byte key for AES-256-GCM), `APP_URL`, VAPID keys; optional: `CRON_SECRET`, `ALLOW_REGISTRATION`, OAuth credentials. A README must cover first-run, backup (`pg_dump`) and upgrades.

---

## 2. CROSS-CUTTING CONVENTIONS (APPLY EVERYWHERE)

### 2.1 Money & Rounding

- **All monetary amounts are integers in minor units** (e.g., LKR 1,250.50 → `125050`). Postgres `BIGINT`, Dexie `number` (asserted `Number.isSafeInteger`), API `number`/`bigint` via superjson. Formatting to decimals happens only at the UI edge using the ISO 4217 exponent.
- Field naming: every money field is suffixed `Minor` (e.g., `amountMinor`, `creditLimitMinor`).
- **Rates are stored as basis points** (1 bp = 0.01%): 12.75% → `1275`, 5% → `500`. Field suffix `Bps`.
- **Rounding rule**: every computed money value is rounded **half-up to the minor unit at the moment it is posted** (interest, EMI, installment split). Sums are never re-rounded. Remainders are absorbed by the **final** period (final installment, final EMI) so totals always reconcile exactly.
- **Single currency in v1**: every account/transaction in a household uses the user's `defaultCurrency`. `currency` fields are kept for forward compatibility but validated to equal `defaultCurrency`. No FX conversion in v1.
- Money values are never taken on trust from the LLM: amounts are parsed to integer minor units and validated (Subsystem 1).

### 2.2 Time & Timezone

- Instants (`transactionDate`, `createdAt`, `receivedAt`, …) are stored in UTC.
- **Calendar dates** (`startDate`, `maturityDate`, statement cutoffs, due dates, month boundaries) are evaluated in the **user's timezone** (`User.timezone`, default `Asia/Colombo`). Date-only fields are stored as `DATE` (`YYYY-MM-DD`).
- **Short months**: an effective cutoff/due day is `min(configuredDay, lastDayOfThatMonth)` (e.g., day 31 → Feb 28/29).
- A billing cycle is the half-open range `(previousCutoffEndOfDay, thisCutoffEndOfDay]` in the user's timezone: a transaction dated on the cutoff day belongs to the cycle ending that day.

### 2.3 Ledger Semantics (Single Source of Truth)

**Account balances are never stored as authoritative data.** They are derived from the ledger:

```
balance(account, t) = openingBalanceMinor
                    + Σ ledgerEffect(tx) for non-deleted tx where tx.excludeFromBalance = false and tx.transactionDate ≤ t
```

`ledgerEffect` (all `amountMinor` values are positive; direction comes from the type):

| `type`       | Effect on `accountId`                    | Effect on `toAccountId`  |
| ------------ | ---------------------------------------- | ------------------------ |
| `EXPENSE`    | −amount                                  | —                        |
| `INCOME`     | +amount                                  | —                        |
| `REFUND`     | +amount                                  | —                        |
| `TRANSFER`   | −amount (source)                         | +amount (destination)    |
| `ADJUSTMENT` | `direction = IN` → +amount, `OUT` → −amount | —                     |

- **Credit card sign convention**: a `CREDIT_CARD` account uses the same signed ledger, so its `balance` is **≤ 0 while money is owed**. `Outstanding Debt = max(0, −balance)`. A positive card balance means the card is overpaid (a credit).
- `Account.balanceCacheMinor` (and any cached `remainingPrincipal`, `paidInstallments`, `carriedOverBalance`, etc.) are **recomputable caches only**. They are **not synced** as source of truth; the client recomputes from local transactions and the server recomputes from the ledger. A mismatch is resolved by recomputation, never by merging.
- **Calibration baseline**: calibration is an ordinary `ADJUSTMENT` transaction, so derived balances remain consistent with no special case.

### 2.4 Transaction Flag Semantics (precisely defined)

| Flag                  | Meaning                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `excludeFromBalance`  | The row does not affect the account balance. Used **only** when a card swipe is converted into an installment plan (principal moves to `Blocked Principal`). |
| `excludeFromStats`    | The row is omitted from income/expense totals and category analytics. `TRANSFER` rows are **implicitly** excluded from stats (no flag required). |
| `excludeFromBudget`   | The row is omitted from budget "spent" totals.                                                                                  |

- **Net worth never depends on stats flags**: it is computed from balances (Section 5, Net Worth widget).
- `ADJUSTMENT` (balance calibration) rows set `excludeFromBudget = true` and `excludeFromStats = true`; they appear in the cashflow view as a separate **"Adjustments"** line (so cashflow tracking is preserved without distorting income/expense totals or budgets).
- **Refunds** (`REFUND`): reduce category spending (stats and budget, unless the original is excluded) in the month the refund is dated. Historical months are not rewritten.
- **Splits**: when `isSplit = true`, the parent `categoryId` is `null` and analytics/budgets use `TransactionSplitItem` rows. The sum of split items must equal the parent `amountMinor` exactly.
- `type`/`subType` mapping from SMS channels is defined in the table in Subsystem 1.

### 2.5 Edit & Delete Rules

- **Deletes are soft deletes** (`deletedAt` tombstone), retained so sync can propagate them. Balances and caches recompute immediately.
- Deleting a transaction cascades to: its `TransactionSplitItem` rows, its auto-created fee child (`feeTransactionId`) with a confirmation prompt, and unlinks (not deletes) any `BankSms` row, which returns to `NEEDS_REVIEW`.
- **System-generated installment transactions** (`CC_INSTALLMENT` with `installmentPlanId`) cannot be deleted directly; the user cancels or edits the plan, which regenerates the affected future entries.
- Editing `transactionDate`, `amountMinor` or `accountId` recomputes balances, billing-cycle membership and budget totals. Editing a transaction that is part of a `LoanPayment` triggers schedule re-evaluation.
- Reversal chains (`reversalOfTransactionId`): deleting the original while a reversal exists requires deleting/unlinking the reversal first.
- All edits are last-write-wins per record (Section 2.6) and audit-stamped with `updatedAt` and `updatedByUserId`.

### 2.6 Offline Sync Protocol

- **Every synced entity** carries: `createdAt`, `updatedAt` (server-assigned on write), `deletedAt` (nullable tombstone), and `serverSeq` (BIGINT drawn from a single Postgres sequence on every write). These are not repeated in each model below.
- **Push**: client sends batches of outbox mutations `{ mutationId, entity, op: CREATE|UPDATE|DELETE, id, payload }`. `mutationId` makes retries idempotent. The server authorizes **each mutation individually** against the member's role, applies it, and returns per-mutation `accepted | rejected(reason)`. Rejected mutations stay visible in the UI for resolution.
- **Pull**: client sends its `cursor` (last seen `serverSeq`) and receives all visible rows with `serverSeq > cursor`, including tombstones, then stores the new cursor. **Client clocks are never used for ordering.**
- **Conflict policy**: per-record last-write-wins on server arrival order. Ledger rows are append/edit-only, so true conflicts are rare.
- **Client-only state** (not a server column): per-row pending/failed sync status is derived from the `outbox` store, not stored on `Transaction`.
- **Role sanitization** is applied on pull (see Section 3.A matrix and Subsystem 6).

### 2.7 Deterministic IDs & Idempotency

Anything generated by the system (not typed by a user) uses UUIDv5 over a stable name so duplicate generation is impossible:

- Installment transaction: `uuid5(planId + ":" + cycleEndDate)`.
- Credit card statement snapshot: `uuid5(accountId + ":" + cycleEndDate)`.
- Budget month snapshot: `uuid5(budgetId + ":" + yyyy-mm)`.
- FD payout: `uuid5(fixedDepositId + ":" + periodEndDate)`.
- `BankSms.dedupeKey`: `sha256(userId + sender + receivedAt + rawMessage)` with a unique index.

All scheduled jobs are **catch-up style**: each run processes _every_ period that is due up to "now" for each entity, so missed days (worker down, external cron missed) are harmless. A catch-up also runs server-side, guarded by a Postgres advisory lock, when a user authenticates and syncs.

---

## 3. DATABASE SCHEMA SPECIFICATIONS (Prisma & Dexie)

Design the models with strict relational integrity. Common synced fields (Section 2.6) are implied on all synced models. Money fields are `*Minor` integers; rates are `*Bps`.

### A. Users & Household Sharing

- `User`:
  - `id`: String (UUIDv4).
  - `name`: String.
  - `email`: String (unique).
  - `passwordHash`: String (nullable when OAuth-only).
  - `defaultCurrency`: String (default: "LKR").
  - `timezone`: String (default: "Asia/Colombo").
  - `countryCode`: String (nullable; default source for tax defaults).
  - `defaultWithholdingTaxRateBps`: Integer (default: 0; user-configured, **no hard-coded country rate**).
  - `apiKeyHash`: String (hash of the webhook key) and `apiKeyPrefix`: String (for lookup/display).
  - `geminiApiKeyEncrypted`: String (nullable; AES-256-GCM with `APP_ENCRYPTION_KEY`, versioned prefix to allow key rotation).
  - `geminiModel`: String (nullable; overrides the default model).
  - `smsAutoPostMode`: `AUTO_VALIDATED` (default) | `ALWAYS_REVIEW_GEMINI`.
  - `createdAt`: DateTime.
- `Household`:
  - `id`: String (UUIDv4).
  - `name`: String.
  - `ownerId`: String (foreign key to `User`).
- `HouseholdMember`:
  - `id`: String (UUIDv4).
  - `householdId`: String.
  - `userId`: String.
  - `role`: `OWNER` | `CO_OWNER` | `CONTRIBUTOR_ADD_ONLY` | `VIEWER`.
  - _Onboarding Flow_: Simple email search. Registered users search for another registered user by email and assign them their role directly (no acceptance step).
  - _Membership management_: members can **leave** a household; the OWNER/CO_OWNER can **remove** members. The OWNER cannot leave without first transferring ownership or deleting the household. When a member leaves or is removed, their locally cached shared data is purged on next sync (tombstone/permission-revoked signal).
  - _Role capability matrix_ (enforced **server-side on every push mutation** and applied on every pull):

    | Capability                                   | OWNER | CO_OWNER | CONTRIBUTOR_ADD_ONLY                | VIEWER |
    | -------------------------------------------- | :---: | :------: | :---------------------------------: | :----: |
    | Read shared accounts (with balances)         |   ✅  |    ✅    | ✅ accounts **without balances**    |   ✅   |
    | Read shared transactions                     |   ✅  |    ✅    | ✅ **only ones they created**       |   ✅   |
    | Create transactions on shared accounts       |   ✅  |    ✅    |               ✅                    |   ❌   |
    | Edit/delete transactions                     |   ✅  |    ✅    | ✅ only their own                   |   ❌   |
    | Read budgets                                 |   ✅  |    ✅    |               ❌                    |   ✅   |
    | Read/write shared FDs & Loans                |   ✅  |    ✅    |               ❌ (never synced)     | read-only ✅ |
    | Manage members / household settings          |   ✅  | ✅ (no OWNER changes) |    ❌                    |   ❌   |

  - _Why contributors only see their own transactions_: if a contributor received all transactions plus the opening balance, they could re-derive the balance. They therefore never receive `openingBalanceMinor`, other members' transactions, or any cached balance, so IndexedDB never holds sensitive balances.

### B. Accounts & Credit Card Cycles

- `Account`:
  - `id`: String (UUIDv4).
  - `userId`: String (creator/owner of the record).
  - `householdId`: String (nullable, if shared).
  - `name`: String.
  - `type`: `CASH` | `BANK_SAVINGS` | `CREDIT_CARD`.
  - `openingBalanceMinor`: Integer (signed; the ledger baseline; for credit cards ≤ 0 means debt at tracking start).
  - `balanceCacheMinor`: Integer (nullable, **derived cache, not authoritative, not synced**).
  - `currency`: String (default: "LKR"; must equal `defaultCurrency` in v1).
  - `accountNumberLast4`: String (nullable, used for bank SMS auto-matching).
  - `bankSenderIds`: String[] (e.g., `["COMBANK"]`; combined with `accountNumberLast4` to resolve SMS → account, because last-4 digits can collide across banks).
  - `accessScope`: `PRIVATE` | `SHARED_HOUSEHOLD`.
  - `feeRules`: JSON column for transaction fees (minor units):
    ```json
    { "ownAtmFeeMinor": 500, "otherAtmFeeMinor": 2500, "smsMonthlyFeeMinor": 5000 }
    ```
  - **Credit Card Specific Fields**:
    - `creditLimitMinor`: Integer.
    - `statementCutoffDay`: Integer (1-31, e.g., 20th of the month; effective day clamps per Section 2.2).
    - `paymentDueDay`: Integer (1-31, e.g., 10th of next month; clamps likewise).
    - `linkedSettlementAccountId`: Nullable relation to a `BANK_SAVINGS` account for 1-tap bill settlements.
- `CreditCardStatement` (scheduler-generated snapshot, deterministic ID):
  - `id`: String (UUIDv5, Section 2.7).
  - `accountId`: String.
  - `cycleStart` / `cycleEnd`: Date.
  - `dueDate`: Date.
  - `statementBalanceMinor`: Integer (debt at cutoff).
  - Used for history/alerts only; live **Billed Due** is always recomputed (Subsystem 2).

### C. Credit Card 0% Installment Schemes (EMI Plans)

- `CreditCardInstallmentPlan`:
  - `id`: String (UUIDv4).
  - `accountId`: String (Foreign key to `Account` where `type = CREDIT_CARD`).
  - `userId`: String.
  - `categoryId`: String (category applied to every generated installment; defaults to the original transaction's category on conversion).
  - `merchantName`: String (e.g., "Abans", "Singer", "Dialog Axiata", "Apple Store").
  - `totalAmountMinor`: Integer (total purchase amount converted to the 0% scheme).
  - `tenureMonths`: Integer (e.g., 3, 6, 12, 18, 24, 36 months).
  - `monthlyAmountMinor`: Integer (`floor(totalAmountMinor / tenureMonths)`).
  - `finalInstallmentAmountMinor`: Integer (`totalAmountMinor − monthlyAmountMinor × (tenureMonths − 1)`, absorbing any rounding remainder; user-overridable to match the bank's schedule).
  - `initialPaidInstallments`: Integer (default: 0; count already paid **before tracking started** when onboarding an in-progress plan).
  - `processingFeeMinor`: Integer (default: 0 — one-off bank handling fee, e.g., 250000).
  - `processingFeeBilled`: Boolean (default: false; for ongoing onboarding the user states whether the fee was already charged).
  - `startDate`: Date.
  - `firstStatementDate`: Date (cutoff on which installment #1 (or the next unpaid one, for ongoing plans) is billed).
  - `isOngoingSetup`: Boolean (default: false).
  - `status`: `ACTIVE` | `COMPLETED` | `CANCELLED`.
  - `originalTransactionId`: Nullable foreign key to `Transaction` (links the plan if converted from an existing POS/online swipe).
  - `note`: String (nullable).
  - **Derived (never stored as truth)**:
    - `paidInstallments = initialPaidInstallments + count(non-deleted CC_INSTALLMENT tx of this plan)`
    - `remainingInstallments = tenureMonths − paidInstallments`
    - `remainingPrincipalMinor = totalAmountMinor − (initialPaidInstallments × monthlyAmountMinor) − Σ amount of generated installments`
    - `nextStatementDate` = the next effective cutoff after the last billed one.

### D. Transactions, Splits, & Templates

- `Transaction`:
  - `id`: String (UUIDv4, or UUIDv5 for system-generated rows).
  - `accountId`: String (primary account; the **source** for `TRANSFER`).
  - `toAccountId`: String (nullable; **destination, `TRANSFER` only**).
  - `categoryId`: String (nullable: `TRANSFER` and split parents have no category).
  - `amountMinor`: Integer (always positive).
  - `direction`: `IN` | `OUT` (required **only** for `ADJUSTMENT`; derived from `type` otherwise).
  - `type`: `EXPENSE` | `INCOME` | `TRANSFER` | `REFUND` | `ADJUSTMENT`.
  - `subType`: `POS` | `ONLINE` | `BILL_PAYMENT` | `ATM_WITHDRAWAL` | `FEE` | `DEPOSIT` | `EMI_PAYMENT` | `CC_SETTLEMENT` | `CC_INSTALLMENT` | `CC_INSTALLMENT_PAYOFF` | `LOAN_DISBURSEMENT` | `FD_PLACEMENT` | `FD_MATURITY` | `FD_INTEREST` | `BALANCE_CALIBRATION` (nullable for plain manual entries).
  - `source`: `MANUAL` | `SMS` | `SYSTEM` (scheduler-generated) | `CALIBRATION`.
  - `createdByUserId`: String (attribution; drives the contributor visibility rule).
  - `updatedByUserId`: String.
  - `transactionDate`: DateTime (UTC instant).
  - `note`: String (nullable).
  - `isSplit`: Boolean (default: false).
  - `excludeFromBudget`: Boolean (default: false).
  - `excludeFromStats`: Boolean (default: false).
  - `excludeFromBalance`: Boolean (default: false — see Section 2.4).
  - `installmentPlanId`: Nullable foreign key linking to `CreditCardInstallmentPlan`.
  - `fixedDepositId`: Nullable foreign key to `FixedDeposit` (for `FD_*` rows).
  - `loanId`: Nullable foreign key to `Loan` (for `EMI_PAYMENT` / `LOAN_DISBURSEMENT` rows).
  - `feeTransactionId`: Self-referential nullable ID (links an auto-applied ATM fee to its parent withdrawal).
  - `reversalOfTransactionId`: Self-referential nullable ID (links a refund/reversal to the original debit).
  - `possibleDuplicateOfTransactionId`: Self-referential nullable ID (set by the reverse-dedup check; drives the "Possible duplicate — merge?" prompt).
  - `localCreatedAt`: DateTime.
- `TransactionSplitItem`:
  - `id`: String (UUIDv4).
  - `transactionId`: String.
  - `categoryId`: String.
  - `amountMinor`: Integer.
  - `note`: String (nullable).
- `Category`:
  - `id`: String (UUIDv4).
  - `userId`: String (nullable, null for system defaults).
  - `householdId`: String (nullable).
  - `name`: String (e.g., "Groceries", "Dining", "Fuel & Transport", "Utilities & Bills", "Healthcare", "Shopping", "Bank Fees", "Cash Withdrawal", "Salary", "Investment Yield", "Loan Principal", "Balance Calibration").
  - `icon`: String.
  - `color`: String.
- `TransactionTemplate` (Bookmarks):
  - `id`: String (UUIDv4).
  - `userId`: String.
  - `name`: String (e.g., "Keells Groceries", "Morning Milk", "Petrol Keells").
  - `accountId`: String.
  - `categoryId`: String.
  - `defaultAmountMinor`: Integer (nullable).
  - `note`: String (nullable).
  - `icon`: String.
- `PushSubscription` (server-only, not synced): `id`, `userId`, `endpoint`, `p256dh`, `auth`, `createdAt`.

### E. Bank SMS Archival & Processing Logs

- `BankSms`:
  - `id`: String (UUIDv4).
  - `userId`: String.
  - `dedupeKey`: String (**unique**; see Section 2.7 — retried webhooks never duplicate).
  - `sender`: String (e.g., "COMBANK", "SAMPATH", "HNB", "NTB", "BOC").
  - `rawMessage`: String (verbatim SMS content; never written to application logs).
  - `receivedAt`: DateTime.
  - `status`: `PENDING` | `PROCESSED` | `NEEDS_REVIEW` | `IGNORED_NON_TX` | `DUPLICATE` | `FAILED`.
  - `parseMethod`: `TEMPLATE` | `GEMINI` (nullable until parsed).
  - `parsedPayload`: JSON (validated DTO from the template parser or Gemini).
  - `reviewReason`: `ACCOUNT_UNMATCHED` | `LOW_CONFIDENCE` | `VALIDATION_FAILED` | `NO_GEMINI_KEY` | `POSSIBLE_DUPLICATE` (nullable).
  - `attempts`: Integer (default 0) and `nextRetryAt`: DateTime (nullable) for queue retries.
  - `transactionId`: Nullable relation to created or merged `Transaction`.
  - `failureReason`: String (nullable).
  - `createdAt`: DateTime.

### F. Smart Budgets with Rollover

- `Budget`:
  - `id`: String (UUIDv4).
  - `userId`: String (nullable) and `householdId`: String (nullable) — **exactly one** must be set (personal vs household budget).
  - `categoryId`: String.
  - `monthlyLimitMinor`: Integer (changes take effect from the current month; closed months keep their snapshot).
  - `enableRollover`: Boolean.
  - `rolloverStartMonth`: String (`YYYY-MM`; first month the rollover chain begins).
- `BudgetMonthSnapshot` (scheduler-generated at month close, deterministic ID):
  - `id`: String (UUIDv5), `budgetId`, `month` (`YYYY-MM`), `limitMinor`, `carriedInMinor`, `spentMinor`, `closedAt`.
  - `carriedOver` is **derived**: `carriedIn(M) = limit(M−1) + carriedIn(M−1) − spent(M−1)` when rollover is enabled, read from snapshots for closed months and computed live for the current month. If a back-dated transaction changes a closed month, the affected snapshots are recomputed.

### G. Investments (Fixed Deposits - FDs)

Fixed Deposits are modeled as dedicated **Investment Options** (shown in the "Fixed Deposits" section of the **Accounts** tab), rather than transactional accounts:

- `FixedDeposit`:
  - `id`: String (UUIDv4).
  - `userId`: String.
  - `householdId`: String (nullable, like `Account`).
  - `bankName`: String.
  - `accountNumber`: String.
  - `principalAmountMinor`: Integer.
  - `annualInterestRateBps`: Integer (APR).
  - `tenureMonths`: Integer.
  - `startDate`: Date.
  - `maturityDate`: Date.
  - `compoundingFrequency`: `MONTHLY` | `QUARTERLY` | `ANNUALLY` | `AT_MATURITY`.
  - `payoutMode`: `REINVEST_COMPOUND` | `MONTHLY_PAYOUT_TO_ACCOUNT`.
  - `linkedPayoutAccountId`: Nullable relation to `Account` (`BANK_SAVINGS`) for monthly interest payouts or maturity proceeds.
  - `fundingAccountId`: Nullable relation to `Account` (records the `FD_PLACEMENT` outflow when the FD is opened from a tracked account).
  - `withholdingTaxRateBps`: Integer (defaults from `User.defaultWithholdingTaxRateBps`; editable per FD).
  - `autoRenew`: Boolean.
  - `status`: `ACTIVE` | `MATURED` | `CLOSED`.
  - `closedAt`: Date (nullable) and `prematureClosure`: Boolean (default false; user enters the actual proceeds when closing early).
- `FixedDepositPayout` (deterministic ID):
  - `id`: String (UUIDv5), `fixedDepositId`, `periodEnd`: Date, `grossInterestMinor`, `taxWithheldMinor`, `netInterestMinor`, `transactionId` (the `FD_INTEREST` INCOME row).

### H. Liabilities (Loans & Leases)

- `Loan`:
  - `id`: String (UUIDv4).
  - `userId`: String.
  - `householdId`: String (nullable, like `Account`).
  - `kind`: `LOAN` | `LEASE`.
  - `lenderName`: String.
  - `originalPrincipalMinor`: Integer (for a lease: the financed amount).
  - `residualValueMinor`: Integer (nullable, `LEASE` only: balloon/buy-out amount due at the end).
  - `annualInterestRateBps`: Integer.
  - `tenureMonths`: Integer.
  - `startDate`: Date.
  - `monthlyEmiAmountMinor`: Integer.
  - `calculationType`: `REDUCING_BALANCE` | `FLAT_RATE`.
  - `linkedDisbursementAccountId`: Nullable ID (records `LOAN_DISBURSEMENT`, excluded from stats).
  - `status`: `ACTIVE` | `CLOSED`.
  - **Derived**: `remainingPrincipalMinor = originalPrincipalMinor − Σ principalComponent`.
- `LoanScheduleEntry` (stored amortization schedule, regenerated on extra principal or term change; rows are user-editable so interest can be aligned to the lender's statement):
  - `id`, `loanId`, `dueDate`, `installmentNumber`, `principalComponentMinor`, `interestComponentMinor`, `openingBalanceMinor`, `closingBalanceMinor`, `status`: `SCHEDULED` | `PAID` | `OVERRIDDEN`.
- `LoanPayment`:
  - `id`: String (UUIDv4).
  - `loanId`: String.
  - `transactionId`: String.
  - `scheduleEntryId`: String (nullable; null for extra-principal payments).
  - `principalComponentMinor`: Integer.
  - `interestComponentMinor`: Integer.
  - `isExtraPrincipal`: Boolean (default: false).
  - `paymentDate`: DateTime.

---

## 4. CORE SUBSYSTEM WORKFLOWS & BUSINESS LOGIC

### Subsystem 1: Bank SMS Pipeline — Ingest, Parse (Template → Gemini) & Transaction Ingestion Service

```
+-----------------------------------------------------------------------------------+
| 1. Webhook Ingress (Apple Shortcuts / POST /api/v1/webhooks/sms-ingress)          |
|    - Authenticate via x-api-key (hash lookup), rate-limit per key                 |
|    - Compute dedupeKey; INSERT BankSms(status:'PENDING') (unique -> idempotent)   |
|    - Enqueue pg-boss job, respond 202 immediately (no Gemini latency in request)  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 2. Parse Step (worker)                                                            |
|    a. Deterministic template parser for known banks (sender-based regex/templates)|
|    b. No template match -> Gemini fallback (user's own key, BankSmsSchema)        |
|       (no key -> NEEDS_REVIEW / NO_GEMINI_KEY)                                    |
|    c. Validation gate (amount, currency, timestamp sanity, account resolvable)    |
|    - Non-transactional (OTP/Spam) -> status 'IGNORED_NON_TX'                      |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 3. Transaction Ingestion Service (TransactionIngestionService.process(dto))       |
|    - Resolves Account via sender + accountLast4 & Category mapping                |
|    - Auto-Match & De-duplication against manual entries (±2 hours, one-to-one)    |
|    - Routes and saves to DB based on intent (see mapping table)                   |
|    - Compares balanceAfter -> raises "balance mismatch" hint only (never adjusts) |
|    - Updates BankSms(status:'PROCESSED', transactionId: tx.id) or NEEDS_REVIEW    |
+-----------------------------------------------------------------------------------+
```

#### Step 1: Ingestion & Raw DB Archival

1. **Endpoint**: `POST /api/v1/webhooks/sms-ingress` authenticated via header `x-api-key` (looked up by prefix, verified against `apiKeyHash`), rate-limited per key.
2. **Payload**: `{ "rawSms": string, "sender": string, "receivedAt": string }`, validated with Zod (max length, ISO timestamp).
3. **Immediate Persistence**: the raw SMS is saved to `BankSms` with `status: "PENDING"` and the unique `dedupeKey`. A duplicate delivery returns `200 { "status": "DUPLICATE" }` and creates nothing.
4. The endpoint responds `202` once persisted and queued; parsing runs in the worker with retry/backoff (`attempts`, `nextRetryAt`).

#### Step 2: Parsing (Template first, Gemini fallback)

1. **Template parser**: a registry of per-bank templates (sender + regex set) for the supported Sri Lankan banks, covered by a fixture corpus of real (anonymized) messages. A template match yields the DTO deterministically (`parseMethod: TEMPLATE`).
2. **Gemini fallback**: only when no template matches **and** the user has configured a `geminiApiKey`. Uses `@google/genai` with the user's key and model setting (default `gemini-2.5-flash`).
   - The SMS text is treated strictly as **data**: it is passed as a delimited user-content field, the model has no tools, and the output is constrained to the schema, so instructions embedded in an SMS cannot trigger actions.
   - Before sending, full card/account numbers beyond the last 4 digits are masked.
3. **Validation gate** (applies to both parsers): `amountMinor` is a positive safe integer; `currency` equals the account/user currency; `transactionTimestamp` is not more than 24 h in the future; the account resolves via `sender + accountLast4`; any model `confidence` must be `HIGH`.
4. **Posting policy** (`User.smsAutoPostMode`):
   - `AUTO_VALIDATED` (default): template-parsed messages that pass validation are auto-posted; Gemini-parsed messages are auto-posted only if validation passes **and** confidence is `HIGH`.
   - `ALWAYS_REVIEW_GEMINI`: every Gemini-parsed message waits in the review inbox.
   - Anything failing validation, unmatched accounts, low confidence, or no key → `status: "NEEDS_REVIEW"` with a `reviewReason`; the user confirms/edits in the **SMS review inbox** before it posts.

```typescript
import { z } from "zod";

export const BankSmsSchema = z.object({
  isTransaction: z
    .boolean()
    .describe(
      "False if OTP, promotion, balance inquiry alert, or login notice. True only if financial debit/credit occurred.",
    ),
  transactionType: z.enum([
    "DEBIT",
    "CREDIT",
    "REFUND_REVERSAL",
    "ATM_WITHDRAWAL",
    "UNKNOWN",
  ]),
  channel: z.enum([
    "ATM_OWN",
    "ATM_OTHER",
    "POS",
    "ONLINE_PURCHASE",
    "ONLINE_TRANSFER",
    "BILL_PAYMENT",
    "BANK_CHARGE",
    "CARD_PAYMENT",
    "SALARY_OR_DEPOSIT",
    "UNKNOWN",
  ]),
  // Amount as a decimal string exactly as printed (e.g. "1,250.50"); the server converts it to integer minor units.
  amountText: z.string().nullable(),
  currency: z.string().default("LKR"),
  accountLast4: z
    .string()
    .nullable()
    .describe("Last 3 or 4 digits of card or account mentioned in SMS"),
  merchantOrEntity: z
    .string()
    .nullable()
    .describe("Merchant name, beneficiary, or transfer party"),
  inferredCategory: z
    .string()
    .nullable()
    .describe(
      "e.g. Groceries, Fuel, Dining, Utilities, Healthcare, Bank Charges, Cash Withdrawal, Salary, Investment",
    ),
  balanceAfterText: z
    .string()
    .nullable()
    .describe("Remaining account balance if stated in SMS, exactly as printed"),
  transactionTimestamp: z.string().nullable(),
  confidence: z.enum(["HIGH", "LOW"]),
});

export type ParsedTransactionPayload = z.infer<typeof BankSmsSchema>;
```

- If `!isTransaction`: update `BankSms` with `status: "IGNORED_NON_TX"` and return/record `{ "status": "IGNORED", "reason": "Non-transactional message" }`.
- If `isTransaction`: save `parsedPayload` into `BankSms`, run the validation gate, and pass accepted messages to `TransactionIngestionService`.

#### Step 3: Transaction Ingestion Service (`TransactionIngestionService`)

Receives `(payload: ParsedTransactionPayload, userId: string)` and executes:

1. **Account Resolution**:
   - Matches `sender` (against `Account.bankSenderIds`) **and** `accountLast4` to the user's active `Account` (`type`: `BANK_SAVINGS` or `CREDIT_CARD`).
   - If no account matches (or more than one does), sets `NEEDS_REVIEW / ACCOUNT_UNMATCHED` for manual linking while preserving the SMS log.

2. **Auto-Match & Deduplication (Manual Quick-Add ↔ Bank SMS, both directions)**:
   - **SMS arrives after a manual entry**: query recent unlinked transactions on the resolved account where `amountMinor === payload amount` and `transactionDate` is within ±2 hours of the SMS time. Candidates are matched **one-to-one**, nearest in time first.
     - **If a match is found**: link the SMS to the existing `Transaction` (`bankSms.transactionId = matchedTx.id`), enrich the note with verified merchant/reference info if the existing note was generic, and do **not** create a duplicate.
   - **Manual entry arrives after the SMS already created a transaction** (the reverse order): when a manual `Transaction` is pushed through sync, the server looks for an unlinked `source = SMS` transaction with the same account/amount within ±2 hours. If found, it sets `possibleDuplicateOfTransactionId` on the manual row and the UI shows a **"Possible duplicate — merge?"** prompt. On merge, the SMS-originated row is kept (it holds the verified data), the user's note/category are copied onto it, and the manual row is soft-deleted. It is never merged silently.
   - **If no match is found**: proceed to create a new transaction.

3. **Categorized Action Routing** (channel → ledger mapping):

   | `channel`           | `type` / `subType`                                     | Notes                                                                              |
   | ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
   | `POS`               | `EXPENSE` / `POS`                                      | Cards: lowers (more negative) the card balance.                                    |
   | `ONLINE_PURCHASE`   | `EXPENSE` / `ONLINE`                                   |                                                                                    |
   | `ONLINE_TRANSFER`   | `EXPENSE` / `ONLINE`                                   | Outbound transfer to a third party; recorded as an expense.                        |
   | `BILL_PAYMENT`      | `EXPENSE` / `BILL_PAYMENT`                             |                                                                                    |
   | `ATM_OWN`/`ATM_OTHER` | `TRANSFER` / `ATM_WITHDRAWAL` (bank → Cash wallet)   | Plus optional fee child (below). Net worth unchanged by the transfer itself.       |
   | `BANK_CHARGE`       | `EXPENSE` / `FEE` (category "Bank Fees")               | Links to an existing auto-created ATM fee if one matches (below).                  |
   | `CARD_PAYMENT`      | `TRANSFER` / `CC_SETTLEMENT` (bank → matching card)    | Only when the card resolves; otherwise `NEEDS_REVIEW`.                             |
   | `SALARY_OR_DEPOSIT` | `INCOME` / `DEPOSIT`                                   | Credits the account.                                                                |
   | `REFUND_REVERSAL`   | `REFUND`                                               | Queries a recent debit matching amount + `merchantOrEntity`, links `reversalOfTransactionId`; restores balance/available credit. |

   - **B. ATM Fee Rule Engine**:
     - If `channel === "ATM_OTHER"` and the account has `otherAtmFeeMinor > 0` (e.g., LKR 25.00), create a linked child `Transaction`: `type: "EXPENSE"`, `subType: "FEE"`, category "Bank Fees", linked via `feeTransactionId`.
     - If `channel === "ATM_OWN"` and the account has `ownAtmFeeMinor > 0` (e.g., LKR 5.00), apply the `ownAtmFee` child likewise.
     - **Fee-SMS dedupe**: if the bank later sends a separate `BANK_CHARGE` SMS whose amount matches an existing auto-created fee child within 24 h of its parent, link the SMS to that fee instead of creating a second fee.

4. **Balance Mismatch Hint (no auto-adjustment)**:
   - If `balanceAfter` is present, compare it to the ledger-derived balance **only when the SMS is the newest information for that account** (older/out-of-order SMS are ignored for this check).
   - A mismatch **never** creates an adjustment automatically. It raises a non-blocking **"Balance mismatch"** hint on the account prompting the user to run Calibration (Subsystem 7).

5. **Finalize Ingestion Status**:
   - Updates `BankSms`: `status: "PROCESSED"`, `transactionId: createdTx.id` (or `NEEDS_REVIEW` / `DUPLICATE` as applicable).

---

### Subsystem 2: Credit Card Statement, Settlement & 0% Installment Engine

#### 1. Statement Cycle Tracking (all derived from the ledger)

- Determine the current billing cycle using `statementCutoffDay` and `paymentDueDay` with the clamping and boundary rules of Section 2.2.
- With `balance` signed per Section 2.3:
  - **Outstanding Debt (now)** = `max(0, −balance(now))`.
  - **Debt at Cutoff** = `max(0, −balance(lastCutoffEndOfDay))`.
  - **Payments Since Cutoff** = sum of `CC_SETTLEMENT` credits into the card after the last cutoff.
  - **Billed Balance (Due)** = `max(0, Debt at Cutoff − Payments Since Cutoff)` (payments are applied **FIFO**, oldest statement first).
  - **Unbilled Balance (Current Spend)** = `Outstanding Debt − Billed Balance` (an over-payment therefore reduces unbilled spend / produces a card credit).
- Installment slices billed into the cycle are ordinary `CC_INSTALLMENT` transactions, so they are already inside Debt at Cutoff.
- The scheduler writes a `CreditCardStatement` snapshot at each cutoff for history and due-date alerts; live values are always recomputed.

#### 2. Credit Card 0% Installment Schemes (EMI Plans)

- Strictly linked to a specific credit card account (`accountId` where `type = CREDIT_CARD`).
- **Setup Modes**:
  - **A. Ongoing Plan Onboarding**: User enters `merchantName`, `monthlyAmount`, `tenureMonths`, `initialPaidInstallments`, `firstStatementDate` (and, if known, the final installment amount and whether the processing fee was already charged). `remainingInstallments`/`remainingPrincipal` are **derived**, and the remaining principal is held in `Blocked Principal`.
  - **B. Brand New Plan**: `initialPaidInstallments = 0`, `startDate = today`. The `processingFeeMinor`, if any, is posted immediately as a single `EXPENSE` / `FEE` transaction on the card (category "Bank Fees").
  - **C. Conversion from Existing Swipe**:
    - User taps "Convert to 0% Installment" on an existing `POS` or `ONLINE` card transaction.
    - **Balance Transition Invariant**: the original transaction is marked `excludeFromBalance: true` **and** `excludeFromStats: true`. Its principal leaves the card ledger balance and is held exclusively in `Blocked Principal`, preventing double credit-limit deduction.
    - **Spend recognition**: the purchase is recognized in stats/budgets **month-by-month through the generated installments** (each installment is a normal `EXPENSE` in the plan's `categoryId`, `excludeFromBudget = false` by default), never as a lump sum.
    - If the plan is `CANCELLED` before completion, the original swipe is restored (`excludeFromBalance`/`excludeFromStats` back to `false`) so the debt returns to the ledger; any installments already billed stay as posted.
- **Credit Limit Blocking**:
  $$\text{Blocked Principal} = \text{remainingPrincipalMinor (of ACTIVE plans)}$$
  $$\text{Available Credit} = \text{creditLimitMinor} - \text{Outstanding Debt} - \text{Blocked Principal}$$
  (`Outstanding Debt` already contains billed and unbilled spend; as each installment is billed, principal moves from Blocked Principal into the ledger balance, so nothing is double counted.)
- **Automated Statement Addition Trigger** (server-side only):
  - The `worker` (or `POST /api/v1/cron/tick` with `CRON_SECRET`) runs a catch-up job: for every `ACTIVE` plan, for **every** cutoff date up to now that has no installment yet, inject that cycle's installment with the deterministic ID `uuid5(planId + ":" + cycleEndDate)`:
    ```typescript
    Transaction({
      id: uuidv5(`${plan.id}:${cycleEnd}`),
      accountId: plan.accountId,
      categoryId: plan.categoryId,
      amountMinor: isFinal ? plan.finalInstallmentAmountMinor : plan.monthlyAmountMinor,
      type: "EXPENSE",
      subType: "CC_INSTALLMENT",
      source: "SYSTEM",
      installmentPlanId: plan.id,
      note: `${plan.merchantName} (Installment ${paidInstallments + 1} of ${plan.tenureMonths})`,
      transactionDate: cycleEnd,
    })
    ```
  - Clients never generate installments; they simply pull them. Re-running the job is a no-op because the deterministic ID already exists.
  - When the derived `remainingInstallments` reaches 0 the plan is marked `COMPLETED`.
- **Early Payoff** (the "Early Payoff" action):
  - User confirms the payoff amount (default: `remainingPrincipalMinor`, plus an optional early-settlement fee entered by the user).
  - Posts one `CC_INSTALLMENT_PAYOFF` `EXPENSE` transaction on the card dated today (category = plan category) for the remaining principal, plus an optional `FEE` row, then marks the plan `COMPLETED`. Blocked Principal drops to 0 and the debt now sits in the ledger to be settled normally.

#### 3. 1-Tap Bill Settlement Flow

- User clicks "Settle Credit Card Bill".
- Displays quick payment chips:
  1. **Full Billed Balance (Due)** (Default 1-tap option).
  2. **Total Outstanding Balance** (Billed + Unbilled).
  3. **Custom Amount** (editable input).
- User selects the payment source (`BANK_SAVINGS`), defaulting to `linkedSettlementAccountId`.
- Generates a single `TRANSFER` / `CC_SETTLEMENT` transaction (`accountId` = bank, `toAccountId` = card):
  - Decreases Bank Savings balance and increases (toward zero) the card balance, restoring Available Credit.
  - Transfers are implicitly excluded from income/expense stats, so card purchases are never double counted.
  - Payments are applied FIFO to the oldest unpaid statement balance (Section 4, Subsystem 2.1).

---

### Subsystem 3: Transaction Entry UI & Embedded Calculator Keypad

1. **Embedded Keypad**:
   - Replaces the standard mobile system keyboard with an integrated numeric keypad containing arithmetic operators (`+`, `-`, `×`, `÷`, `=`).
   - Supports live formula evaluation (e.g., `1250 + 450 + 80`) before saving. Evaluation uses a safe parser (no `eval`) and converts the result to integer minor units with the half-up rule.
2. **Multi-Category Splitting**:
   - "Split Transaction" toggle. The sum of split items must strictly equal the total amount; the parent category is cleared (Section 2.4).
3. **Transaction Bookmarks (Templates)**:
   - Horizontal chips on the entry sheet pre-populating Account, Category, Note, and Amount.

---

### Subsystem 4: Budget Engine with Symmetric Rollover

1. **Calculation** (all derived from the ledger, Section 2.3 / 2.4):
   - Spent = Σ non-excluded `EXPENSE` (using split items for split parents) − Σ `REFUND` dated in the month, per category.
   - Available Budget = `monthlyLimitMinor + carriedIn`.
   - Safe-to-Spend Daily Burn Rate = `max(0, Available Budget − Current Spent) / Remaining Days in Month (including today, user timezone)`; when overspent the UI shows an "over budget" state instead of a negative rate.
2. **Symmetric Rollover Rules**:
   - If `enableRollover === true` (from `rolloverStartMonth`):
     - **Surplus**: unspent funds carry forward as a positive balance, increasing next month's available budget.
     - **Deficit**: overspending carries forward as a negative balance, reducing next month's available budget for strict accountability.
   - At month close the scheduler writes a `BudgetMonthSnapshot` (deterministic ID) for each budget; the current month is always computed live; snapshots recompute if back-dated edits change a closed month.

---

### Subsystem 5: Investment (FD) & Liability (Loan/Lease) Engines

1. **Fixed Deposit Math & Payouts**:
   - **Opening**: if a `fundingAccountId` is set, an `FD_PLACEMENT` `EXPENSE` is posted on that account (`excludeFromStats` and `excludeFromBudget` true), because the money moves from an account into an asset, not out of net worth.
   - Supports two modes:
     - `REINVEST_COMPOUND`: interest compounds and is paid at maturity: $A = P(1 + r/n)^{nt}$. Withholding tax applies to the accumulated interest at maturity: $\text{net interest} = (A - P)\times(1-\text{withholdingTaxRate})$.
     - `MONTHLY_PAYOUT_TO_ACCOUNT`: monthly interest is paid into the linked `BANK_SAVINGS` account as `INCOME` / `FD_INTEREST` (category "Investment Yield"): $I = P \times \frac{r}{12} \times (1 - \text{withholdingTaxRate})$. Each payout is recorded in `FixedDepositPayout` with gross, tax withheld and net amounts (deterministic ID per period, created by the catch-up scheduler).
   - The withholding tax rate is **configurable per FD** (defaulting from the user's setting) and is applied in **both** modes; nothing is hard-coded to a country.
   - At maturity: if `autoRenew` is false, provide a 1-tap action to deposit maturity proceeds (`FD_MATURITY` `INCOME` of the principal, `excludeFromStats` true, plus the net `FD_INTEREST` income) into the linked savings account.
   - **Premature closure**: the user records the actual proceeds received; the principal portion posts as `FD_MATURITY` (stats-excluded) and any interest difference as `FD_INTEREST`.
   - Net-worth value of an active FD = principal + accrued interest net of withholding tax (accrual computed, not posted).
2. **Loan / Lease Amortization & EMI Payments**:
   - Generates and **stores** the full schedule in `LoanScheduleEntry`:
     - `REDUCING_BALANCE`: $\text{EMI} = \frac{P \cdot r}{1 - (1+r)^{-n}}$ with $r = \text{annualRate}/12$; period interest = `round(openingBalance × r)` (half-up); the **final EMI absorbs the rounding remainder** to clear the balance exactly (for a lease, to the residual value).
     - `FLAT_RATE`: total interest = $P \times \text{rate} \times \text{years}$; EMI = $(P + \text{interest}) / n$; principal and interest are spread evenly with remainders in the final payment.
   - When the user logs an EMI payment from a bank account:
     - Pre-fills the scheduled monthly EMI amount.
     - Auto-calculates the split from the schedule: principal component (reduces the derived `remainingPrincipal`) vs. interest component. A single `EXPENSE` / `EMI_PAYMENT` transaction is posted for the full amount (`excludeFromBudget` defaults to `true`, since the principal is not spending); an **"Interest paid"** report reads `interestComponentMinor` from `LoanPayment`.
     - Allows a toggle for **Extra Principal Payment**: the extra amount reduces principal immediately and the remaining schedule is regenerated (either shorter tenure or lower EMI, user choice).
   - Lender statements can differ slightly (day-count conventions); schedule rows are editable (`OVERRIDDEN`) so users can align interest to the lender.
   - **Disbursement**: if `linkedDisbursementAccountId` is set, an `INCOME` / `LOAN_DISBURSEMENT` row is posted (stats-excluded).
   - **Out of scope for v1**: variable interest rates and payment holidays.

---

### Subsystem 6: Offline-First Synchronization & Client Data Isolation

1. **Client Stores (Dexie.js)**: `accounts`, `transactions`, `transactionSplitItems`, `categories`, `templates`, `budgets`, `budgetMonthSnapshots`, `creditCardInstallmentPlans`, `creditCardStatements`, `bankSmsLogs`, `fixedDeposits`, `fixedDepositPayouts`, `loans`, `loanScheduleEntries`, `loanPayments`, `households`, `householdMembers`, `outbox`, `syncMeta` (stores `cursor`, `lastSyncedAt`, schema version). The database is namespaced per user.
2. **Universal UUIDs**: client generates UUIDv4 IDs; system-generated rows use deterministic UUIDv5 (Section 2.7). IDs are permanently authoritative and never rewritten on sync.
3. **Two-Way Delta Sync Engine** (Section 2.6): push batches idempotently by `mutationId`; pull by `serverSeq > cursor`, including tombstones. Derived balances/caches are recomputed locally from synced ledger rows and are never pushed.
4. **Data Isolation for Scoped Roles** (see the capability matrix in Section 3.A):
   - For a `CONTRIBUTOR_ADD_ONLY` member the server:
     - omits `FixedDeposit`, `Loan`, schedules, payments, budgets and statements;
     - returns shared accounts **without** `openingBalanceMinor` or any balance cache;
     - returns only the transactions that member created.
   - The device therefore never holds sensitive financial balances in local IndexedDB.
   - Every push mutation is re-authorized server-side against the caller's current role; revoked members' mutations are rejected and their cached shared data is purged on next pull.

---

### Subsystem 7: Account Balance Calibration & Reconciliation Engine

Accounts can periodically drift from real-world balances (due to untracked pocket change, bank interest, unrecorded bank charges, cash miscounts, or transactions that took place outside the app). The calibration engine allows users to align any account with reality in 1 tap while preserving a complete financial audit trail:

1. **Calibration Entry Point**:
   - Available directly in the Account Detail View (for `CASH`, `BANK_SAVINGS`, or `CREDIT_CARD`) via a "Calibrate Balance" / "Reconcile" action. It is also offered from the SMS "Balance mismatch" hint (Subsystem 1).
2. **Reconciliation Interface & Logic**:
   - Displays the **Current Computed App Balance** (ledger-derived).
   - User inputs the **Actual / Real Balance** observed in their bank app, statement, or physical wallet.
   - System calculates the delta:
     $$\Delta = \text{Actual Balance} - \text{App Balance}$$
   - Displays live feedback:
     - If $\Delta > 0$: marked as a positive adjustment (`+`, Gain/Upward Correction).
     - If $\Delta < 0$: marked as a negative adjustment (`-`, Loss/Downward Correction).
   - User can enter an optional note (e.g., "ATM slip check", "End-of-month wallet audit").
3. **Transaction Creation & Invariants**:
   - Generates a special reconciliation transaction:
     ```typescript
     Transaction({
       accountId: account.id,
       amountMinor: Math.abs(deltaMinor),
       type: "ADJUSTMENT",
       direction: deltaMinor >= 0 ? "IN" : "OUT",
       subType: "BALANCE_CALIBRATION",
       source: "CALIBRATION",
       categoryId: balanceCalibrationCategoryId,
       excludeFromBudget: true, // Strictly prevents distortion of monthly spending budgets
       excludeFromStats: true,  // Kept out of income/expense totals; shown as a separate "Adjustments" cashflow line
       note: note ?? (deltaMinor >= 0 ? "Balance adjusted upwards (+)" : "Balance adjusted downwards (-)"),
       transactionDate: new Date(),
     })
     ```
   - The account balance is **not overwritten**: because balances are ledger-derived, adding the adjustment makes the derived balance equal the Actual Balance. Net worth evolution is preserved because net worth reads balances, not stats flags.
   - For **Credit Cards**: the user calibrates the **Current Total Outstanding Debt** as shown by the bank, **excluding future unbilled installments** (the sheet states this basis explicitly and shows the Blocked Principal separately). The adjustment updates the card balance and Available Credit correctly.
4. **Visual Representation in Transaction Feed**:
   - Rendered with a distinct calibration icon (e.g., balance scale / adjustment slider) and a clear `+` or `-` badge.

---

## 5. UI/UX SPECIFICATIONS

### 5.0 Visual Design System (Minimal & Flat, inspired by Realbyte "Money Manager Expense & Budget")

The look and feel is inspired by Realbyte's Money Manager: a utilitarian, data-dense, ledger-style app where numbers and lists are the interface. Take the **layout patterns and flat minimalism** only; do not reuse Realbyte's assets, icons, logo, or copy.

**Design principles**
- **Flat & minimal**: no gradients, no glassmorphism, no heavy shadows, no decorative illustrations. Separation comes from 1 px hairline dividers and subtle background tints, not elevation. At most one very light shadow is allowed on the FAB and on bottom sheets/drawers.
- **Data-first density**: compact list rows, small secondary text, tabular numbers. Prefer rows and simple tables over cards. Cards (where used) are flat bordered rectangles with a small radius (4-8 px).
- **Color means something**: neutral surfaces with one brand accent; **blue = income / inflow, red = expense / outflow** by default (matching Realbyte's default). Users can swap or customize this pair in Settings (e.g., for color-vision needs or regional conventions). Never rely on color alone: always pair with a `+`/`-` sign or label.
- **Fast one-handed use**: primary actions in the thumb zone (bottom nav, FAB, bottom sheets). The Quick-Add drawer is reachable from every tab in one tap.
- **Calm motion**: only functional transitions (150-200 ms): sheet slide-up, tab cross-fade, row press highlight. Respect `prefers-reduced-motion`.

**Design tokens** (implement as CSS variables consumed by Tailwind; light and dark themes, follow system by default)

| Token                  | Light                     | Dark                      | Use                                         |
| ---------------------- | ------------------------- | ------------------------- | ------------------------------------------- |
| `--bg`                 | `#FFFFFF`                 | `#121212`                 | App background                              |
| `--surface`            | `#F5F6F7`                 | `#1C1C1E`                 | Summary bar, section headers, calendar cells|
| `--border`             | `#E4E6E8`                 | `#2C2C2E`                 | Hairline dividers (1 px)                    |
| `--text`               | `#1B1D1F`                 | `#ECECEC`                 | Primary text                                |
| `--text-muted`         | `#6B7075`                 | `#9A9EA3`                 | Secondary text, labels                      |
| `--accent`             | `#E8505B` (placeholder; one flat brand color, configurable) | same | Top bar highlight, active tab, FAB |
| `--income`             | `#2F6FDE` (blue)          | `#5B93F0`                 | Income / inflow amounts                     |
| `--expense`            | `#E5484D` (red)           | `#F06A6E`                 | Expense / outflow amounts                   |
| `--transfer`           | `#6B7075` (neutral grey)  | `#9A9EA3`                 | Transfers (neither income nor expense)      |
| `--warning`            | `#D98E04`                 | `#F0A92A`                 | Budget near limit, mismatch hints           |

- **Typography**: one system sans (Inter or the platform UI font); sizes 12 / 14 / 16 / 20 / 28; amounts use `font-variant-numeric: tabular-nums` and are right-aligned; weight 400/500/600 only.
- **Spacing**: 4 px base grid; list row height ~48-56 px; screen padding 16 px (mobile), 24 px (desktop).
- **Iconography**: Lucide line icons at a single stroke width; category icons are simple glyphs inside a flat, solid-color circle (the `Category.color`). No emoji-style or multicolor icons.
- **Radius**: 4 px inputs/buttons/cards, 8 px bottom sheets, full-round only for the FAB and category icon circles.

**Signature layout patterns (adapted from Realbyte's screens)**

1. **Period header + Summary bar** (top of Trans. and Stats): `‹  October 2026  ›` month switcher (swipe left/right also changes month) followed by a three-cell flat summary: **Income** (blue) · **Expense** (red) · **Total** (neutral), all for the selected period.
2. **Trans. tab with switchable views** (segmented text tabs under the summary bar, no pill/animated indicators): **Daily** (grouped list with a date header and that day's net totals), **Calendar** (month grid), **Monthly**, **Summary/Total**. Default start view is configurable (Daily / Calendar).
   - **Calendar view**: flat 7-column month grid; each day cell shows small income (blue) and expense (red) totals; today has a thin accent outline; tapping a day reveals that day's transaction list directly beneath the grid (not a modal).
   - **Daily list row**: `[category icon]  Category / note  ·  account name (muted)` on the left, signed amount (`-` red / `+` blue) right-aligned. Day group header shows the date and the day's income/expense subtotals. Calibration rows use the scale icon and a `+`/`-` badge; transfers are neutral grey with an arrow; split transactions show a small "Split" tag; SMS-originated rows show a small message glyph.
3. **Top app bar** (Trans. tab): left = menu/period, right = `Search`, `Bookmarks` (template chips), `Filter` (account / category / type), and a view-switch icon. Keep to icon buttons, no labels.
4. **Stats tab**: period switcher, an **Expense / Income** toggle, a flat **donut chart** (category colors) with a ranked list beneath it (category icon, name, percentage chip, amount). Tapping a category opens its transaction list; a **Trend** (simple line/bar) view covers weekly/monthly/yearly comparison. Charts are flat fills with no gradients, 3D, or glow.
5. **Budget tab**: flat horizontal progress bars per category (limit, spent, remaining; bar turns `--warning` near limit and `--expense` when over), the **Safe-to-Spend daily** figure at the top, and a rollover chip when enabled.
6. **Accounts tab**: net-worth header (Assets, Liabilities, Total) then grouped sections: **Cash**, **Bank accounts**, **Credit Cards** (billed due, due-date countdown, available credit, link to the settle action), **Loans & Leases**, **Fixed Deposits**, and **0% Installment Plans** (progress bar rows). Each group has a group subtotal; rows show the name left and the balance right.
7. **More tab**: plain list of rows with chevrons: Bookmarks/Templates, Categories, SMS Review Inbox (with a count badge), SMS Activity Log, Household, Export/Import, Settings (Gemini key, Webhook key, timezone, currency, colors, theme, reminders).
8. **Quick-Add**: a circular **FAB (`+`)** at bottom-right opens a full-height bottom sheet with a flat **Income | Expense | Transfer** segmented switch (red/blue/grey accent per selected type), then the fields as simple labeled rows (Date, Account, Category, Amount with the embedded calculator keypad, Note), a "Split" toggle, an "Exclude from budget" toggle, and a **Save** button plus a **Continue** (save and add another) action.

**Desktop adaptation**: collapsible left sidebar (same five destinations plus Dashboard); content is a centered multi-column layout of flat bordered panels and tables on the same tokens. The Trans. calendar and Stats donut show side-by-side with the detail list. No separate visual language from mobile.

**Screens to design first (acceptance for the design phase)**: Trans. (Daily + Calendar), Quick-Add sheet, Stats, Budget, Accounts (with a credit-card detail and an installment plan card), SMS Review Inbox, Calibration sheet. Verify contrast (WCAG AA) in both themes.

### 5.1 Screens & Behaviors

- **Mobile Viewport**:
  - Sticky bottom navigation: `[Trans., Stats, Budget, Accounts, More]` (replaces the earlier Dashboard / Cards & Debts / Investments tabs; those features live inside **Accounts** and **More** as described in 5.0).
  - Floating Quick-Add Action Button (`+`) opening a drawer with:
    - Top: 1-Tap Bookmark chips.
    - Middle: Amount display with inline calculator keypad.
    - Bottom: Account selector, Category grid, "Split" toggle, "Exclude from Budget" toggle.
  - **Account Detail View**:
    - Account balance overview, transaction history list, and "Calibrate Balance" button opening a reconciliation sheet with current vs. real balance input and live delta indicator (`+` or `-`). Shows a "Balance mismatch" hint when SMS data disagrees with the ledger.
  - **Cards & Debts sections (inside the Accounts tab)**:
    - Credit Card statement cycle cards with Billed Due, Due Date countdown, and Available Credit.
    - **Active 0% Installment Plans Section**: Visual progress card (e.g., "Singer — TV: 5 of 12 months paid", progress bar, LKR 10,000/mo, LKR 70,000 remaining, and "Early Payoff" action).
    - Quick actions: "Add Ongoing Installment Plan" and "Convert to 0% Installment" on any CC transaction.
    - Loans & leases list with next due date, remaining principal and "Log EMI" / "Extra Principal" actions.
  - **SMS Review Inbox**: list of `NEEDS_REVIEW` messages with reason, parsed fields editable, "Post", "Link to existing transaction" and "Ignore" actions; "Possible duplicate — merge?" prompts appear here and on the transaction row.
  - **User Settings & Dashboard**:
    - Personal Gemini API Key configuration input (and optional model override).
    - Webhook API Key generator (shown once) & Apple Shortcuts guide/download.
    - Timezone, default currency, withholding-tax default, SMS auto-post mode, reminder time (with the iOS "install to Home Screen" note).
    - Household member manager (simple email search to add a member and set a role; leave/remove).
    - Bank SMS Activity Drawer with raw SMS viewer, parsed JSON inspect, parse method, and link to created transaction.
    - Data export / import (JSON, CSV).

- **Desktop Viewport**:
  - Collapsible sidebar navigation.
  - Multi-card analytical dashboard:
    - **Net Worth widget**:
      - Assets = Σ `CASH` and `BANK_SAVINGS` balances (ledger-derived) + Σ active FD values (principal + accrued net interest) + any positive credit-card balance (overpayment).
      - Liabilities = Σ credit card **Outstanding Debt** (billed + unbilled) + **Blocked CC Installment Principal** + Σ loan/lease remaining principal.
    - Safe-to-Spend Daily Burn Rate & Monthly Cashflow (income, expenses, and a separate Adjustments line).
    - Credit Card Statement Alerts (Due dates, Billed balances, upcoming EMI totals).
    - Monthly Spending Calendar grid.
    - Inbound Bank SMS Ingestion Log with status filters and JSON payload viewer.

---

## 6. NON-FUNCTIONAL REQUIREMENTS

- **Performance**: quick-add saves locally in < 100 ms and works fully offline from cold start; the dashboard renders from IndexedDB without waiting on the network; derived balances are computed incrementally and cached locally.
- **Security & privacy**:
  - Gemini API keys use AES-256-GCM; webhook keys are stored as hashes and shown once. `APP_ENCRYPTION_KEY` rotation is supported through the versioned ciphertext prefix.
  - Webhook rate limiting; Zod validation on all inputs; role checks on every mutation.
  - Raw SMS and parsed payloads are never written to application logs.
  - SMS content is sent to Google (via the user's own key) only when no template matches; Settings must disclose this clearly, and account numbers are masked to the last 4 digits first.
  - No app-level IndexedDB encryption in v1 (documented); an optional app lock (PIN / WebAuthn) is a later enhancement.
- **Data portability & backup**: full JSON export/import and CSV export of transactions; documented `pg_dump` backup/restore in the README.
- **Observability**: structured server logs, job run history (success/failure per scheduled job), and a Settings "System health" page showing last scheduler run and queue depth.
- **Accessibility & i18n**: WCAG AA contrast, keyboard-navigable desktop UI, text externalized for later localization (v1 ships English).
- **Testing strategy**:
  - **Unit + property tests** for `finance-core`: golden vectors for EMI, FD interest, flat/reducing loans and installment remainders; invariants such as "sum of splits equals total", "sum of installments equals totalAmount", "ledger balance equals sum of effects", "billed + unbilled = outstanding".
  - **SMS parser fixtures**: an anonymized per-bank corpus must pass the template parser; Gemini path tested with mocked responses plus schema-validation failure cases.
  - **Sync tests**: idempotent retries, tombstones, role sanitization (contributor never receives balances), conflict resolution, Dexie migration upgrades.
  - **Scheduler tests**: catch-up after missed days, deterministic-ID idempotency, month-end clamping (day 31) and timezone boundaries.
  - **E2E (Playwright)**: offline add → reconnect → sync; installment conversion; settlement; calibration; SMS ingestion to review inbox.

---

## 7. STEP-BY-STEP IMPLEMENTATION ROADMAP

Execute in structured stages:

- **Phase 1: Project Setup, Foundations & Schema**: Initialize Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, tRPC and Prisma; Docker Compose (`web`, `worker`, `postgres`); Auth.js with the offline-session behavior; the `finance-core` package with money/rounding utilities and the test harness; Prisma schema and matching Dexie schema (integer minor units, tombstone/`serverSeq` fields, UUIDv4/v5 helpers); the **design tokens and base components** from Section 5.0 (flat theme, light/dark, income/expense color tokens, summary bar, list row, FAB, bottom nav) so every later screen reuses them.
- **Phase 2a: Offline Engine & Sync**: Dexie storage + versioned migrations, outbox mutation queue, `sync.push`/`sync.pull` with `serverSeq` cursor, idempotent `mutationId`, per-mutation authorization scaffolding (role checks wired from the start, even before households ship).
- **Phase 2b: Core Expense Tracking**: ledger-derived balances in `finance-core`, accounts/categories, transaction entry with arithmetic keypad, splits, bookmark templates, edit/delete rules, transfers.
- **Phase 2c: Account Balance Calibration**: reconciliation sheet and `ADJUSTMENT` transactions; adjustments cashflow line.
- **Phase 3: Bank SMS Ingress & Processing Pipeline**:
  - `POST /api/v1/webhooks/sms-ingress` with `dedupeKey`, rate limiting, and `BankSms` archival; pg-boss queue with retry.
  - Template parser registry + fixture corpus; Gemini fallback with the Zod schema, validation gate and posting policy.
  - `TransactionIngestionService`: two-way ±2-hour de-duplication, ATM cash-wallet transfers with fee child records and fee-SMS dedupe, deposits, refunds, balance-mismatch hint.
  - SMS review inbox; User Settings UI for Gemini key/model and webhook key (shown once).
- **Phase 4: Credit Card Cycle, Settlements & 0% Installments**:
  - Statement cycle tracker (derived billed/unbilled, FIFO payments) and available-credit calculation factoring blocked installment principal; `CreditCardStatement` snapshots.
  - Swipe-to-installment conversion with `excludeFromBalance: true`, plan cancellation restore, processing fee handling, early payoff.
  - Scheduler catch-up job with deterministic IDs, `POST /api/v1/cron/tick`, and the 1-tap settlement modal (Full Due, Total, or Custom).
- **Phase 5a: FDs and Loans/Leases**:
  - FD engine with both `REINVEST_COMPOUND` and `MONTHLY_PAYOUT_TO_ACCOUNT` modes, configurable withholding tax, `FixedDepositPayout`, placement/maturity/premature-closure flows.
  - Loan/lease schedules (`LoanScheduleEntry`), auto-split EMI logger with Extra Principal support, disbursement.
- **Phase 5b: Budget Rollover**: derived symmetric rollover engine with `BudgetMonthSnapshot` month-close job and safe-to-spend calculation.
- **Phase 6: Household Collaboration & PWA Polish**:
  - Implement the simple email-search household onboarding, leave/remove, the full role capability matrix, and sync data sanitization (contributor sees only own transactions and no balances).
  - Finalize PWA Service Worker (manifest, standalone mode, VAPID push reminders with the iOS caveat).
- **Phase 7: Hardening & Release**: JSON/CSV export + import, backup docs, system-health page, E2E suite, accessibility pass, README and self-hosting guide.

---

## 8. DESIGN DECISIONS LOG & ASSUMPTIONS TO CONFIRM

### Decisions (settled)

| Area              | Decision                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Balances          | Ledger-derived; stored values are caches only and never synced as truth.                                                  |
| Audience          | Open-source, self-hosted; each user supplies their own Gemini key; no env fallback key.                                   |
| Money             | Integer minor units everywhere; rates in basis points; half-up rounding with remainder in the final period.               |
| Transfers         | One row with `accountId` (source) + `toAccountId` (destination); used for settlements, ATM withdrawals.                    |
| Sync              | Per-record last-write-wins using a server `serverSeq` cursor plus soft-delete tombstones.                                 |
| Scheduled work    | Server-only generation with deterministic IDs; in-app `pg-boss` worker with an optional external cron endpoint.           |
| SMS parsing       | Template-first, Gemini fallback, validation gate, review inbox for low-confidence/unmatched items.                         |
| `balanceAfter`    | Never auto-adjusts; raises a "balance mismatch" hint pointing to Calibration.                                             |
| Household         | `householdId` on FD/Loan, `createdByUserId` on Transaction; direct role assignment (no accept step) with leave/remove.     |
| Leases            | A `Loan` variant (`kind = LEASE`).                                                                                        |
| FD withholding tax| Configurable per FD and per-user default; applied in both payout and compound modes; no hard-coded country rate.         |

### Assumptions made while updating this document (please confirm or correct)

1. **Auth**: Credentials (email + password) as the default provider, OAuth optional, `ALLOW_REGISTRATION` to close sign-ups.
2. **Contributor visibility**: `CONTRIBUTOR_ADD_ONLY` receives only the transactions they created (to prevent re-deriving balances).
3. **VIEWER**: read-only access also covers shared FDs and Loans (the original text only named accounts, budgets, transactions).
4. **Owner exit**: the OWNER must transfer ownership or delete the household before leaving.
5. **Single currency** per household in v1; no FX.
6. **Installment spend recognition**: a converted swipe is recognized per installment in stats/budgets (not at purchase); early payoff posts the remaining principal as one expense in the payoff month.
7. **EMI budget treatment**: loan `EMI_PAYMENT` rows default to `excludeFromBudget = true`; interest shown in a dedicated "Interest paid" report.
8. **Cron endpoint renamed** from `/api/v1/cron/statement-cycles` to `/api/v1/cron/tick`, since it now runs all scheduled jobs (installments, statements, budget snapshots, FD payouts).
9. **Calibration stats flag**: `ADJUSTMENT` now uses `excludeFromStats = true` with a separate "Adjustments" cashflow line (the original `false` conflicted with the stated goal of not skewing totals).
10. **Visual reference**: the UI is inspired by Realbyte's "Money Manager Expense & Budget" (layout patterns, calendar view, flat minimal look) but is **not** a copy: no Realbyte assets, icons, or branding. The official site is JavaScript-rendered and shows few UI shots, so the reference is based on the app's well-known screens (Trans./Stats/Budget/Accounts/More, calendar view, pie-chart stats). Please review it against real screenshots.
11. **Navigation restructure**: mobile bottom nav changed from `[Dashboard, Transactions, Cards & Debts, Investments, Settings]` to `[Trans., Stats, Budget, Accounts, More]`; Cards, Loans/Leases and FDs now live as sections inside **Accounts**, and Dashboard widgets are desktop-first (Section 5).
12. **Income/expense colors**: blue = income, red = expense by default (Realbyte's default), swappable in Settings.

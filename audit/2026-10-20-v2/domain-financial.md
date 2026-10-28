# Audit v2 (2026-10-20): Domain / Financial Correctness, Schema, Data Integrity

**Scope:**
- `prisma/schema.prisma` and `prisma/migrations/*`
- `src/lib/finance-core/*`
- `src/lib/server-seq.ts`, `src/lib/server-clock.ts`, `src/lib/authorization.ts`
- `src/lib/jobs/cron-runner.ts`, `src/app/api/v1/cron/tick`
- `src/app/api/loans/**`, `src/app/api/fixed-deposits/**`, `src/app/api/transactions/**`, `src/app/api/sms/inbox/[id]/*`, `src/app/api/sync/push|pull`
- Money-writing client code: `src/lib/sync/client.ts`, `src/components/account/{loan-modal,loan-detail-modal,fixed-deposit-modal,fd-close-modal}.tsx`, `src/hooks/use-account-portfolio.ts`, `src/app/accounts/page.tsx`
- SMS money paths: `src/lib/sms/ingestion.ts`, `template-parser.ts`

**Spec:** `PRD.md` §2.1–2.7, §3.G/H, Subsystem 5 and 6.

**Mode:** read-only. No source changes, no commits, no DB access, no migrations, no dev server. HEAD at audit time: `0c401ec`. Working tree is clean except the untracked screenshots under `audit/`.

## Commands run

| Command | Result |
|---|---|
| `pnpm exec vitest run` | 8 files, 62 tests, all pass (412 ms). |
| `pnpm exec tsc --noEmit` | Exit 0, no errors. The `(prisma as any)` casts in money routes hide type errors from this check (FIN-35). |
| `pnpm exec eslint` on the financial files only (finance-core, loans, fixed-deposits, sync, jobs, server-seq, transactions) | 61 problems (56 errors, 5 warnings). Almost all are `no-explicit-any` in `sync/push` and `cron-runner`. Also `prefer-const` in `calculator.ts:98` and unused imports in `cron-runner.ts:4-5,388`. |
| Scratch vitest probe in `/tmp/hm-probe` that imports the real `loans.ts`, `investments.ts` and `dates.ts` (deleted afterwards) | Used to confirm numeric and date behaviour. Outputs are quoted in FIN-05, FIN-17, FIN-20 and FIN-32. |
| `pnpm build` | Not run. It runs `prisma generate`, which writes into `node_modules`. No finding depends on the build. |

The Next.js docs under `node_modules/next/dist/docs/` were not needed. None of the findings depend on Next.js API semantics. Route handlers use `params: Promise<...>`, which matches Next 16.

---

## 1. How this area works today

### 1.1 Money representation
- Every amount is a JS `number` holding integer minor units (`*Minor`). Rates are basis points (`*Bps`). FX rates are micro-units (`exchangeRateMicros`, scale 1,000,000, `currency.ts`).
- Prisma declares every `*Minor` column as `Int`. The init migration creates them as Postgres `INTEGER` (int4), for example `migration.sql:130 "amountMinor" INTEGER NOT NULL`. The PRD (§2.1) requires `BIGINT`.
- `money.ts`:
  - `roundHalfUp` rounds half away from zero.
  - `parseMoneyToMinor` is now a strict regex parser: optional sign, digits, up to 2 decimals, otherwise 0.
  - `formatMoney` always prints 2 decimals.
- SMS amounts still go through `amountTextToMinor`, which computes `Math.round(parseFloat(x) * 100)` (`template-parser.ts:76-83`).
- Balances are never stored. They are derived by `ledger.ts:calculateLedgerEffect`:
  - `TRANSFER` credits the destination with `destinationAmountMinor ?? amountMinor`.
  - The client runs this in `use-account-portfolio.ts`, the cron runs it for credit cards, and SMS ingestion has its own copy (`ingestion.ts:612-634`).
- Two currencies exist: LKR, and USD for `BANK_SAVINGS` only. The PRD's v1 scope is a single currency.

### 1.2 Loans and leases

| Step | Where | What happens |
|---|---|---|
| Create (UI path) | `loan-modal.tsx:83-115` → `localCreateLoan` (`sync/client.ts:896`) | The form builds `startDate` as `new Date("YYYY-MM-DDT00:00:00")` (device-local midnight) and serializes it to ISO. It counts `paidInstallments` from due dates already in the past. `localCreateLoan` generates the schedule with `generateAmortizationSchedule` and due dates with `addMonthsOnDay` (UTC). **Every entry is written as `SCHEDULED`** (`client.ts:955`). The loan and each entry are queued as separate outbox mutations, and a local `${id}-disbursement` tx is written. |
| Create (server) | `sync/push` `loan` CREATE (`push/route.ts:1093-1172`) | Upserts the disbursement tx (`update: {}`), then upserts the loan with whatever the client sent (status, EMI, terms). Schedule entries arrive as `loanScheduleEntry` CREATE mutations (`:1241`). |
| Create (REST) | `POST /api/loans` (`loans/route.ts:71-194`) | Not used by the UI. Inside one interactive `$transaction` it creates the loan, one row per installment (marking the first `paidInstallments` as PAID) and the disbursement. It calls `getNextServerSeq(tx)` once per row. |
| Edit terms | `loan-detail-modal.tsx:134` → `PATCH /api/loans/[id]` | Regenerates the schedule from scratch and overwrites live rows by array index. It sets status `PAID` purely from `loan.paidInstallments` (`route.ts:87-101`). |
| Pay EMI / extra principal | `loan-detail-modal.tsx:154` → `POST /api/loans/[id]/pay-emi` | Validates the amount (safe integer > 0) and account write access. It reads the loan, entries and payments **outside** the transaction, requires an `ACTIVE` loan and a non-PAID target entry, and requires `amount == principal + interest` of the entry. Inside `$transaction` it creates an `EXPENSE/EMI_PAYMENT` tx (`uuidv4`) and a `LoanPayment`, and marks the entry PAID. For extra principal it re-amortizes (`LOWER_EMI` or `SHORTER_TENURE`) by soft-deleting all non-PAID rows and inserting new ones. The loan auto-closes when no unpaid rows remain **and** the residual is 0. |
| Override a row | `PATCH /api/loans/[id]/schedule/[entryId]` | Writes new components and status `OVERRIDDEN`. When `newClosing > residual`, it re-amortizes later non-PAID rows with `generateAmortizationSchedule` (LOWER_EMI semantics). |
| Early close | `POST /api/loans/[id]/close` | Sets `CLOSED` and soft-deletes `SCHEDULED` rows. No money moves. |
| Delete | `localDeleteLoan` (`client.ts:1042`) → push `loan` DELETE | Server soft-deletes the `Loan` row only. |
| Derived values | `GET /api/loans` (`route.ts:31-66`), `use-account-portfolio.ts:178-189` | Server: `remaining = original − Σ payment.principal`. Client: `remaining = original − max(Σ payment.principal, Σ PAID-entry principal)`. |
| Math | `finance-core/loans.ts` | **Reducing balance:** annuity EMI with `roundHalfUp`, period interest `roundHalfUp(balance × bps/120000)`, final row absorbs the remainder (lease ends at the residual). **Flat:** total interest = `P × rate × years`, principal and interest spread with `floor`, remainder in the final row. **Zero-rate:** `floor` spreading. **`reamortizeRemainingSchedule`:** LOWER_EMI regenerates; SHORTER_TENURE keeps the EMI and loops for at most 240 rows. |

### 1.3 Fixed deposits

| Step | Where | What happens |
|---|---|---|
| Create | `fixed-deposit-modal.tsx:141-193` → `localCreateFixedDeposit` (`client.ts:796`) → push `fixedDeposit` CREATE (`push/route.ts:934-1021`) | The client sets `startDate` to local midnight ISO, `maturityDate = addMonthsClamped(start, tenure)`, and `paidPeriods` = months already elapsed. The server upserts an `FD_PLACEMENT` EXPENSE (`${id}-placement`, dated at `startDate`) when `fundingAccountId` is set, then upserts the FD. |
| Edit | `fixed-deposit-modal.tsx:171-191` | Sends `PATCH /api/fixed-deposits/[id]` (owner-only lookup, recomputes maturity) **and** a sync UPDATE with the full form values, including `status: "ACTIVE"`. |
| Monthly payouts | `cron-runner.ts:386-468` | For `MONTHLY_PAYOUT_TO_ACCOUNT` with a linked account, loops months `1..tenure` with `addMonthsClamped(start, i) <= now`. For each period it creates an `FD_INTEREST` tx (UUIDv5) **and then** a `FixedDepositPayout` (UUIDv5). These are two separate writes. `paidPeriods` is ignored. |
| Maturation | `cron-runner.ts:470-511` | When `now >= maturityDate` and status is ACTIVE: with autoRenew, it rolls dates forward (compound FDs get principal = net maturity amount). Otherwise it sets `MATURED`. |
| Deposit proceeds | `accounts/page.tsx:95-115` → `POST /api/fixed-deposits/[id]/deposit-proceeds` | Requires `MATURED` or `now >= maturityDate`, and write access to the target account. It then posts the `FD_MATURITY` principal (UUIDv5), plus the formula-computed net `FD_INTEREST` for compound FDs, then marks CLOSED. These are three or four independent writes. The client updates local state only after `res.ok`. |
| Premature close | `fd-close-modal.tsx:46-77` → `POST /api/fixed-deposits/[id]/close` | Splits the user-entered proceeds into a principal tx (≤ principal) and an interest tx (the excess), then marks CLOSED, using independent writes. The client now only flips local status after success. |
| Valuation | `investments.ts:calculateAccruedFdValue` | Monthly-payout FDs are valued at principal. Compound FDs are valued at principal plus a linear time share of full-term net interest. `CLOSED` is valued at 0. |

### 1.4 Cross-cutting
- **serverSeq:** `getNextServerSeq()` calls `nextval('global_server_seq')`, creating the sequence at runtime if it is missing, with a fallback to the `SyncSequence` row. No migration creates the sequence. Almost every caller fetches the value before, and outside, the write that uses it. Pull returns `serverSeq > cursor` across 13 separate queries and advances the cursor to the max value seen.
- **Atomicity:** `$transaction` is used in the loan routes (POST, PATCH, pay-emi, close, schedule override) only. FD close/proceeds, cron, sync push, SMS ingestion/post/merge and the transaction routes do multi-write work without one. No advisory lock exists for the cron.
- **Authorization helpers:** `authorization.ts` provides `assertCanWriteAccount`, `authorizeLoan` and `authorizeFixedDeposit`, now used by the REST money routes and by the sync push account-reference check (`push/route.ts:119-128`).
- **Timezone:** `Asia/Colombo` is hard-coded (`cron-runner.ts:16`, `credit-card.ts:58-80`). `User.timezone` is never read. `dates.ts` does all month arithmetic in UTC on whatever instant it receives. Date-only fields are `DateTime` (timestamp), not `DATE`.

---

## 2. Findings

**Severity:** Critical, High, Medium, Low.

**Status:**
- CONFIRMED: verified by reading the code, plus a probe where noted.
- SUSPECTED: plausible, but not reproduced at runtime.

**Effort:**
- S: under half a day.
- M: 1–3 days.
- L: more than 3 days.

### Summary table

| ID | Title | Sev | Status | Effort |
|---|---|---|---|---|
| FIN-01 | Money columns are int4; overflow above LKR 21,474,836.47 | Critical | CONFIRMED | M |
| FIN-02 | Sync push `loanScheduleEntry` / `loanPayment` mutations have no authorization | Critical | CONFIRMED | S |
| FIN-03 | Sync push CREATE is a blind upsert that overwrites any user's row by id | Critical | CONFIRMED | M |
| FIN-04 | Editing a loan re-opens EMIs that were paid through pay-emi | High | CONFIRMED | S |
| FIN-05 | Loan due dates are one day late in Sri Lanka (local-midnight start + UTC month math); FD month-end maturities shift | High | CONFIRMED (probe) | M |
| FIN-06 | Existing loans: "already paid" installments are never applied on the UI create path; client and server disagree on remaining principal | High | CONFIRMED | M |
| FIN-07 | Existing FDs: cron ignores `paidPeriods` and back-posts every elapsed monthly payout as new income | High | CONFIRMED | S |
| FIN-08 | pay-emi is not race-safe or idempotent; a double tap or two devices can pay the same EMI twice | High | CONFIRMED (code), race SUSPECTED | M |
| FIN-09 | FD close / deposit-proceeds are not atomic: partial failure locks the FD permanently, close + proceeds can double-credit | High | CONFIRMED | M |
| FIN-10 | Schedule override can re-open PAID rows, leaves stale rows at payoff, and accepts unvalidated input | High | CONFIRMED | S |
| FIN-11 | Deleting/editing EMI or system txs, or deleting a loan/FD, leaves orphaned money effects | High | CONFIRMED | M |
| FIN-12 | Cron poison pill: non-atomic FD payout + deterministic tx id + no per-entity isolation or lock | High | CONFIRMED | M |
| FIN-13 | Loan "early payoff" moves no money; the liability just disappears | High | CONFIRMED | M |
| FIN-14 | Lease residual has no payment path; leases never close and pay-emi books arbitrary principal | High | CONFIRMED | M |
| FIN-15 | serverSeq is allocated before commit; pull can skip committed rows; fallback counter; sequence not in migrations | High | CONFIRMED (design) | M |
| FIN-16 | Sync push accepts unvalidated money data (amounts, splits, types, transfers) | Medium | CONFIRMED | M |
| FIN-17 | REST money routes still have validation gaps (POST /loans, FD PATCH/close, override, WHT > 100%) | Medium | CONFIRMED (probe) | S |
| FIN-18 | POST/PATCH `/api/transactions` return Prisma BigInt and fail with 500 after the write commits | Medium | CONFIRMED | S |
| FIN-19 | Loan/FD terms and status are editable via generic sync UPDATE; FD edit form forces `status: ACTIVE` | Medium | CONFIRMED | M |
| FIN-20 | Re-amortization defects: flat-rate interest recomputed on the reduced balance, 240-row cap, stale EMI/tenure | Medium | CONFIRMED (probe) | M |
| FIN-21 | FD auto-renew/compound gaps: capitalized interest never recorded, final payout lost, no-account payouts silently skipped | Medium | CONFIRMED | M |
| FIN-22 | Timezone: hard-coded Colombo, `User.timezone` unused, timestamps for calendar dates, server-local cycle start | Medium | CONFIRMED | M |
| FIN-23 | Cross-currency gaps: card statements and SMS mismatch hint use source amounts; loans/FDs have no currency | Medium | CONFIRMED | M |
| FIN-24 | Multi-write operations without a transaction (sync push mutations, SMS ingestion, merges) | Medium | CONFIRMED | M |
| FIN-25 | SMS "post" and "merge-transfer" can be repeated on an already-processed SMS (double posting) | Medium | CONFIRMED | S |
| FIN-26 | Cron budget job: O(budgets × all txs), rewrites closed months with today's limit, drops net refunds | Medium | CONFIRMED | M |
| FIN-27 | Schema integrity: free-text enums, missing uniques, no tombstones on payouts/payments, risky cascades, missing indexes | Medium | CONFIRMED | M |
| FIN-28 | Long interactive transactions (one round trip per schedule row) can hit Prisma's 5 s timeout | Medium | SUSPECTED | S |
| FIN-29 | EMI tx counts principal as expense in stats; payment date always "now"; no category | Medium | CONFIRMED | S |
| FIN-30 | Balance-mismatch hint is never synced and checks "newest SMS" per user, not per account | Low | CONFIRMED | S |
| FIN-31 | Float arithmetic and rounding semantics (EMI/interest in floats, half-away-from-zero, SMS `parseFloat × 100`) | Low | CONFIRMED (risk SUSPECTED) | M |
| FIN-32 | `calculateFlatRateEmi` disagrees with the schedule it is meant to describe | Low | CONFIRMED (probe) | S |
| FIN-33 | Deterministic ids are not the PRD's UUIDv5 scheme; `uuid.ts` helpers unused; DNS namespace reused | Low | CONFIRMED | S |
| FIN-34 | "Investment Yield" lookup ignores tombstones and races into duplicates | Low | CONFIRMED | S |
| FIN-35 | `(prisma as any)` / `tx: any` across money routes; 56 lint errors in financial files | Low | CONFIRMED | S |
| FIN-36 | Premature-closure penalty is invisible and WHT is not recorded | Low | CONFIRMED | S |
| FIN-37 | Loan read models: household loans missing from `GET /api/loans`; progress counts wrong after regeneration | Low | CONFIRMED | S |
| FIN-38 | Leftover test scaffolding in sync push (unreachable fake card; reachable placeholder categories) | Low | CONFIRMED | S |
| FIN-39 | Self-transfers and transfers without a destination are accepted and distort balances | Low | CONFIRMED | S |
| FIN-40 | Installment-plan cron numbers installments by count, not by cycle; non-atomic billing + completion | Low | SUSPECTED | S |

**Totals:** 3 Critical, 12 High, 14 Medium, 11 Low (40 findings).

---

### FIN-01: Money columns are int4; overflow above LKR 21,474,836.47
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** M
- **Where:**
  - `prisma/schema.prisma`: every `*Minor` field, for example `Account.openingBalanceMinor` (l.128), `Transaction.amountMinor` (l.169), `TransactionSplitItem.amountMinor` (l.240), `FixedDeposit.principalAmountMinor` (l.394), `Loan.originalPrincipalMinor` (l.449), `LoanScheduleEntry.openingBalanceMinor` (l.483).
  - `prisma/migrations/20261023054607_init/migration.sql:99-311` (`INTEGER`).
- **Evidence:**
  - `"amountMinor" INTEGER NOT NULL` and `"principalAmountMinor" INTEGER NOT NULL`. The int4 maximum is 2,147,483,647 minor units, which is LKR 21,474,836.47.
  - The probe shows that an LKR 5M, 30-year loan at 14.5% already has total interest of 1,704,198,571 minor units, close to the cap.
  - PRD §2.1 says money columns are "Postgres `BIGINT`".
- **Impact:** Housing loans, leases, FDs, opening balances and credit limits above about LKR 21.5M can't be stored. In Sri Lanka a typical home loan is LKR 10–50M. The insert fails with Prisma "value out of range", which surfaces as a sync rejection or a 500.
- **Fix:**
  - Change all `*Minor` columns to `BigInt` (`@db.BigInt`) in a migration.
  - At the API edge, convert with `Number()` after asserting `Number.isSafeInteger` (the PRD rule).
  - Update the route code and Dexie typings.

### FIN-02: Sync push `loanScheduleEntry` / `loanPayment` mutations have no authorization
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/sync/push/route.ts:1241-1310`
- **Evidence:**
  - `loanScheduleEntry.upsert({ where: { id: mutation.id }, create: { loanId: payload.loanId, … }, update: { …, status: payload.status } })` (l.1243).
  - `loanScheduleEntry.updateMany({ where: { id: mutation.id }, … })` for UPDATE and DELETE (l.1270-1290).
  - `loanPayment.upsert({ create: { loanId: payload.loanId, principalComponentMinor: payload.principalComponentMinor ?? 0, … } })` (l.1293).
  - None of these load the loan or check the owner or household role. The only generic check (l.119-128) covers account-id fields, which these payloads don't have.
- **Impact:** Any logged-in user who knows an entry or loan id can:
  - mark another user's installments PAID;
  - change their principal and interest;
  - delete their schedule;
  - attach fake principal payments to their loan.
  
  All of these change the victim's remaining principal and net worth. A household VIEWER can do the same to shared loans, bypassing the PRD §3.A role matrix. Loan ids are visible to every household member through pull.
- **Fix:**
  - Load `loan = findUnique(payload.loanId ?? entry.loanId)` and apply the same owner/role checks used for `loan` UPDATE.
  - Better: reject client writes to these two entities entirely. They are server-derived (pay-emi, override routes). Keep Dexie-only state for offline display.

### FIN-03: Sync push CREATE is a blind upsert that overwrites any user's row by id
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/sync/push/route.ts`. The `update:` branch of every CREATE upsert:
  - account (l.224)
  - category (`existingCategory.userId` is checked, l.358, so category is safe)
  - transaction (l.478)
  - template (~l.705)
  - installment plan (~l.866)
  - fixed deposit (l.974)
  - loan (l.1133)
  - loanScheduleEntry (l.1243)
- **Evidence:**
  - `prisma.account.upsert({ where: { id: mutation.id }, create: {…userId: user.id…}, update: { name, type, openingBalanceMinor, …, deletedAt: null } })`.
  - The transaction CREATE path checks household role only when the *payload's* `accountId` belongs to a household account. It never checks whether the existing row with `mutation.id` belongs to someone else.
  - UPDATE/DELETE do check ownership, but CREATE skips that check.
- **Impact:** A crafted `op: "CREATE"` with another user's existing id rewrites their account opening balance, transaction amounts and dates, FD and loan terms. It also un-deletes tombstoned rows (`deletedAt: null`). For transactions, the generic account check limits the *new* `accountId` to one the attacker can write. The row still moves out of the victim's ledger, so their balance changes.
- **Fix:**
  - In CREATE, `findUnique` first. If the row exists and `existing.userId !== user.id` (and no role grants write access), reject it.
  - If the row exists and is owned by the caller, treat it as an idempotent replay and don't reset `deletedAt`.
  - Alternatively, use `create` and map P2002 to "conflict".

### FIN-04: Editing a loan re-opens EMIs that were paid through pay-emi
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/route.ts:58-101`; `src/components/account/loan-detail-modal.tsx:126-145`; `src/app/api/loans/[id]/pay-emi/route.ts:150-158`
- **Evidence:**
  - pay-emi marks the entry PAID but **never updates `Loan.paidInstallments`**.
  - The edit form pre-fills `editPaidInstallments` from `loan.paidInstallments` (l.128) and always sends it (l.144).
  - PATCH then runs, for every regenerated row, `status: row.installmentNumber <= paidInstallments ? "PAID" : "SCHEDULED"` and overwrites existing live rows by array index (`entries[index]`, l.89). It also overwrites the principal and interest of PAID rows.
  - Rows beyond the new `rows.length` (when tenure is reduced) are never deleted.
  - The loan status isn't checked, so a CLOSED loan can be edited too.
- **Impact:** A user pays EMIs #1–#3 in the app, then fixes a typo in the lender name. All three rows flip back to SCHEDULED, so "next EMI" becomes #1 again and the user can be prompted to pay it a second time. `LoanPayment` rows still reference the entries, so the client's remaining principal (`max(payments, PAID rows)`) and the server's (`payments`) diverge. Shortening the tenure leaves extra live installments that keep the loan from auto-closing.
- **Fix:**
  - Derive PAID status from `LoanPayment` rows (or increment `paidInstallments` in pay-emi inside the same transaction).
  - Never change the status or amounts of rows with a payment.
  - Regenerate only the unpaid tail from the current outstanding balance.
  - Soft-delete live rows beyond the new tenure.
  - Reject edits on non-ACTIVE loans.
  - Let a "name only" edit skip regeneration.

### FIN-05: Loan due dates are one day late in Sri Lanka; FD month-end maturities shift
- **Severity:** High. **Status:** CONFIRMED (probe). **Effort:** M
- **Where:**
  - `loan-modal.tsx:85` and `fixed-deposit-modal.tsx:142`: `new Date(`${startDateStr}T00:00:00`).toISOString()`.
  - `finance-core/dates.ts:1-24`: UTC-only `setUTCDate`/`setUTCMonth`.
  - Callers: `sync/client.ts:940`, `loans/route.ts:146`, `loans/[id]/route.ts:93`, `pay-emi/route.ts:203`, `schedule/[entryId]/route.ts:106`, `cron-runner.ts:392`, `:482`.
  - Display: `loan-detail-modal.tsx:127,275,354,428` (`getUTCDate()`, `toLocaleDateString()`).
- **Evidence:**
  - In Colombo, local midnight of 2026-01-05 is `2026-01-04T18:30:00Z`. `addMonthsOnDay` sets the UTC day to the due day while keeping 18:30Z, which is 00:00 the *next* day in Colombo.
  - Probe with the real `dates.ts`:
    - start 2026-01-05 (+05:30), due day 5 → Colombo dates `2026-02-06`, `2026-03-06`.
    - start 2026-01-31, due day 31 → `2026-03-01`, `2026-04-01`, `2026-05-01` (expected Feb 28, Mar 31, Apr 30).
    - FD start 2026-03-31 + 1 month → `2026-05-01` (expected Apr 30).
  - The edit form sends a bare `YYYY-MM-DD` (parsed as UTC midnight), while create sends local midnight. Editing therefore also moves dates by 5.5 hours.
  - The default due day on the server POST uses `getUTCDate()` of the start, which is the previous day.
- **Impact:** Every loan created from the UI in Sri Lanka shows each EMI due one day after the real date. Users relying on the app can pay late and incur bank late fees. Short-month clamping is defeated (Feb 28 → Mar 1), so two installments can land in March and none in February. FDs started on the 29th–31st mature and pay out a day late. The e2e suite runs with `timezoneId: "Asia/Colombo"` (`playwright.config.ts:13`) but only checks that the due date is visible.
- **Fix:**
  - Store calendar dates as `@db.Date` / `YYYY-MM-DD` strings.
  - Do month arithmetic on `{year, month, day}` in the user's timezone (date-fns-tz is easy to add; `date-fns` is already a dependency).
  - Render with the same timezone.
  - Add unit tests for days 29–31 and a +05:30 offset.

### FIN-06: Existing loans: "already paid" installments are never applied on the UI create path
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `loan-modal.tsx:87-107`; `sync/client.ts:930-958`; `loans/route.ts:31-46`; `use-account-portfolio.ts:178-189`
- **Evidence:**
  - The form computes `paidInstallments` (due dates already past) and passes it into `localCreateLoan`, which writes **every** entry with `status: "SCHEDULED"` (`client.ts:955`). Only the unused REST `POST /api/loans` marks the first N rows PAID (`route.ts:158`).
  - `pay-emi` picks `scheduleEntries.find(e => e.status !== "PAID")`, so the next payable entry is #1.
  - Remaining principal is computed two different ways:
    - Server: `original − Σ payments.principal` (`route.ts:40`). This ignores pre-paid rows entirely.
    - Client: `original − max(Σ payments, Σ PAID rows)`. `max` instead of a proper union means pre-paid rows plus later extra-principal payments are not added together.
  - pay-emi's extra-principal cap and re-amortization use the payments-only figure (`pay-emi/route.ts:99-108`, `:166-172`), so a loan with pre-paid rows is re-amortized from a balance that's too high.
- **Impact:** A user adding a 5-year-old housing loan sees the full original principal as a liability, "next EMI #1" dated years ago, and can be told to pay installments that were already paid. Net worth is understated by the principal already repaid. The loan detail screen and the accounts tab show different remaining principals.
- **Fix:** Have one place compute "paid" (server). Either mark the first N rows PAID at creation, with a `LoanPayment` of kind `HISTORICAL` that carries no transaction, or store `paidInstallments` and derive everything from schedule rows. Compute remaining principal as the `closingBalance` of the last PAID row minus later extra principal, the same way on client and server.

### FIN-07: Existing FDs: cron back-posts every elapsed monthly payout as new income
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposit-modal.tsx:146-148`; `cron-runner.ts:386-468`; `push/route.ts:946-971`
- **Evidence:**
  - The form now accepts a past start date and stores `paidPeriods` = months already elapsed. The cron loop runs `for (monthIdx = 1; monthIdx <= fd.tenureMonths; …)` from the original `startDate` and never reads `paidPeriods`. (`paidPeriods` is only used for the progress bar in `accounts/page.tsx:818`.)
  - The `FD_PLACEMENT` expense is posted dated at the past `startDate` whenever a funding account is chosen.
- **Impact:** Entering an FD opened 8 months ago creates 8 `FD_INTEREST` INCOME rows in the linked savings account on the next cron tick. That money was already received in real life and is typically already in the user's opening balance. The account balance and income stats are inflated by 8 months of interest. Back-dating the placement similarly debits the funding account for money that left before tracking began.
- **Fix:** Start the payout loop at `paidPeriods + 1`. Offer a "don't post placement" option for historical FDs, defaulting to off when `startDate < today`. Show the user what will be posted.

### FIN-08: pay-emi is not race-safe or idempotent
- **Severity:** High. **Status:** CONFIRMED (code); race SUSPECTED (not run). **Effort:** M
- **Where:** `src/app/api/loans/[id]/pay-emi/route.ts:47-160`
- **Evidence:**
  - The loan, entries and payments are read at l.47 and the PAID check runs at l.73-79, both before `$transaction` (l.112).
  - The entry update is `where: { id: targetEntry.id }` with no `status: { not: "PAID" }` guard (l.152).
  - Transaction and payment ids are `uuidv4()` (l.66-67). There's no idempotency key and no unique constraint on `LoanPayment.scheduleEntryId`.
  - The extra-principal cap reads `loan.payments` from before the transaction.
- **Impact:** A double tap, a network retry, or two household members paying at the same moment each create an `EMI_PAYMENT` expense and a `LoanPayment` for the same installment. The bank account is debited twice, and remaining principal drops twice, clamped at 0, which hides the error. Two concurrent extra-principal payments can together exceed the outstanding balance. The UI disables the button while submitting (`submittingEmi`), which narrows the window but doesn't close it.
- **Fix:**
  - Inside the transaction, use a conditional update: `updateMany({ where: { id, status: { not: "PAID" }, deletedAt: null }, data: { status: "PAID" } })`. Abort with 409 if `count === 0`.
  - Lock the loan row (`SELECT … FOR UPDATE` via `$queryRaw`) before computing the extra-principal cap.
  - Use deterministic ids (`uuid5(entryId + ":payment")`) or a client idempotency key with a unique index.

### FIN-09: FD close / deposit-proceeds are not atomic
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/fixed-deposits/[id]/close/route.ts:28-122`; `deposit-proceeds/route.ts:30-130`
- **Evidence:**
  - Both routes check `fd.status === "CLOSED"` and then run independent writes: principal `transaction.create` → optional category create → interest `transaction.create` → `fixedDeposit.update`. There's no `$transaction`.
  - The principal ids are now deterministic but *different per route*: `uuidv5(`${fd.id}:PREMATURE_CLOSE:PRINCIPAL`)` and `uuidv5(`${fd.id}:MATURITY:PRINCIPAL`)`.
- **Impact:**
  - If anything fails after the principal is created (a DB blip, a category race, a timeout), the FD stays ACTIVE/MATURED. Every retry then fails at the first `create` with a P2002 unique violation, so a 500 is returned forever and the user can never close the FD.
  - A maturity "Deposit proceeds" racing a "Close early" (two devices) passes both status checks and credits the principal twice, because the ids differ.
  - Two requests to the same route return a 500 for the loser instead of a clean 409.
- **Fix:**
  - Wrap each route in `prisma.$transaction`.
  - Start with a guarded state change: `updateMany({ where: { id, status: { in: ["ACTIVE","MATURED"] } }, data: { status: "CLOSED" } })`, and abort if `count === 0`.
  - Use one deterministic id per FD closure regardless of route.
  - Treat P2002 as "already done" and return the existing result.

### FIN-10: Schedule override can re-open PAID rows, leaves stale rows, accepts unvalidated input
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/schedule/[entryId]/route.ts:25-127`
- **Evidence:**
  - `targetEntry` is found with no status check (l.42), then updated to `status: "OVERRIDDEN"`. pay-emi treats any non-PAID row as payable, so an overridden PAID row can be paid again.
  - Re-amortization runs only `if (subsequentEntries.length > 0 && newClosing > residual)` (l.79). When an override pays the balance down to the residual, later rows are left in place.
  - The inputs aren't type-checked: a string `"100"` gives `newPrincipal = "100"` and `opening - "100"` (coerced). Negative values pass. `newEmi` is computed and never used (l.52).
  - The loan status isn't checked. `Loan.monthlyEmiAmountMinor` isn't updated after the re-amortization changes the EMI.
- **Impact:** The installment can be double-paid. The schedule over-collects after a large override. Corrupt components can be persisted.
- **Fix:**
  - Reject overrides of PAID rows. Keep PAID immutable and add an `isOverridden` flag if needed.
  - Validate non-negative safe integers and `principal <= opening − residual`.
  - When `newClosing <= residual`, soft-delete the remaining unpaid rows.
  - Require an ACTIVE loan and update `monthlyEmiAmountMinor`.

### FIN-11: Deleting/editing EMI or system txs, or deleting a loan/FD, leaves orphaned money effects
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:**
  - `sync/push/route.ts:600-700` (tx UPDATE/DELETE), `:1212-1239` (loan DELETE), `:1062-1090` (FD DELETE)
  - `transactions/[id]/route.ts:55-66`, `:118-126`
  - `sync/client.ts:1042-1060`
- **Evidence:**
  - Transaction DELETE soft-deletes only the row. The linked `LoanPayment` stays, the entry stays PAID, and `onDelete: SetNull` only fires on hard deletes.
  - The tx PATCH/UPDATE accepts any `amountMinor` for `EMI_PAYMENT`, `FD_INTEREST`, `LOAN_DISBURSEMENT` and `FD_PLACEMENT` rows.
  - Loan DELETE soft-deletes only the `Loan`. Entries, payments, the `${id}-disbursement` INCOME and every EMI tx remain.
  - FD DELETE leaves the `${id}-placement` EXPENSE and any payout INCOME.
  - There's no `subType`/`source: SYSTEM` guard.
  - PRD §2.5 requires schedule re-evaluation on edit of a LoanPayment tx, and protection of system-generated rows.
- **Impact:**
  - Deleting an EMI tx returns the cash while the loan still counts the principal as repaid.
  - Deleting a loan keeps the full disbursement in the bank balance with no liability, inflating net worth by the principal.
  - Deleting an FD keeps the placement expense with no asset, deflating net worth by the principal.
- **Fix:**
  - Put the cascade rules in a single server service used by both REST and sync:
    - Tx delete/edit with a linked `LoanPayment`: revert the entry to SCHEDULED, remove or recompute the payment, and re-amortize.
    - Loan/FD delete: tombstone the disbursement/placement, entries, payments and payouts, or refuse the delete while money rows exist.
  - Block direct edit/delete of `source: SYSTEM` rows.

### FIN-12: Cron poison pill: non-atomic FD payout, deterministic tx id, no isolation or lock
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/lib/jobs/cron-runner.ts:401-468` (payouts), `:300-345` (installments), the whole `runCronTick`; `src/app/api/v1/cron/tick/route.ts:18-24`
- **Evidence:**
  - `existingPayout` checks only `FixedDepositPayout`. The code then runs `transaction.create({ id: deterministicTxId })` (l.434) and `fixedDepositPayout.create` (l.455) as two writes.
  - If the second write fails or the process stops, the next tick sees no payout, re-runs the first `create` and throws P2002.
  - There's no try/catch per entity, so the exception aborts the whole tick. Every later section (maturation, then reminders; and on later ticks, everything after the failing FD) is skipped indefinitely.
  - The installment job has the same check-then-create shape.
  - There's no `pg_try_advisory_lock`, so overlapping ticks hit the same unique violations.
- **Impact:** One interrupted payout permanently stops FD payouts, maturation and push reminders for all users after that FD in iteration order. Budgets, statements and installments run earlier in the tick, so they keep working. The failure is only visible as a 500 in the cron logs.
- **Fix:**
  - Write the tx and payout in one `$transaction`, or `upsert` both.
  - Wrap each entity in try/catch with logging.
  - Take an advisory lock at tick start.
  - Use `createMany({ skipDuplicates: true })` for deterministic rows.

### FIN-13: Loan "early payoff" moves no money; the liability just disappears
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/loans/[id]/close/route.ts:18-47`; `loan-detail-modal.tsx:184-205`; `use-account-portfolio.ts:191-196`
- **Evidence:**
  - The route only sets `status: "CLOSED"` and soft-deletes `status: "SCHEDULED"` rows. OVERRIDDEN rows survive.
  - No payoff `EXPENSE` or `LoanPayment` is created. There's no ACTIVE check, so closing a closed loan re-stamps `closedAt`.
  - Net worth counts only `status === "ACTIVE"` loans.
  - The button is labelled "early payoff" with the text "All remaining schedule will be cleared".
- **Impact:** Closing a loan with LKR 3M outstanding raises net worth by LKR 3M instantly, and no account is debited. History shows "CLOSED" with `remainingPrincipalMinor > 0`.
- **Fix:**
  - Require `{ accountId, payoffAmountMinor, date }`.
  - In one transaction:
    - post the payoff expense;
    - post a `LoanPayment` with principal = outstanding and the remainder as interest/penalty;
    - tombstone all unpaid rows (SCHEDULED and OVERRIDDEN);
    - close with a status guard.
  - Offer "write off" as a separate, explicit action if needed.

### FIN-14: Lease residual has no payment path; leases never close and pay-emi books arbitrary principal
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `finance-core/loans.ts:104-108`; `pay-emi/route.ts:76-98`, `:248`
- **Evidence:**
  - The final row closes at `residualValueMinor`, and no schedule row exists for the residual.
  - Auto-close requires `remainingUnpaid === 0 && residual === 0`, so a lease with a residual stays ACTIVE forever after the last EMI.
  - Once all rows are PAID, a normal pay-emi call finds no `targetEntry` and falls into `else { principalComponent = amountMinor; }` (l.97). That books **any** amount as principal, with no cap and no schedule link.
  - The extra-principal cap excludes the residual (`remainingBeforeExtra − residual`), so the residual also can't be paid through "extra principal".
- **Impact:** The residual can't be settled correctly. A user who pays the balloon books it through the uncapped `else` branch (or not at all). The lease never auto-closes, and the only way out is "close", which moves no money (FIN-13). The loan list shows a finished lease as ACTIVE with remaining principal equal to the residual. An accidental extra pay-emi call on a fully paid loan can over-book principal.
- **Fix:**
  - Add an explicit `RESIDUAL` (balloon) schedule row due at maturity.
  - Auto-close when the outstanding balance reaches 0.
  - Replace the `else` branch with a 409 ("no payable installment").

### FIN-15: serverSeq allocated before commit; pull can skip rows; fallback counter
- **Severity:** High. **Status:** CONFIRMED (design; interleaving not reproduced). **Effort:** M
- **Where:** `src/lib/server-seq.ts:6-45`; callers such as `pay-emi/route.ts:81` (before `$transaction` at l.112), `push/route.ts:117`, `loans/[id]/close/route.ts:25`, FD routes; `sync/pull/route.ts:40-224`; migrations (no `global_server_seq`)
- **Evidence:**
  - `nextval` is taken and the write commits later, sometimes after a multi-row transaction.
  - Pull runs 13 independent `findMany({ serverSeq: { gt: cursor } })` queries, not in one snapshot, and sets the cursor to the max seen.
  - On error the code silently switches to the `SyncSequence` row, which is an independent counter that starts at 1.
  - The sequence is created by runtime DDL. Inside an interactive transaction, a failed `nextval` aborts the Postgres transaction (25P02), so the in-transaction fallback cannot work there.
- **Impact:** Request A takes seq 100. Request B takes seq 101 and commits first. A pull in between moves the device cursor past 100. A's rows are then never delivered to that device. These rows include EMI payments, payouts and balance-affecting transactions. If the fallback is ever used, seq values go backwards and devices miss every later change.
- **Fix:**
  - Assign `serverSeq` with a column default or trigger (`DEFAULT nextval('global_server_seq')`) so it's taken inside the writing transaction.
  - On pull, cap the result at a safe watermark (for example, the minimum seq of in-flight transactions via a `pending_seq` table), or re-read an overlap window and dedupe by id.
  - Create the sequence in a migration and delete the fallback.

### FIN-16: Sync push accepts unvalidated money data
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/sync/push/route.ts` (account l.224-266, transaction l.478-560, split items l.544-557, FD l.974-1021, loan l.1133-1172)
- **Evidence:**
  - `amountMinor: payload.amountMinor ?? 0`, `openingBalanceMinor: payload.openingBalanceMinor ?? 0`, `type: payload.type || "EXPENSE"`, `direction: payload.direction || null`.
  - Split items are inserted without checking `Σ split = parent` (PRD §2.4).
  - Nothing checks:
    - that `TRANSFER` has a `toAccountId`, or that the destination currency matches or has a destination amount;
    - that `ADJUSTMENT` has a direction;
    - that `monthlyEmiAmountMinor` agrees with the terms.
  - FD `maturityDate` defaults to `new Date()` (l.987), so an FD pushed without one is mature immediately.
  - Account UPDATE accepts any `currency` change on an account that already has transactions (l.291).
  - `POST /api/transactions` validates integer > 0 and transfer currency rules, but the sync path, which the UI actually uses, does none of this.
- **Impact:** Negative, zero, fractional or NaN amounts reach the ledger. Prisma Int errors on fractional values surface as rejected mutations stuck in the outbox. Split totals drift from the parent. A USD→LKR transfer pushed without a destination amount credits the LKR account in USD cents.
- **Fix:**
  - Use shared zod schemas per entity (`zod` is already a dependency) for both REST and sync:
    - `int().safe().positive()` for amounts;
    - bps in [0, 100000];
    - enums;
    - split-sum and transfer refinements.
  - Reject per mutation with a reason.

### FIN-17: REST money routes still have validation gaps
- **Severity:** Medium. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:**
  - `loans/route.ts:83-118`
  - `fixed-deposits/[id]/route.ts:17-41`
  - `fixed-deposits/[id]/close/route.ts:31-35`
  - `transactions/[id]/route.ts:60`
  - `sms/inbox/[id]/post/route.ts:35-36,104`
- **Evidence:**
  - `POST /api/loans` doesn't validate `annualInterestRateBps`, `calculationType`, `kind`, integer principal or `residual < principal`.
    - Probe: an undefined rate gives a schedule row of `{ emiAmountMinor: null, principalComponentMinor: null, … }`, so the Prisma create fails with a 500.
    - Probe: residual 150,000 > principal 100,000 gives negative principal and EMI rows (`[-16528, -15695, 150000]`).
    - An unknown `calculationType` silently uses the flat branch, but the unknown string is stored.
    - `tenureMonths` has no upper bound, so 100,000 rows can be created in a single transaction.
  - `PATCH /api/fixed-deposits/[id]` passes `principalAmountMinor` and `annualInterestRateBps` unchecked, and `withholdingTaxRateBps` has no upper bound. Probe: WHT 12000 bps gives `netInterestMinor: -183333`, a negative payout posted as INCOME.
  - FD close accepts any number for `actualProceedsMinor`. A negative value posts a negative INCOME.
  - Transaction PATCH runs `Number(body.amountMinor)` with no checks.
  - SMS post accepts a fractional `body.amountMinor` and an arbitrary `body.type`.
- **Impact:** Bad inputs from the UI or direct API calls corrupt schedules, payouts and balances, or produce opaque 500s.
- **Fix:** Apply the FIN-16 schemas to these routes too, with bounds: tenure 1–600, rate 0–100000 bps, WHT 0–10000 bps, `0 <= residual < principal`.

### FIN-18: POST/PATCH `/api/transactions` return BigInt and fail with 500 after the write commits
- **Severity:** Medium. **Status:** CONFIRMED (code). **Effort:** S
- **Where:** `src/app/api/transactions/route.ts:84`; `src/app/api/transactions/[id]/route.ts:67`
- **Evidence:**
  - `return NextResponse.json({ transaction: tx }, { status: 201 })`. `tx.serverSeq` is a Prisma `BigInt`, and `JSON.stringify` throws "Do not know how to serialize a BigInt".
  - There's no `BigInt.prototype.toJSON` anywhere in `src/` (grep).
  - Every other route converts with `Number(x.serverSeq)`.
  - The only e2e coverage (`s19-household.spec.ts:302,588`) exercises the 403 path.
- **Impact:** A successful create or edit returns 500 to the caller. A client that retries on 500 creates the transaction again (POST uses a fresh uuid each time), so the money is double-posted.
- **Fix:** Serialize `serverSeq` with `Number()` (or a shared serializer), matching the other routes. Add an API test for the success path.

### FIN-19: Loan/FD terms and status editable via generic sync UPDATE; FD edit forces ACTIVE
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `push/route.ts:1043-1061` (FD UPDATE), `:1195-1210` (loan UPDATE), `:1004-1020` and `:1158-1171` (CREATE-upsert update branches); `fixed-deposit-modal.tsx:149-191`; `fixed-deposits/[id]/route.ts:14`
- **Evidence:**
  - FD and loan UPDATE accept `status`, `closedAt`, `principalAmountMinor`, `annualInterestRateBps`, `tenureMonths`, `startDate`, `maturityDate`, `monthlyEmiAmountMinor` and `calculationType`. Nothing regenerates the schedule or adjusts the placement/disbursement.
  - The FD edit form calls the REST PATCH **and** `localUpdateFixedDeposit` with the full `values`, which hard-code `status: "ACTIVE"`, `closedAt: null` and `prematureClosure: false` (l.166-169). The Edit button is shown for MATURED FDs (`accounts/page.tsx:929`).
  - The REST FD PATCH looks the FD up by `userId` only, so household co-owners get 404, while sync UPDATE allows OWNER/CO_OWNER.
- **Impact:**
  - Editing a MATURED FD resets it to ACTIVE. With autoRenew, the next tick renews it.
  - A client can set `status: "CLOSED"` through sync and skip the proceeds posting.
  - Changing an FD's principal leaves the original placement expense, so net worth moves by the difference with no cash flow.
  - Loans get terms that don't match their schedule.
- **Fix:**
  - Whitelist the generic UPDATE to descriptive fields (names, notes, autoRenew).
  - Route term and status changes through server commands that regenerate atomically and adjust linked transactions.
  - Remove `status`/`closedAt` from the FD edit payload.
  - Use `authorizeFixedDeposit` in the PATCH.

### FIN-20: Re-amortization defects
- **Severity:** Medium. **Status:** CONFIRMED (probe). **Effort:** M
- **Where:** `finance-core/loans.ts:181-257`; `pay-emi/route.ts:178-188`; `schedule/[entryId]/route.ts:83-89`; `loans/route.ts:65`
- **Evidence:**
  - **Flat rate, LOWER_EMI:** the code calls `generateAmortizationSchedule(balance, …, "FLAT_RATE")`, which recomputes flat interest on the *reduced* balance. Probe: a 12-month flat loan, LKR 12,000, 12%, with extra principal after month 6 → month-7 interest drops from 12,000 to 5,000 minor.
  - **Flat rate, SHORTER_TENURE:** uses `balance × rate / 12`, which is reducing-balance interest.
  - **SHORTER_TENURE cap:** the loop stops at 240 rows and leaves the balance unamortized without an error. Probe: balance 10,000,000, EMI 30,000 → 240 rows, last closing balance 4,246,177.
  - **Silent fallback:** a falsy `targetEmiMinor` drops to LOWER_EMI.
  - **Stale fields:** after any regeneration, neither `Loan.monthlyEmiAmountMinor` nor `tenureMonths` is updated. The next SHORTER_TENURE uses the stale EMI, and `totalInstallmentsCount: loan.tenureMonths` is wrong.
  - The override route always uses LOWER_EMI, whatever the user picked earlier.
- **Impact:** Flat-rate loans (common for Sri Lankan leases) understate the interest owed after a prepayment. Long loans re-amortized with "shorter tenure" leave principal with no schedule row, so the loan never closes. EMI and progress displays disagree with the schedule.
- **Fix:**
  - Branch on `calculationType`: for flat rate, spread the remaining *original* flat interest over the remaining rows (or follow the lender's rule, and document the choice).
  - Throw instead of truncating.
  - Persist the new EMI and tenure inside the same transaction.

### FIN-21: FD auto-renew/compound gaps
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `cron-runner.ts:386`, `:470-511`; `deposit-proceeds/route.ts:69-115`; `fixed-deposit-modal.tsx:131`
- **Evidence:**
  - When a compound FD auto-renews, `principalAmountMinor = comp.maturityNetAmountMinor`, and no `FD_INTEREST` row or payout record is created. A later deposit-proceeds books the grown principal as `FD_MATURITY` (stats-excluded).
  - Payouts are only posted while status is ACTIVE/MATURED. If the user taps "Deposit proceeds" before the tick that posts the last month, the final month's interest is never posted.
  - `MONTHLY_PAYOUT_TO_ACCOUNT` without `linkedPayoutAccountId` silently gets no payouts. The form only requires the account when savings accounts exist.
  - Deposit-proceeds posts formula interest with no override, so the user can't record the bank's actual figure.
  - Only one renewal is processed per tick.
- **Impact:** Interest earned in renewed terms never shows as income. The last month of interest can be lost. Payout-mode FDs without an account earn nothing anywhere. Maturity amounts can differ from the bank's.
- **Fix:**
  - On renewal, post `FD_INTEREST` and a payout row, and keep a renewal chain.
  - Run the payout catch-up inside close/proceeds before closing.
  - Require a payout account server-side for payout mode.
  - Accept `actualProceedsMinor` at maturity too.
  - Loop renewals until `maturityDate > now`.

### FIN-22: Timezone handling
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `cron-runner.ts:16-23`; `credit-card.ts:57-88`; `budget.ts:46-47,78-81`; `cron-runner.ts:253`; schema date fields (`Loan.startDate`, `LoanScheduleEntry.dueDate`, `FixedDeposit.startDate/maturityDate`, `FixedDepositPayout.periodEnd`, `CreditCardStatement.*Date`, `CreditCardInstallmentPlan.startDate/firstStatementDate`)
- **Evidence:**
  - `timeZone: "Asia/Colombo"` and the `T23:59:59.999+05:30` literal are hard-coded. `User.timezone` (schema l.17) is never read for any financial calculation.
  - Client budgets use `new Date(year, month, 1)`, which is device-local.
  - `cycleStartDate: new Date(lastCutoff.getFullYear(), lastCutoff.getMonth() - 1, cutoffDay)` uses the server's local zone, isn't clamped (day 31 in February rolls into March), and starts *on* the previous cutoff day instead of the day after.
  - Calendar fields are `DateTime`, not `@db.Date` (PRD §2.2).
- **Impact:** Users outside Sri Lanka, or travelling, see wrong budget months, card cycles and due days. Statement start dates are wrong, and client and server month totals can disagree near midnight. FIN-05 is the most visible symptom.
- **Fix:** Build one date module keyed on `user.timezone` and use it on both client and server. Use date-only storage. Derive cycle start as `previousCutoff + 1 day`, clamped.

### FIN-23: Cross-currency gaps
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `cron-runner.ts:222-231`; `credit-card.ts:219-228`; `ingestion.ts:612-634`; `use-account-portfolio.ts:200-225`; schema `Loan`/`FixedDeposit` (no `currency`)
- **Evidence:**
  - The cron maps card transactions without `destinationAmountMinor`.
  - `calculateStatementCycle` sums payments with `tx.amountMinor`.
  - The SMS mismatch hint adds `t.amountMinor` for incoming transfers.
  - A USD savings → LKR card payment is therefore counted in USD cents against an LKR debt.
  - Loans and FDs have no currency column, and net worth adds them to `LKR` unconditionally. `assetsTotal`/`liabilitiesTotal` add LKR and USD balances together.
  - pay-emi lets a USD account pay an LKR loan EMI.
- **Impact:** Card billed/settled status and due amounts are wrong after cross-currency payments. Mismatch hints fire falsely. A USD FD or loan would be valued as LKR.
- **Fix:** Use `destinationAmountMinor ?? amountMinor` everywhere a destination is credited, through the single `calculateLedgerEffect`. Add `currency` to Loan and FD and enforce matching accounts. Never add amounts across currencies.

### FIN-24: Multi-write operations without a transaction
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `sync/push/route.ts:95-1335` (per mutation; `appliedMutation` written last at l.1314); `ingestion.ts:311-560` (cash account, parent tx, fee tx, `bankSms.update`); `transactions/[id]/merge/route.ts:56-74`; `sms/inbox/[id]/merge-transfer/route.ts:94-113`; `sms/inbox/[id]/post/route.ts:112-143`
- **Evidence:**
  - Split items are written as `deleteMany` followed by N `create`s.
  - Placement and disbursement transactions are written before the FD or loan upsert.
  - SMS ingestion creates the transaction, then updates the SMS to PROCESSED.
  - Two concurrent pushes with the same `mutationId` both pass the `findUnique` idempotency check (l.97).
- **Impact:**
  - A crash midway can leave a split transaction with no items, or a placement expense with no FD (if the upsert fails validation, the expense stays).
  - It can also leave an SMS transaction without PROCESSED status. The retry worker then posts it again.
  - An ATM withdrawal can end up without its fee, or the reverse.
- **Fix:** Wrap each unit in `$transaction`. In sync push, insert `appliedMutation` first inside the transaction (unique PK) so duplicates abort cleanly. Use deterministic ids for fee children.

### FIN-25: SMS "post" and "merge-transfer" can repeat on a processed SMS
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `sms/inbox/[id]/post/route.ts:23-143`; `sms/inbox/[id]/merge-transfer/route.ts:15-113`
- **Evidence:**
  - Neither route checks `sms.status` or `sms.transactionId` before creating or converting a transaction.
  - `post` creates a new `prisma.transaction.create` (cuid/uuid default) on every call.
  - `merge-transfer` doesn't check that the counterpart amount equals the SMS amount, or that the currencies match.
- **Impact:** A double tap on "Post" in the review inbox, or a retry after a timeout, creates two transactions for one bank SMS. A transfer merge can pair mismatched amounts.
- **Fix:** Guard with a conditional update (`updateMany({ where: { id, status: { in: ["NEEDS_REVIEW","FAILED"] } } … })`) inside a transaction. Use a deterministic id per SMS (`uuid5(sms.id + ":tx")`). Validate the amount match on merge.

### FIN-26: Cron budget job cost and history rewrite
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `cron-runner.ts:50-193`
- **Evidence:**
  - For each budget, the cron loads *all* of the user's non-excluded transactions with split items (l.61). It then loops every month since the earliest one, calling `getNextServerSeq()` and upserting per month.
  - Closed months are re-written with the **current** `monthlyLimitMinor` (l.141-148).
  - `spentMinor = Math.max(0, netSpent)` drops net refunds.
  - The query filters `userId: budget.userId`, so shared-household spending by other members is ignored.
- **Impact:** Each tick costs O(budgets × transactions × months). Editing a limit rewrites past months and their rollover. Every snapshot gets a new seq on every tick, which forces all devices to re-pull them.
- **Fix:** Freeze closed months once they're written. Aggregate per month with `groupBy`. Only touch the current month on each tick. Decide on household scope.

### FIN-27: Schema integrity
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `prisma/schema.prisma`
- **Evidence:**
  - **Free-text enums:** `type String // CASH | BANK_SAVINGS | CREDIT_CARD`, and the same for transaction type/direction/source, loan kind/status/calculationType, FD status/payoutMode/compounding and schedule status. None are Prisma enums or CHECK constraints.
  - **Missing uniques:**
    - `FixedDepositPayout(fixedDepositId, periodEnd)`;
    - live `(loanId, installmentNumber)`;
    - `LoanPayment.scheduleEntryId` for non-extra payments.
  - **No tombstones:** `LoanPayment` and `FixedDepositPayout` have no `updatedAt`/`deletedAt`, although PRD §2.6 says every synced entity has them.
  - **Nullable for no reason:** `residualValueMinor Int? @default(0)`.
  - **Risky cascades:**
    - `Transaction.account onDelete: Cascade` (a hard account delete wipes its ledger);
    - `Transaction.toAccount onDelete: SetNull` (a transfer keeps debiting the source);
    - `TransactionSplitItem.category onDelete: Cascade` (split sums break).
  - **Missing relations:** `householdId`, `createdByUserId`, `linkedSettlementAccountId` and `possibleDuplicateOfTransactionId` are plain strings with no FK.
  - **Missing indexes:** no `Transaction.toAccountId` index (used by cron, SMS hint and pull), no `Transaction.householdId` index, and no `HouseholdMember.userId` index (queried on every push and pull).
- **Impact:** Invalid states persist. The database can't prevent the duplicates behind FIN-08 and FIN-12. Payment/payout deletions can't sync. Scans grow with ledger size.
- **Fix:** Add enums or CHECK constraints, the unique and partial-unique indexes, tombstones, `Restrict` on ledger-bearing FKs, and the missing indexes, all in one migration.

### FIN-28: Long interactive transactions can hit Prisma's 5 s timeout
- **Severity:** Medium. **Status:** SUSPECTED. **Effort:** S
- **Where:** `loans/route.ts:121-185`; `loans/[id]/route.ts:66-103`; `pay-emi/route.ts:112-258`; `schedule/[entryId]/route.ts:61-127`
- **Evidence:**
  - Inside `$transaction(async tx => …)` with Prisma's default `timeout: 5000`:
    - POST /loans does one `getNextServerSeq(tx)` plus one `create` per installment;
    - PATCH does a `findMany` plus `getNextServerSeq(tx)` plus an `update` per row;
    - extra-principal pay-emi does one `create` per remaining row.
  - A 30-year loan is about 720 round trips for POST/PATCH and about 360 for pay-emi.
  - No `timeout` option is passed.
- **Impact:** On a hosted database (5–10 ms latency), editing or prepaying a long loan can fail with P2028. The whole transaction rolls back and the user sees a generic error.
- **Fix:** Use `createMany` for schedule rows, allocate seq values in one query (`SELECT nextval(...) FROM generate_series(1, n)`), and pass an explicit `timeout`.

### FIN-29: EMI tx counts principal in stats; date always "now"; no category
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `pay-emi/route.ts:114-133`
- **Evidence:** `type: "EXPENSE", subType: "EMI_PAYMENT", transactionDate: now, excludeFromBudget: true, excludeFromStats: false`, with no `categoryId`. The request body has no date field.
- **Impact:** Spending stats include principal repayment, which is a balance-sheet move, so monthly expenses are overstated by the principal. A payment made yesterday can't be backdated, so month-end payments land in the wrong month. The row shows as uncategorized.
- **Fix:** Accept `paymentDate`. Either exclude EMI from stats and report interest from `LoanPayment`, or post interest as a separate categorized row. Confirm the intended behaviour with the PRD owner.

### FIN-30: Balance-mismatch hint is never synced and is checked per user
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `ingestion.ts:587-654`
- **Evidence:**
  - `prisma.account.update({ data: { balanceMismatchHint: … } })` doesn't bump `serverSeq`, so the hint never reaches devices whose cursor is already past the account's last seq.
  - The "newer SMS" check filters only by `userId`, not by account or sender.
  - The ledger sum includes transactions dated after `smsTime`.
- **Impact:** The calibration hint the PRD promises rarely appears, and when it does it may compare against the wrong point in time.
- **Fix:** Bump `serverSeq`, scope the check to the account, and compute the balance as of `smsTime` with `calculateAccountBalance`.

### FIN-31: Float arithmetic and rounding semantics
- **Severity:** Low. **Status:** CONFIRMED (floats in use); a wrong cent is SUSPECTED. **Effort:** M
- **Where:** `loans.ts:37-42,93,99`; `investments.ts:33-37,63-75`; `money.ts:9-14`; `template-parser.ts:76-83`; `sms/inbox/[id]/post/route.ts:38,74`; `calculator.ts:179`
- **Evidence:**
  - Interest is computed as `r = bps / 120000; roundHalfUp(balance * r)`, and compounding uses `Math.pow`.
  - `roundHalfUp(-2.5) = -3`, which is half away from zero, not half-up as PRD §2.1 says.
  - SMS amounts use `Math.round(parseFloat(x) * 100)`, where `1.005` gives 100.
- **Impact:** Occasional one-cent differences against lender statements near .5 boundaries. Inconsistent negative rounding.
- **Fix:** Compute period interest with integer arithmetic (`(balance*bps*2 + 120000) / 240000` in BigInt). Reuse `parseMoneyToMinor` for SMS amounts. Document the rounding mode and add half-boundary test vectors.

### FIN-32: `calculateFlatRateEmi` disagrees with the schedule
- **Severity:** Low. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:** `loans.ts:51-71` vs `:129-169`
- **Evidence:** Probe for P = 100,000, 10%, 7 months: `monthlyEmiMinor` = 15119, schedule row 1 = 15118, last row = 15125. The helper floors `(P + I) / n`, while the schedule floors P and I separately.
- **Impact:** Any UI or caller that previews the EMI with the helper shows a different number from the stored schedule. The stored `monthlyEmiAmountMinor` uses row 1, so this is cosmetic today.
- **Fix:** Derive the EMI from the schedule's row 1, or make both use the same split.

### FIN-33: Deterministic ids are not the PRD's UUIDv5 scheme
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `cron-runner.ts:122,239,302,10`; `push/route.ts:948,1107`; `loans/route.ts:168`; `finance-core/uuid.ts` (the helpers have no callers)
- **Evidence:**
  - Ids are built as `` `inst_${plan.id}_${date}` ``, `snap_…`, `stmt_…`, `${id}-placement` and `${id}-disbursement`.
  - The FD routes and cron each declare their own `FD_NAMESPACE`, which is the RFC 4122 DNS namespace rather than an app namespace.
- **Impact:** A client can't compute the same ids as the server, which blocks offline catch-up without duplicates. Primary keys aren't UUIDs although the schema documents them as such.
- **Fix:** Use the `uuid.ts` helpers with an app-specific namespace everywhere.

### FIN-34: "Investment Yield" lookup ignores tombstones and races
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposits/[id]/close/route.ts:76-89`; `deposit-proceeds/route.ts:83-96`; `cron-runner.ts:416-431`
- **Evidence:** `findFirst({ where: { name: "Investment Yield", OR: [{ userId }, { userId: null }] } })` has no `deletedAt: null`, and is followed by `create` when nothing is found.
- **Impact:** Interest can attach to a deleted category, which hides it from stats. Concurrent runs create duplicate categories.
- **Fix:** Seed the category per user, filter on `deletedAt: null`, and add a unique `(userId, name)` index.

### FIN-35: `(prisma as any)` across money routes; lint errors
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `pay-emi`, `close`, `schedule/[entryId]`, the FD routes, `cron-runner.ts:375-516`, `sync/push`
- **Evidence:** `await (prisma as any).$transaction(async (tx: any) => …)`. ESLint reports 56 errors in these files.
- **Impact:** `tsc --noEmit` passes, but it can't catch wrong field names or a float passed to an Int column in the most sensitive code.
- **Fix:** Remove the casts (the generated client has all these models) and fix the resulting errors.

### FIN-36: Premature-closure penalty invisible; WHT not recorded
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposits/[id]/close/route.ts:47-49`
- **Evidence:** `principalToReturn = min(principal, actual)` and `interestToReturn = max(0, actual − principal)`. A shortfall isn't recorded anywhere, and no payout row records gross interest and tax.
- **Impact:** A penalty shows up as a drop in net worth with no explanatory row, and it's excluded from stats. Interest reports lack the gross and WHT for the closure.
- **Fix:** When `actual < principal`, post the shortfall as a categorized penalty expense. Record a payout row with gross, WHT and net for the closure interest.

### FIN-37: Loan read models
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `loans/route.ts:17-66`; `loans/[id]/route.ts:27-33`
- **Evidence:**
  - `GET /api/loans` filters `userId: session.userId`, so shared household loans are missing. Pull and `authorizeLoan` do include them.
  - `totalInstallmentsCount: loan.tenureMonths` is wrong after SHORTER_TENURE.
  - `remainingPrincipalMinor` ignores pre-paid rows (FIN-06).
- **Impact:** Progress shows as "X of Y" with the wrong Y. Household members see different loan lists depending on which code path loads them.
- **Fix:** Use the household-aware filter, and derive counts and remaining principal from live rows.

### FIN-38: Leftover test scaffolding in sync push
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `push/route.ts:833-871` (installment plan), `:780-794` (budget)
- **Evidence:**
  - The `"Apex Visa Platinum"` card auto-create (`creditLimitMinor: 50000000`) is still present. It's now unreachable, because the account-reference check at l.119-128 rejects unknown `accountId`s first.
  - Placeholder categories are still created for unknown ids: installment plan creates `"General"`, budget creates `"Budgeted Category"`. The budget upsert uses `update: {}`, so a budget can point at another user's category id.
- **Impact:** Placeholder categories pollute stats, and referential errors are hidden instead of rejected.
- **Fix:** Delete these blocks and reject unknown or foreign references.

### FIN-39: Self-transfers and transfers without a destination
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `ledger.ts:56-59`; `transactions/route.ts:42-62`; `push/route.ts:478-520`
- **Evidence:**
  - When `accountId === toAccountId`, `calculateLedgerEffect` returns `-amount` (the primary branch wins), so money disappears.
  - Neither REST nor sync rejects same-account transfers or `TRANSFER` without `toAccountId`.
- **Impact:** Account balances drift for no visible reason.
- **Fix:** Validate `toAccountId` is present and different for TRANSFER.

### FIN-40: Installment cron numbers installments by count, not by cycle
- **Severity:** Low. **Status:** SUSPECTED. **Effort:** S
- **Where:** `cron-runner.ts:285-371`
- **Evidence:**
  - `installmentIndex = initialPaid + count(non-deleted plan txs) + 1`, while existence is checked by `findUnique(deterministicId)`, which includes deleted rows.
  - The first cutoff uses `card.statementCutoffDay` in the month of `firstStatementDate`, even when `firstStatementDate` falls after that day.
  - The tx create and the COMPLETED update are separate writes.
- **Impact:** Deleting one billed installment shifts the numbering, and the final-amount row can be billed on the wrong cycle. A plan can bill one cycle early.
- **Fix:** Derive the index from the cycle offset relative to the first statement. Write the tx and the status together.

---

## 3. Comparison with earlier run (`audit/2026-10-20/domain-financial.md`)

I wrote all of the findings above from the code first. I then compared them with the earlier report's DF-01 to DF-44. The code has changed since that run: the earlier report noted that `node_modules` and `prisma/migrations` were missing, and both now exist.

### 3.1 Fixed since the earlier run

| Earlier | Title | Evidence it's fixed |
|---|---|---|
| DF-02 | FD premature closure posted twice | `fd-close-modal.tsx:59-67` now only calls the server mutation, then updates local status. No local proceeds transactions are created. |
| DF-05 | Money posted into other users' accounts | `assertCanWriteAccount` is now used in pay-emi (l.45), FD close (l.40), deposit-proceeds (l.38), `POST /api/transactions` (l.31, l.42), and as a generic account-reference check in sync push (l.119-128). |
| DF-07 | pay-emi on PAID entries / CLOSED loans | Now returns 409 for non-ACTIVE loans and for unknown or PAID entries (l.62-76). The uncapped `else` branch is still there (see FIN-14). |
| DF-10 | Partial/over-payments marked PAID | The amount must now equal the scheduled EMI (l.88-95). |
| DF-11 | Extra principal duplicated OVERRIDDEN rows; lump-sum payoff never closed | Selection and deletion now both use `status: { not: "PAID" }`. The payoff case tombstones remaining rows (l.226-236). |
| DF-15 | deposit-proceeds had no maturity check; client closed on failure | Server checks `MATURED` or `now >= maturityDate` (l.45-47). Client checks `response.ok` (`accounts/page.tsx:106`). |
| DF-16 | `Date.setMonth` month-end overflow | Replaced by `addMonthsClamped`/`addMonthsOnDay` (`dates.ts`). This introduced a timezone off-by-one, which is new finding FIN-05. |
| DF-32 | Start date forced to "now" | Start-date inputs added (`loan-modal.tsx:194`, `fixed-deposit-modal.tsx:262`). The follow-on handling of already-paid periods is incomplete (FIN-06, FIN-07). |
| DF-34 | Cron secret public default and logged | `cron/tick/route.ts` returns 503 when unset, compares with `timingSafeEqual`, and no longer logs the secret. |
| DF-36 | Tiny 0% loans had an unpayable zero row | Zero-rate EMI now uses `floor`, and the final row absorbs the remainder (probe: 14285 … 14290). |

### 3.2 Partially fixed

| Earlier | What changed | What remains (this run) |
|---|---|---|
| DF-06 | FD routes now use deterministic UUIDv5 principal/interest ids, so the same route can't double-post. | No `$transaction`. Partial failure locks the FD permanently. Close + proceeds use different ids and can double-credit. pay-emi still uses `uuidv4` (FIN-08, FIN-09). |
| DF-17 | The fake "Apex Visa Platinum" card is now unreachable because of the account-reference check. | Dead code remains. Placeholder categories are still created (FIN-38). |
| DF-18 | `POST /api/loans` now sets `serverSeq` on every row. | Allocation still happens before commit, there's still a fallback counter, and the runtime sequence is still created at request time (FIN-15). |
| DF-19 | pay-emi, `POST /api/transactions` and loan PATCH validate their main inputs. | Sync push (FIN-16) and POST /loans, FD PATCH/close, override, SMS post (FIN-17) still don't. |
| DF-20 | `parseMoneyToMinor` is now a strict regex parser. | SMS `amountTextToMinor` and SMS post still use `parseFloat × 100` (FIN-31). |
| DF-22 | SHORTER_TENURE now throws when the EMI doesn't cover interest, which stops negative amortization. | Flat-rate semantics are still wrong in both modes. The 240-row truncation is silent (FIN-20). |
| DF-28 | `prisma/migrations` now exists (4 migrations). | `global_server_seq` is still created at runtime and isn't in any migration (FIN-15). |
| DF-35 | — | Half-away-from-zero rounding and the flat EMI helper mismatch remain (FIN-31, FIN-32). |
| DF-43 | FD close/proceeds now use `authorizeFixedDeposit` (deleted and household-aware). | The new `PATCH /api/fixed-deposits/[id]` is owner-only (FIN-19). |

### 3.3 Still present (unchanged in substance)

| Earlier | This run |
|---|---|
| DF-01 int4 money columns | FIN-01 |
| DF-03 schedule/payment sync with no authorization | FIN-02 |
| DF-04 CREATE blind upsert | FIN-03 |
| DF-08 early close moves no money | FIN-13 |
| DF-09 lease residual | FIN-14 |
| DF-12 override re-opens PAID / stale rows | FIN-10 |
| DF-13 orphaned money effects on delete/edit | FIN-11 |
| DF-14 cron poison pill / no lock | FIN-12 |
| DF-21 float math | FIN-31 |
| DF-23 terms editable via sync, stale EMI | FIN-19, FIN-20 |
| DF-24 FD renew/compound | FIN-21 |
| DF-25 timezone | FIN-22 |
| DF-26, DF-27, DF-42 schema enums, uniques, FKs, cascades, indexes | FIN-27 |
| DF-29, DF-30 non-transactional multi-writes | FIN-24 |
| DF-31 EMI stats/date | FIN-29 |
| DF-33 cron budget | FIN-26 |
| DF-37 deterministic ids | FIN-33 |
| DF-38 Investment Yield lookup | FIN-34 |
| DF-39 `(prisma as any)` | FIN-35 |
| DF-40 premature-closure penalty | FIN-36 |
| DF-41 loan read models | FIN-37 |
| DF-44 cron push reminders re-enqueued every tick | Still present (`cron-runner.ts:514-546`). Not re-raised here because it isn't a financial issue; it belongs to the backend/notifications area. |

### 3.4 New in this run

These were either introduced by changes since the earlier run or missed by it.

| ID | Why new |
|---|---|
| FIN-04 | Loan edit (PATCH) re-opens EMIs paid via pay-emi. The PATCH route and the edit form are new since the earlier run. |
| FIN-05 | One-day-late due dates and month-end FD shift. Introduced by the DF-16 fix: UTC month math on local-midnight start dates. |
| FIN-06 | `paidInstallments` is computed by the new form but ignored by `localCreateLoan`. Client and server remaining-principal formulas disagree. |
| FIN-07 | The new `paidPeriods` is ignored by cron, which back-posts historical FD interest. |
| FIN-09 (aspect) | Permanent P2002 lock-out after a partial FD close, and the close-vs-proceeds double credit. Both are consequences of the new deterministic ids. |
| FIN-17 (aspects) | NaN schedule from an undefined rate, negative rows when residual > principal (probe), WHT > 100% producing a negative payout (probe). |
| FIN-18 | BigInt serialization 500 on the transaction REST routes. The earlier run missed this. |
| FIN-19 (aspect) | FD edit form forces `status: "ACTIVE"` (re-activates MATURED FDs). The FD PATCH route is new. |
| FIN-20 (aspects) | Flat-rate LOWER_EMI recomputes interest on the reduced balance (probe). The 240-row cap leaves principal unscheduled (probe). |
| FIN-23 | Card statements, SMS hint and net worth ignore `destinationAmountMinor` and currency. Cross-currency support was added around the earlier run. |
| FIN-25 | SMS post/merge-transfer double posting on repeat calls. |
| FIN-28 | Prisma interactive-transaction timeout risk for long schedules. |
| FIN-30 | Mismatch hint not synced and not scoped per account. |
| FIN-39 | Self-transfer and destination-less transfer distort balances. |
| FIN-40 | Installment numbering by count. |

### 3.5 Net change

The earlier run had 44 findings: 5 Critical, 13 High, 16 Medium, 10 Low. This run has 40 findings: 3 Critical, 12 High, 14 Medium, 11 Low.

Since the earlier run:
- 10 earlier findings are fixed.
- 9 are partially fixed.
- The rest still apply.

The two Criticals that dropped out are DF-02 (double FD proceeds) and DF-05 (cross-user account writes). The highest-impact remaining items are:
- FIN-01: int4 money columns.
- FIN-02 and FIN-03: sync push authorization holes.
- FIN-04, FIN-05 and FIN-06: loan edit, due dates and historical progress. Every user who adds an existing loan hits these.

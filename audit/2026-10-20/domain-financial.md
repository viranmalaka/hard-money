# Audit: Domain / Financial Correctness, Prisma Schema, Data Integrity

Scope: `prisma/schema.prisma`, `src/lib/finance-core/*`, `src/app/api/loans/**`, `src/app/api/fixed-deposits/**`, `src/lib/jobs/cron-runner.ts`, `src/app/api/sync/push|pull`, `src/lib/sync/client.ts` (loan/FD/transaction local writers), money-moving UI in `src/components/account/*` and `src/app/accounts/page.tsx`, plus money parsing in `src/app/api/transactions/**`, `src/app/api/sms/inbox/[id]/post`, `src/lib/sms/*`.
Spec: `PRD.md` §2.1 (money), §2.2 (time), §2.3–2.7 (ledger, flags, edit/delete, sync, idempotency), §3.G/H (FD/Loan models), Subsystem 5.

Mode: read-only. No code changes, no DB access, no migrations.

## Commands run

| Command | Result |
|---|---|
| `ls`, `find src prisma -type f`, `git log --oneline -5`, `git status --short` | Repo surveyed. Tree clean before and after the audit. `prisma/` contains only `schema.prisma` (no `migrations/`). |
| `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` | NOT RUN. `node_modules/` does not exist in the repo, so none of these can run without `pnpm install`, which mutates the workspace and was outside the allowed non-mutating checks. This also means `node_modules/next/dist/docs/` wasn't available. No finding below depends on Next.js API semantics. |
| `node --experimental-strip-types probe.ts` (scratch copy of `money.ts`, `loans.ts`, `investments.ts` in `/tmp/hm-audit`, deleted afterwards) | Used to confirm numeric behaviour. Output is quoted in the findings (DF-01, DF-16, DF-20, DF-22, DF-36). |

---

## Part 1: How this area works today

### 1.1 Money representation
- All amounts are JS `number`s holding integer minor units (`*Minor`). Rates are basis points (`*Bps`). Helpers live in `src/lib/finance-core/money.ts`: `roundHalfUp`, `parseMoneyToMinor` (uses `parseFloat` and then `*100`), `formatMoney` (always 2 decimals).
- Prisma stores every `*Minor` and `*Bps` as `Int`, which is Postgres `int4`. The PRD requires `BIGINT`.
- Balances are never stored. They're derived from the ledger in `finance-core/ledger.ts` (`calculateLedgerEffect`, `calculateAccountBalance`), on the client from Dexie and on the server in cron.

### 1.2 Loans and leases
| Step | Where | What happens |
|---|---|---|
| Create (UI path) | `loan-modal.tsx` → `localCreateLoan` (`sync/client.ts:877`) | The schedule is generated client-side with `generateAmortizationSchedule`. Due dates use `startDate.setMonth(+n)`. The loan and every schedule entry go into Dexie and the outbox. A local `LOAN_DISBURSEMENT` tx is written with id `${loanId}-disbursement`, but it isn't put in the outbox. `startDate` is always `now`. |
| Create (server) | `sync/push` `loan` CREATE (`push/route.ts:950`) | Upserts the `Loan`. Creates the disbursement tx `${id}-disbursement` server-side. Schedule entries arrive as separate `loanScheduleEntry` CREATE mutations (`:1091`). |
| Create (REST) | `POST /api/loans` (`loans/route.ts:70`) | An alternative path that the UI doesn't use. It generates the schedule and disbursement inside `$transaction`, without setting `serverSeq`. |
| Pay EMI / extra principal | `loan-detail-modal.tsx:112` → `POST /api/loans/[id]/pay-emi` | Server only. It reads the loan outside any transaction, splits principal and interest from the target entry, then inside `$transaction` creates an `EXPENSE/EMI_PAYMENT` tx and a `LoanPayment`, and marks the entry PAID. For extra principal it soft-deletes the SCHEDULED rows and inserts re-amortized rows. It auto-closes the loan when no unpaid rows remain. |
| Override row | `PATCH /api/loans/[id]/schedule/[entryId]` | Sets the row's components and status `OVERRIDDEN`, then re-amortizes later unpaid rows with LOWER_EMI semantics. |
| Early close | `POST /api/loans/[id]/close` | Sets status CLOSED and soft-deletes SCHEDULED rows. No money moves. |
| Derived values | `GET /api/loans`, `GET /api/loans/[id]`, `accounts/page.tsx:198` | `remainingPrincipal = original − Σ payment.principal`. Net worth counts only `ACTIVE` loans as liabilities. |
| Math | `finance-core/loans.ts` | Reducing balance: annuity EMI with `roundHalfUp`, per-period interest `roundHalfUp(balance × bps/120000)`, final row absorbs the remainder. Flat: `floor` spreading with the remainder in the final row. `reamortizeRemainingSchedule` supports LOWER_EMI (regenerate) and SHORTER_TENURE (keep EMI, iterate up to 240 rows). |

### 1.3 Fixed deposits
| Step | Where | What happens |
|---|---|---|
| Create | `fixed-deposit-modal.tsx` → `localCreateFixedDeposit` (`sync/client.ts:777`) → push `fixedDeposit` CREATE (`push/route.ts:797`) | `startDate = now`, and `maturity = setMonth(+tenure)` on the client. The server posts an `FD_PLACEMENT` EXPENSE (id `${id}-placement`) when `fundingAccountId` is set, then upserts the FD. |
| Monthly payouts | `cron-runner.ts:372–470` | For `MONTHLY_PAYOUT_TO_ACCOUNT` with a linked account, iterates `startDate.setMonth(+i)` up to now. For each missing `FixedDepositPayout` (UUIDv5 id), creates the `FD_INTEREST` tx, then the payout row. These are two separate writes. |
| Maturation | `cron-runner.ts:472–510` | If `now ≥ maturityDate`: when autoRenew is on, rolls dates forward and, for compound FDs, replaces `principalAmountMinor` with the net maturity amount. Otherwise sets `MATURED`. |
| Deposit proceeds (maturity) | `accounts/page.tsx:253` → `POST /api/fixed-deposits/[id]/deposit-proceeds` | Server: posts an `FD_MATURITY` principal tx, plus an `FD_INTEREST` tx for compound FDs, then marks CLOSED. These are 3–4 independent writes. The client then always runs `localUpdateFixedDeposit(status: CLOSED)`, even if the request failed. |
| Premature close | `fd-close-modal.tsx:41` → `POST /api/fixed-deposits/[id]/close` | Server posts principal and interest txs and marks CLOSED. The client then also creates the same principal and interest txs locally (new UUIDs, pushed through the outbox) and sets CLOSED. |
| Valuation | `investments.ts:calculateAccruedFdValue` | Compound FDs: principal + linear share of net interest. Monthly-payout FDs: principal. |

### 1.4 Cross-cutting
- **serverSeq.** `getNextServerSeq()` (`server-seq.ts`) runs `nextval('global_server_seq')`. The sequence is created at runtime if it's missing, and there's a fallback to a `SyncSequence` row. The value is always fetched before, and outside, the write that uses it.
- **Transactions.** `$transaction` is used only in `loans/route.ts`, `loans/[id]/pay-emi`, `loans/[id]/close`, `loans/[id]/schedule/[entryId]`, `households/route.ts` and `households/[id]/transfer-ownership`. FD routes, cron, sync push, SMS ingestion and the transaction routes do multi-write work without one. `grep -rn advisory src` finds nothing, so the PRD-mandated advisory lock is absent.
- **Timezone.** `Asia/Colombo` / `+05:30` is hard-coded in `cron-runner.ts:16` and `credit-card.ts:58–66`. `User.timezone` is never read for financial calendars. Client `budget.ts` uses the device's local timezone.

---

## Part 2: Findings

Severity: Critical, High, Medium, Low. Status: CONFIRMED means verified by reading the code and/or running it. SUSPECTED means plausible but not reproduced. Effort: S is under half a day, M is 1–3 days, L is more than 3 days.

### Summary table

| ID | Title | Sev | Status | Effort |
|---|---|---|---|---|
| DF-01 | All money columns are `int4`: overflow above LKR 21,474,836.47 | Critical | CONFIRMED | M |
| DF-02 | FD premature closure posts the proceeds twice (server + client outbox) | Critical | CONFIRMED | S |
| DF-03 | Sync push: `loanScheduleEntry` / `loanPayment` mutations have no authorization | Critical | CONFIRMED | S |
| DF-04 | Sync push CREATE = blind upsert that overwrites any user's row by id | Critical | CONFIRMED | M |
| DF-05 | Money can be posted into another user's account (pay-emi, FD close/proceeds, sync tx CREATE, POST /transactions) | Critical | CONFIRMED | S |
| DF-06 | Money-moving endpoints aren't atomic or idempotent: double-close / double-pay races | High | CONFIRMED | M |
| DF-07 | pay-emi accepts payments on already-PAID entries and on CLOSED/deleted loans | High | CONFIRMED | S |
| DF-08 | Loan early close moves no money; liability disappears from net worth | High | CONFIRMED | M |
| DF-09 | Lease residual is never scheduled; lease auto-closes while the residual is owed | High | CONFIRMED | M |
| DF-10 | Partial and over-payments mark the entry PAID without re-amortizing; schedule diverges from the ledger | High | CONFIRMED | M |
| DF-11 | Extra principal: OVERRIDDEN rows duplicated; full payoff via extra principal never closes the loan | High | CONFIRMED | S |
| DF-12 | Schedule override can rewrite a PAID row (re-opening it) and leaves stale rows when the balance hits the residual | High | CONFIRMED | S |
| DF-13 | Deleting/editing an EMI tx or deleting a loan/FD leaves orphaned financial effects | High | CONFIRMED | M |
| DF-14 | Cron: FD payout poison-pill, no advisory lock, no per-entity error isolation | High | CONFIRMED | M |
| DF-15 | deposit-proceeds: no maturity check; offline/failed call closes the FD with no proceeds | High | CONFIRMED | S |
| DF-16 | `Date.setMonth` month-end overflow in due dates, maturity, payouts, renewals | High | CONFIRMED | S |
| DF-17 | Test scaffolding in production sync: fake "Apex Visa Platinum" card and placeholder categories | High | CONFIRMED | S |
| DF-18 | serverSeq allocated outside the write; pull cursor can skip rows; `POST /api/loans` rows never sync | High | CONFIRMED (design) | M |
| DF-19 | No server-side validation of money inputs (integer, sign, range, split sums) | Medium | CONFIRMED | M |
| DF-20 | Money parsing via `parseFloat × 100` (1.005→100, "1e5"→1500, "12-3"→1200, negatives) | Medium | CONFIRMED | S |
| DF-21 | Interest/EMI math in IEEE-754 floats instead of exact integer arithmetic | Medium | CONFIRMED (risk SUSPECTED) | M |
| DF-22 | SHORTER_TENURE uses reducing-balance math for FLAT_RATE; runaway negative amortization | Medium | CONFIRMED | S |
| DF-23 | Loan/FD terms editable via sync without regenerating schedule; stale `monthlyEmiAmountMinor` | Medium | CONFIRMED | M |
| DF-24 | FD auto-renew/compound: capitalized interest never recorded as income; final payouts lost on close | Medium | CONFIRMED | M |
| DF-25 | Timezone: hard-coded Colombo, device-local budgets, server-local cycle start, date-only as timestamps | Medium | CONFIRMED | M |
| DF-26 | Schema: free-text enums, missing unique constraints, payouts/payments lack tombstones | Medium | CONFIRMED | M |
| DF-27 | Schema: missing FKs and dangerous cascades | Medium | CONFIRMED | M |
| DF-28 | No Prisma migrations; global sequence created at runtime | Medium | CONFIRMED | S |
| DF-29 | Sync push mutation application isn't transactional (split items, placement+FD, appliedMutation) | Medium | CONFIRMED | M |
| DF-30 | SMS ingestion / merge / tx routes do multi-writes without a transaction | Medium | CONFIRMED | S |
| DF-31 | EMI tx: principal counted as expense in stats; payment date always "now" | Medium | CONFIRMED | S |
| DF-32 | UI forces loan/FD start date = now; existing loans/FDs can't be recorded correctly | Medium | CONFIRMED | S |
| DF-33 | Cron budget rollover: O(budgets × all txs) per tick; closed months rewritten with today's limit | Medium | CONFIRMED | M |
| DF-34 | Cron secret has a public default and is logged | Medium | CONFIRMED | S |
| DF-35 | Rounding/formatting edge semantics (negative half-up, fixed 2 decimals, flat EMI floor) | Low | CONFIRMED | S |
| DF-36 | Tiny 0% loans produce a 0-amount final row that can never be paid | Low | CONFIRMED | S |
| DF-37 | Deterministic IDs aren't UUIDv5 as specified; `uuid.ts` helpers unused | Low | CONFIRMED | S |
| DF-38 | "Investment Yield" category lookup ignores tombstones and races into duplicates | Low | CONFIRMED | S |
| DF-39 | `(prisma as any)` in every money route disables type checking | Low | CONFIRMED | S |
| DF-40 | Premature-closure penalty is invisible; WHT not applied to premature interest | Low | CONFIRMED | S |
| DF-41 | Loan read models: `totalInstallmentsCount`, `nextDueDate` inaccurate after regeneration | Low | CONFIRMED | S |
| DF-42 | Missing indexes for hot financial queries | Low | CONFIRMED | S |
| DF-43 | FD routes ignore `deletedAt` and household roles | Low | CONFIRMED | S |
| DF-44 | Cron push reminders re-enqueued on every tick after the reminder time | Low | CONFIRMED | S |

---

### DF-01: All money columns are `int4`: overflow above LKR 21,474,836.47
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** M
- **Where:** `prisma/schema.prisma`. Every `*Minor` field, e.g. `Account.openingBalanceMinor` (l.105), `Transaction.amountMinor` (l.146), `TransactionSplitItem.amountMinor` (l.215), `FixedDeposit.principalAmountMinor` (l.369), `Loan.originalPrincipalMinor` (l.423), `LoanScheduleEntry.openingBalanceMinor` (l.455), `CreditCardStatement.*DebtMinor`, `Budget.monthlyLimitMinor`.
- **Evidence:** `originalPrincipalMinor      Int`. Prisma `Int` maps to Postgres `integer` (max 2,147,483,647). The PRD (§2.1) says: "All monetary amounts are integers in minor units … Postgres `BIGINT`". Probe output: `INT4 max as LKR: 21474836.47`, and for an LKR 25M loan, `opening (exceeds int4?): true`.
- **Impact:** Ordinary Sri Lankan housing loans, leases and FDs above about LKR 21.5M fail to insert (Prisma "value out of range"). Opening balances and credit limits hit the same ceiling. The app can't hold the core use case for many households.
- **Fix:** Change every `*Minor` column to `BigInt` (`@db.BigInt`). Serialize as string or number at the API edge (assert `Number.isSafeInteger`, as the PRD says). Add a migration. Update the BigInt→Number conversions in the routes and Dexie.

### DF-02: FD premature closure posts the proceeds twice
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/components/account/fd-close-modal.tsx:55–103`, `src/app/api/fixed-deposits/[id]/close/route.ts:47–107`
- **Evidence:** The client calls `fetch('/api/fixed-deposits/${fd.id}/close', …).catch(() => {})`. The server then creates `FD_MATURITY` + `FD_INTEREST` transactions with `uuidv4()` ids. Afterwards the client runs `await localCreateTransaction(db, { … subType: "FD_MATURITY" … })` and, if there's interest, another `FD_INTEREST`. `localCreateTransaction` (`sync/client.ts:432–470`) generates a new `uuidv4()` and adds an outbox CREATE, so sync pushes it as a second, distinct row.
- **Impact:** Every premature closure credits the target account twice (principal, plus interest twice). Net worth and income stats are overstated by the full proceeds. When the server rejects (e.g. "already closed"), the response is ignored and the local postings still happen, so retries add more duplicates.
- **Fix:** Pick one writer. Recommended: the server endpoint is authoritative and the client only pulls. Or the client writes rows with deterministic ids (`uuid5(fdId+":close:principal")`) and the server only marks the status. Check `res.ok` and surface errors.

### DF-03: Sync push `loanScheduleEntry` / `loanPayment` mutations have no authorization
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/sync/push/route.ts:1091–1161`
- **Evidence:** `await (prisma as any).loanScheduleEntry.updateMany({ where: { id: mutation.id }, data: {...} })` (UPDATE, l.1121) and the same for DELETE (l.1133). CREATE upserts with `loanId: payload.loanId` (l.1094). `loanPayment.upsert` (l.1144) is likewise unchecked. None of them verify that the loan belongs to the caller or that the caller has a household role.
- **Impact:** Any authenticated user who knows or guesses an id can rewrite or delete another user's amortization schedule, or attach payments to their loan, which changes the derived remaining principal and net worth. A VIEWER or CONTRIBUTOR can edit shared loan schedules, bypassing PRD §3.A. Clients can also mark entries PAID directly with no money moved.
- **Fix:** Resolve `loan = findUnique(entry.loanId)` and apply the same owner/role check as for `loan`. Better: make schedule entries and payments server-derived only (reject client writes except OVERRIDE through the REST route).

### DF-04: Sync push CREATE = blind upsert that overwrites any user's row by id
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/sync/push/route.ts`: account (l.129), category (l.260), transaction (l.363), template (~l.580), installment plan (~l.735), fixed deposit (l.839), loan (l.992), loanScheduleEntry (l.1094)
- **Evidence:** `prisma.transaction.upsert({ where: { id: mutation.id }, create: {...}, update: { accountId: payload.accountId, amountMinor: payload.amountMinor, … } })`. There's no ownership or role check before the `update` branch. Authorization for UPDATE/DELETE exists, but CREATE skips it.
- **Impact:** Sending `op: "CREATE"` with an existing id from another user (ids are exposed to household members via pull) rewrites amounts, accounts and flags on their transactions, FDs, loans and accounts. The `update` branch also un-deletes (`deletedAt: null`) tombstoned rows.
- **Fix:** In CREATE, use `create` and treat a unique violation as a conflict, or `findUnique` first and reject when `existing.userId !== user.id` (and run the role check). Don't reset `deletedAt` on CREATE replay of a row the caller doesn't own.

### DF-05: Money can be posted into another user's account
- **Severity:** Critical. **Status:** CONFIRMED. **Effort:** S
- **Where:**
  - `src/app/api/loans/[id]/pay-emi/route.ts:24,92`: `accountId` from the body is used directly in `tx.transaction.create`.
  - `src/app/api/fixed-deposits/[id]/close/route.ts:34` and `deposit-proceeds/route.ts:32`: `targetAccountId = body.targetAccountId || …` with no ownership check.
  - `src/app/api/sync/push/route.ts:302–327`: the check runs only `if (acc?.householdId)`, so a *private* account of another user passes.
  - `src/app/api/transactions/route.ts:26–55`: same pattern; the private account owner is never compared.
- **Impact:** A user can debit or credit any other user's private account (IDOR on the ledger). This corrupts their balances and net worth. Also, `accountId` values that don't exist produce 500s instead of 400/404.
- **Fix:** Add one `assertCanWriteAccount(user, accountId)` helper (owner, or OWNER/CO_OWNER/CONTRIBUTOR of a shared account). Call it in every money-moving path and validate account type (e.g. proceeds go to `BANK_SAVINGS`/`CASH`).

### DF-06: Money-moving endpoints aren't atomic or idempotent: double-close / double-pay races
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `fixed-deposits/[id]/close/route.ts:18–117`, `fixed-deposits/[id]/deposit-proceeds/route.ts:19–123`, `loans/[id]/pay-emi/route.ts:35–86`, `loans/[id]/close/route.ts:17–47`
- **Evidence:**
  - The FD routes check `if (fd.status === "CLOSED")` and then make 3–4 independent `prisma.*.create/update` calls. There's no `$transaction` and no conditional update.
  - pay-emi reads `loan` + `scheduleEntries` + `payments` (l.35) before `$transaction` (l.86). The entry update `where: { id: targetEntry.id }` doesn't require `status != PAID`.
  - All tx ids are `uuidv4()`, and none of these routes accept an Idempotency-Key.
- **Impact:** Double-clicks, network retries or two devices in parallel both pass the status check, so proceeds or EMI payments are posted twice. A crash midway leaves the principal posted with the FD still ACTIVE, and a retry posts it again.
- **Fix:**
  - Wrap each route in `prisma.$transaction` (Serializable, or `SELECT … FOR UPDATE` via `$queryRaw`).
  - Guard state with conditional writes: `updateMany({ where: { id, status: { in: ["ACTIVE","MATURED"] } }, data: { status: "CLOSED" } })` and abort if `count === 0`. For entries, use `where: { id, status: { not: "PAID" } }`.
  - Use deterministic tx ids (`uuid5(fdId+":maturity")`, `uuid5(entryId+":payment")`) or a client-supplied idempotency key with a unique index.

### DF-07: pay-emi accepts payments on PAID entries and on CLOSED loans
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/pay-emi/route.ts:35–62`, `:83`
- **Evidence:** `where: { id, userId: session.userId, deletedAt: null }` has no status filter. `targetEntry = loan.scheduleEntries.find((e) => e.id === scheduleEntryId)` doesn't check `targetEntry.status`. If `scheduleEntryId` isn't found, the code falls to `else { principalComponent = amountMinor; }` and books the whole amount as principal with no schedule link. The UI sends `nextScheduled?.id` from possibly stale local state (`loan-detail-modal.tsx:122`).
- **Impact:** The same installment can be paid repeatedly. Every repeat reduces the derived remaining principal again, and remaining principal is clamped at 0, which hides the overpayment. Closed loans keep accepting payments.
- **Fix:** Reject when `loan.status !== "ACTIVE"`, when the entry is PAID or deleted, or when `scheduleEntryId` is supplied but not found. Cap principal at the outstanding balance and return 409 for over-allocation.

### DF-08: Loan early close moves no money; liability disappears from net worth
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/loans/[id]/close/route.ts:28–47`, `src/app/accounts/page.tsx:209–213`
- **Evidence:** The close route only does `loan.update({ status: "CLOSED" })` and `loanScheduleEntry.updateMany({ where: { status: "SCHEDULED" }, data: { deletedAt } })`. No payoff transaction or `LoanPayment` is created. Net worth sums `loans.filter(l => l.status === "ACTIVE")`. OVERRIDDEN rows aren't removed. A loan that's already CLOSED can be closed again.
- **Impact:** Closing a loan with LKR X outstanding raises net worth by X instantly, with no matching outflow from any account. History shows the loan "closed" with `remainingPrincipalMinor > 0`. This contradicts the "early payoff" label in the UI (`loan-detail-modal.tsx:143`).
- **Fix:** Require `{ accountId, payoffAmountMinor, date }`. In one transaction, post the payoff `EXPENSE` plus a `LoanPayment` (principal = outstanding, interest/penalty = remainder), soft-delete all unpaid rows (SCHEDULED and OVERRIDDEN), and close with a status guard. Offer "write off" as an explicit separate action if needed.

### DF-09: Lease residual is never scheduled; lease auto-closes while the residual is owed
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/lib/finance-core/loans.ts:105–108`, `:141–144`; `pay-emi/route.ts:197–215`; `sync/client.ts:1094–1120`
- **Evidence:** The final row is `closingBalance = residualValueMinor`. Probe: `lease final closing: 20000000 sum principal: 100000000` (P = 1.2M, R = 200k). No schedule row or payment exists for the residual. pay-emi closes the loan when `remainingUnpaid === 0`.
- **Impact:** After the last EMI the lease shows CLOSED and drops out of liabilities, while the balloon/buy-out (often 20–40% of the financed amount) is still owed. Net worth is overstated and the user gets no reminder.
- **Fix:** Add an explicit final "RESIDUAL" schedule row (or a `kind: BALLOON` entry) due at maturity. Only auto-close when the remaining principal reaches 0. Show the residual separately in the UI.

### DF-10: Partial and over-payments mark the entry PAID without re-amortizing
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/loans/[id]/pay-emi/route.ts:68–81`, `:122–130`
- **Evidence:**
  ```ts
  if (amountMinor !== scheduledEmi) {
    if (amountMinor <= interestComponent) { interestComponent = amountMinor; principalComponent = 0; }
    else { principalComponent = amountMinor - interestComponent; }
  }
  … status: "PAID"
  ```
- **Impact:**
  - Underpayment: the row becomes PAID, unpaid interest/principal vanishes from the schedule, and later rows still assume the original balance. The schedule no longer reconciles with `remainingPrincipal`, and the loan can "close" with principal still owed.
  - Overpayment: the extra principal reduces derived principal, but later rows aren't re-amortized, so the final row over-collects.
  - Paying more than the outstanding balance is silently absorbed by `Math.max(0, …)`.
- **Fix:** Treat any difference from the scheduled EMI explicitly. Shortfall: keep the row partially paid (add a `PARTIAL` status / `paidAmountMinor`) or roll it into the next row. Excess: book it as an extra-principal `LoanPayment` and re-amortize. Reject amounts above outstanding + interest.

### DF-11: Extra principal duplicates OVERRIDDEN rows; full payoff via extra principal never closes the loan
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/pay-emi/route.ts:139–194`
- **Evidence:**
  - `remainingScheduled = loan.scheduleEntries.filter((e) => e.status !== "PAID")` includes OVERRIDDEN rows and sets `startInstallment`/`remainingTenure` from them. But the soft-delete is `updateMany({ where: { loanId, status: "SCHEDULED" } })`, so OVERRIDDEN rows survive while new rows with the same `installmentNumber` are inserted.
  - When `remainingPrincipal <= residual` (payoff), the `if` at l.146 is skipped and the SCHEDULED rows remain, so `remainingUnpaid > 0` and the loan stays ACTIVE with zero principal.
  - The soft-delete also has no `deletedAt: null` filter, so it re-stamps previously deleted rows.
- **Impact:** Duplicate installments (two #N rows) appear and are both payable. A loan paid off with a lump sum keeps showing future EMIs and stays in liabilities (at 0) and in reminders.
- **Fix:** Use the same predicate for selection and deletion (`status: { not: "PAID" }, deletedAt: null`). If `remainingPrincipal <= residual`, soft-delete all unpaid rows and close the loan.

### DF-12: Schedule override can rewrite PAID rows and leaves stale rows
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/schedule/[entryId]/route.ts:39–76`
- **Evidence:** `targetEntry` is looked up with no status check, then updated to `status: "OVERRIDDEN"` (l.66). Re-amortization runs only `if (subsequentEntries.length > 0 && newClosing > residual)`. Inputs aren't validated (negative or float values are accepted). `newEmi` is computed and unused.
- **Impact:**
  - Overriding a PAID row flips it back to unpaid, so it can be paid again (double payment). Its components also diverge from the recorded `LoanPayment`.
  - When an override reduces the balance to the residual or below, later rows aren't removed, so the schedule over-collects.
  - Every override silently switches later rows to a new EMI (LOWER_EMI), while `Loan.monthlyEmiAmountMinor` is unchanged.
- **Fix:** Reject overrides of PAID rows (or keep `status: PAID` and add an `isOverridden` flag). Validate that values are non-negative integers and that `principal <= openingBalance − residual`. When `newClosing <= residual`, delete the remaining unpaid rows. Keep EMI constant and adjust the final row instead of re-amortizing, unless the user asks otherwise.

### DF-13: Deleting/editing an EMI tx or deleting a loan/FD leaves orphaned financial effects
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:**
  - `src/app/api/sync/push/route.ts:524–575` (tx DELETE), `:440–500` (tx UPDATE), `:1062–1089` (loan DELETE), `:921–948` (FD DELETE)
  - `src/app/api/transactions/[id]/route.ts:56–66`, `:118–126`
  - `src/lib/sync/client.ts:1020–1039`, `:860–875`
- **Evidence:**
  - The tx DELETE soft-deletes only the transaction. `LoanPayment` (FK `onDelete: SetNull` only fires on hard delete) and the schedule entry stay PAID.
  - Loan DELETE soft-deletes only `Loan`. Schedule entries, payments and the `${id}-disbursement` INCOME tx remain on the server (the client deletes entries locally only).
  - FD DELETE leaves the `${id}-placement` EXPENSE.
  - PRD §2.5: "Editing a transaction that is part of a `LoanPayment` triggers schedule re-evaluation."
- **Impact:**
  - Deleting an EMI tx restores the cash while the loan still counts that principal as repaid.
  - Deleting a loan keeps the disbursement income in the bank balance with no liability, so net worth is inflated by the full principal.
  - Deleting an FD keeps the placement expense with no asset, so net worth drops by the principal.
  - Editing an EMI amount doesn't change the split.
- **Fix:** Implement cascade rules in one service used by both REST and sync:
  - Tx delete/edit with a linked `LoanPayment`: delete or recompute the payment, revert the entry to SCHEDULED, and re-amortize.
  - Loan/FD delete: soft-delete the disbursement/placement tx, entries, payments and payouts (or block delete while money rows exist).
  - Block direct deletion of system-generated rows (`source: SYSTEM`), as is already specified for `CC_INSTALLMENT`.

### DF-14: Cron FD payout poison-pill, no advisory lock, no per-entity isolation
- **Severity:** High. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/lib/jobs/cron-runner.ts:401–467`, `:300–345`, and the whole `runCronTick`; `src/app/api/v1/cron/tick/route.ts:18–24`
- **Evidence:**
  - `existingPayout` checks only `FixedDepositPayout`. The code then runs `transaction.create({ id: deterministicTxId })` (l.434) followed by `fixedDepositPayout.create` (l.455) as two separate writes. If the process dies or the second write fails, the next run finds no payout and re-creates the tx with the same id, hitting P2002. That throws out of `runCronTick`, and since there's no try/catch per entity, every later tick fails at the same point.
  - Installment plans have the same check-then-create race (`findUnique` then `create` with `inst_…`, l.303–336).
  - There's no `pg_advisory_lock`, although PRD §2.7 requires one.
- **Impact:** One interrupted payout permanently stops all later cron work for all users: FD payouts, maturation, installment billing, statements and reminders. Overlapping ticks (an external cron plus a login-triggered catch-up) throw unique violations partway through.
- **Fix:**
  - Wrap each per-entity unit in `$transaction`, writing the tx and payout together.
  - Use `createMany({ skipDuplicates: true })` or `upsert` for deterministic ids.
  - Take `pg_try_advisory_lock(<const>)` at tick start.
  - Wrap each entity loop body in try/catch with logging so one bad record can't block the rest.

### DF-15: deposit-proceeds: no maturity check; offline/failed call closes the FD with no proceeds
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/fixed-deposits/[id]/deposit-proceeds/route.ts:27–31`, `:64–72`; `src/app/accounts/page.tsx:253–275`
- **Evidence:**
  - The server only checks `fd.status === "CLOSED"`, not `MATURED` or `now >= maturityDate`. For compound FDs it books the *full-term* interest (`calculateCompoundMaturity(... fd.tenureMonths ...)`) whenever it's called.
  - The client runs `try { await fetch(…) } catch { /* offline fallback */ }`, then always `localUpdateFixedDeposit(db, fd.id, { status: "CLOSED" })`. `fetch` doesn't throw on 4xx/5xx.
- **Impact:** A direct API call on day 1 credits full maturity interest (fabricated income). Offline, or when the server returns an error, the UI closes the FD and the sync push sets the server FD to CLOSED with no `FD_MATURITY`/`FD_INTEREST` rows. The principal vanishes from net worth, because the placement expense remains and the asset is gone.
- **Fix:** Server: require `status === "MATURED"` or `now >= maturityDate`, otherwise direct to premature close. Client: only update local state from the server response (`res.ok`), queue an outbox "proceeds" command when offline, and never send a bare status flip.

### DF-16: `Date.setMonth` month-end overflow in due dates, maturity, payouts, renewals
- **Severity:** High. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:** `src/app/api/loans/route.ts:130`, `pay-emi/route.ts:177`, `schedule/[entryId]/route.ts:104`, `src/lib/sync/client.ts:922`, `fixed-deposit-modal.tsx:103`, `cron-runner.ts:391`, `:479`
- **Evidence:** `dueDate.setMonth(dueDate.getMonth() + row.installmentNumber)`. Probe with start 2026-01-31: `due 1 2026-03-03, due 2 2026-03-31, due 3 2026-05-01`. `setMonth` also runs in the server or device local timezone, on a timestamp that includes the creation time-of-day.
- **Impact:** For loans/FDs started on the 29th–31st, February (and other short months) is skipped. Due dates and payout dates drift by 1–3 days, two installments can fall in the same month, and FD maturity lands a few days late. This breaks PRD §2.2 ("effective day = min(configuredDay, lastDayOfMonth)"), reminders and overdue logic.
- **Fix:** Add a shared `addMonthsClamped(dateOnly, n)` (e.g. date-fns `addMonths`, already a dependency, which clamps) operating on `YYYY-MM-DD` in the user's timezone. Use it everywhere a period date is derived.

### DF-17: Test scaffolding in production sync: fake "Apex Visa Platinum" card and placeholder categories
- **Severity:** High. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/sync/push/route.ts:709–744`, `:638–651`
- **Evidence:** `if (!accExists) { await prisma.account.create({ data: { id: payload.accountId, name: "Apex Visa Platinum", type: "CREDIT_CARD", creditLimitMinor: 50000000, statementCutoffDay: 20, paymentDueDay: 10 } }) }`. The budget CREATE upserts a category named "Budgeted Category", and installment plan CREATE creates "General".
- **Impact:** If an installment plan syncs before its card (ordering, a deleted card, a crafted request), the server creates a phantom credit card with a LKR 500,000 limit in the user's account list and net worth. Placeholder categories pollute stats. It also hides referential errors that should be rejected.
- **Fix:** Remove these blocks. Reject the mutation with "referenced account/category not found", and rely on the existing entity priority ordering. Keep any test seeding behind `E2E_MODE`.

### DF-18: serverSeq allocated outside the write; pull can skip rows; `POST /api/loans` rows never sync
- **Severity:** High. **Status:** CONFIRMED (design; race not reproduced live). **Effort:** M
- **Where:** `src/lib/server-seq.ts:5–43`; every caller (e.g. `pay-emi/route.ts:64` before `$transaction` at l.86, `push/route.ts:113`); `src/app/api/loans/route.ts:110–166` (no `serverSeq`); `src/app/api/sync/pull/route.ts:50–171`
- **Evidence:** The seq is taken with `nextval` and committed later. Pull uses `serverSeq: { gt: cursor }` and advances the cursor to the max seen. `POST /api/loans` creates the loan, entries and disbursement with the default `serverSeq 0`. The fallback switches to the `SyncSequence` row, which is a different counter.
- **Impact:** If request A takes seq 100, B takes 101 and commits, and a pull runs before A commits, the client's cursor passes 100 and A's rows are never pulled. These can be EMI payments, payouts or balance-affecting transactions. Loans made via `POST /api/loans` never reach any device whose cursor is above 0. Mixing the two counters can make seq go backwards.
- **Fix:** Assign `serverSeq` inside the same DB transaction, using a DB default `nextval('global_server_seq')` on the column or a trigger. On pull, only return rows with `serverSeq <= (SELECT last committed safe watermark)`, e.g. track `pg_snapshot_xmin`, or re-read a small overlap window and dedupe by id. Remove the fallback counter. Always set `serverSeq` on every write, including `POST /api/loans`.

### DF-19: No server-side validation of money inputs
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:**
  - `sync/push/route.ts` (all `payload.*Minor ?? 0`)
  - `transactions/route.ts:63` (`amountMinor: Number(amountMinor)`), `transactions/[id]/route.ts:60`
  - `fixed-deposits/[id]/close/route.ts:31–33` (any `number`, including negative or fractional)
  - `loans/route.ts:92–102` (`annualInterestRateBps` and `calculationType` unchecked; an undefined rate gives a NaN schedule)
  - `schedule/[entryId]/route.ts:23`
  - `sms/inbox/[id]/post/route.ts:30–31` (`body.amountMinor` unchecked)
- **Evidence:** `zod` is a dependency, but it isn't used in any of these routes. Split items are inserted without checking `Σ split.amountMinor === parent.amountMinor` (PRD §2.4). Nothing enforces `residual < principal`, `tenureMonths` bounds, `annualInterestRateBps` range, or `currency === defaultCurrency` (§2.1).
- **Impact:** Negative or fractional amounts, NaN, zero-amount rows, split mismatches and invalid enums enter the ledger. Prisma Int errors become opaque 500s. Budgets and stats derived from splits become inconsistent.
- **Fix:** Add shared zod schemas per entity: `z.number().int().safe().positive()` for amounts, bps in [0, 100000], enums, and a split-sum refinement. Apply them in the REST routes and in each sync mutation, rejecting per mutation.

### DF-20: Money parsing via `parseFloat × 100`
- **Severity:** Medium. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:** `src/lib/finance-core/money.ts:46–52`, `src/lib/sms/template-parser.ts:63–69`, `sms/inbox/[id]/post/route.ts:32`, `quick-add-modal.tsx:194`, `calibration-modal.tsx:129`
- **Evidence:** `const cleaned = input.replace(/[^0-9.-]/g, ""); const parsed = parseFloat(cleaned); return roundHalfUp(parsed * 100);`. Probe: `parse 1.005 -> 100` (half-up expects 101), `parse 1e5 -> 1500`, `parse 12-3 -> 1200`, `parse -50 -> -5000`.
- **Impact:** Values that typed or SMS amounts with 3+ decimals or exponent-like text produce wrong minor values, and stray minus signs are accepted. Silent misparse breaks the PRD guarantee that LLM/SMS amounts are validated.
- **Fix:** Use a string-based decimal parser. Validate with `/^\d{1,15}(\.\d{1,2})?$/` after stripping grouping separators, split on ".", and build the integer as `major*100 + minor`. Reject anything else, including more than 2 decimals unless an explicit rounding policy applies.

### DF-21: Interest/EMI math in floating point
- **Severity:** Medium. **Status:** CONFIRMED that floats are used; a concrete wrong cent is SUSPECTED, not reproduced. **Effort:** M
- **Where:** `finance-core/loans.ts:37–42`, `:93`, `investments.ts:33–37`, `:63–75`, `calculator.ts:179`
- **Evidence:** `const r = annualInterestRateBps / (10000 * 12); const interestComponent = roundHalfUp(currentBalance * r);`. `bps/120000` isn't representable exactly, so products near .5 can round the wrong way. `Math.pow` is used for compounding.
- **Impact:** Occasional off-by-one-cent interest versus lender statements and between client and server (different JS engines are generally consistent, but this isn't guaranteed for `Math.pow`). Golden-vector unit tests pass for the chosen inputs only.
- **Fix:** Compute period interest with exact integers: `interest = (balance * bps * 2 + 120000) / 240000` (BigInt, half-up). Use a decimal library for the annuity factor and round once. Document the rounding in tests with half-boundary vectors.

### DF-22: SHORTER_TENURE uses reducing-balance math for FLAT_RATE; runaway negative amortization
- **Severity:** Medium. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:** `src/lib/finance-core/loans.ts:197–238`
- **Evidence:** The loop always uses `interest = roundHalfUp(balance * r)` regardless of `calculationType`. Probe on a flat loan: interests `[1000000, 898000, 794980, 690930]`, so the loan switches to reducing balance. With `targetEmiMinor` below the interest: `EMI below interest rows: 240 last closing: 594627647`, a growing balance with negative principal rows.
- **Impact:** Flat-rate loans regenerated with "shorter tenure" understate interest owed. If the EMI doesn't cover the interest (high rate or stale EMI), 240 bogus rows with negative principal are persisted.
- **Fix:** Branch on `calculationType` (flat: keep the remaining flat interest spread evenly). Reject or switch to LOWER_EMI when `targetEmi <= interest`. Assert `principalComponent > 0`.

### DF-23: Loan/FD terms editable via sync without regeneration; stale EMI
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `sync/push/route.ts:1051–1060` (loan UPDATE accepts `monthlyEmiAmountMinor`, `tenureMonths`, `status`), `:906–919` (FD UPDATE accepts `principalAmountMinor`, `startDate`, `maturityDate`, `status`), `:992–1027` (loan CREATE-upsert update branch accepts principal/rate/type); `pay-emi/route.ts:150–159`
- **Evidence:** No schedule regeneration and no placement adjustment. After a LOWER_EMI regeneration, `Loan.monthlyEmiAmountMinor` isn't updated, and the next SHORTER_TENURE passes the stale value (l.158).
- **Impact:** The schedule, EMI and principal disagree. Changing an FD's principal doesn't change the `FD_PLACEMENT` expense, so net worth changes by the delta with no cash movement. Setting `status: "CLOSED"` via sync bypasses the proceeds posting entirely.
- **Fix:** Whitelist editable fields (name, note, autoRenew). Route term changes through server commands that regenerate atomically and update `monthlyEmiAmountMinor`. Forbid status transitions through generic UPDATE.

### DF-24: FD auto-renew and compound edge cases
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/lib/jobs/cron-runner.ts:472–510`, `:374–381`, `:386–392`; `investments.ts:63–75`; `deposit-proceeds/route.ts:64`
- **Evidence:**
  - On auto-renew of a compound FD, `principalAmountMinor = comp.maturityNetAmountMinor` overwrites the principal without posting `FD_INTEREST`. A later `deposit-proceeds` posts that grown principal as `FD_MATURITY` (stats-excluded).
  - Payouts are processed only while `status in [ACTIVE, MATURED]`. If the user closes before the tick that would post the final month, that payout is never posted.
  - An overdue auto-renew FD only renews one term per tick.
  - QUARTERLY/ANNUALLY with tenures that aren't multiples use a fractional exponent (probe: `n*t = 4.33`).
  - Monthly payouts are skipped silently when `linkedPayoutAccountId` is null (the UI only requires it when savings accounts exist, `fixed-deposit-modal.tsx:90`).
- **Impact:** Interest earned in renewed terms never appears as income. Final-month interest can be lost. Maturity values for odd tenures don't match bank practice. Monthly-payout FDs without an account accrue nothing anywhere.
- **Fix:**
  - On renewal, post `FD_INTEREST` (gross, WHT and net in a payout row) and keep a renewal history (new FD row linked to the old one).
  - Run the payout catch-up inside the close/proceeds command before closing.
  - Loop renewals until `maturityDate > now`.
  - Define compounding for partial periods (simple interest on the stub).
  - Require a payout account server-side for `MONTHLY_PAYOUT_TO_ACCOUNT`.

### DF-25: Timezone and date handling
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `cron-runner.ts:13–21`, `credit-card.ts:55–66`, `:68–88`; `budget.ts:46–47`, `:78–81`; `cron-runner.ts:252`; `schema.prisma` date fields (`FixedDeposit.startDate/maturityDate`, `Loan.startDate`, `LoanScheduleEntry.dueDate`, `FixedDepositPayout.periodEnd`, `CreditCardStatement.*Date`, `CreditCardInstallmentPlan.startDate/firstStatementDate`)
- **Evidence:**
  - `timeZone: "Asia/Colombo"` and the `T23:59:59.999+05:30` literal are hard-coded, and `User.timezone` (schema l.17) is never used.
  - Client budgets use `new Date(range.year, range.month, 1)`, which is device-local, while the cron uses Colombo.
  - `cycleStartDate: new Date(y, m - 1, card.statementCutoffDay)` is server-local midnight, unclamped (cutoff 31 in February rolls into March), and starts *on* the previous cutoff day rather than after its end.
  - All date-only fields are `DateTime` (Prisma: `timestamp(3)`), not `@db.Date` as PRD §2.2 requires. Loan due dates carry the creation time-of-day.
  - FD payout `periodEnd` strings come from `getColomboDateString(payoutDate)`, where `payoutDate` came from server-local `setMonth`.
- **Impact:** Users outside Sri Lanka, or travelling, get wrong budget months, statement cycles and due days. Client and server budget "spent" totals disagree around midnight and at month boundaries. Statement `cycleStartDate` is wrong for short months and is off by a day.
- **Fix:** Store calendar dates as `@db.Date` (`YYYY-MM-DD`). Add a single date module (e.g. `date-fns-tz`) that takes `user.timezone`. Derive cycle start as `previousCutoff + 1 day` with clamping. Use the same function on client and server.

### DF-26: Schema: free-text enums, missing unique constraints, no tombstones on payouts/payments
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `prisma/schema.prisma`
- **Evidence:**
  - `type String // CASH | BANK_SAVINGS | CREDIT_CARD`, and the same pattern for `Transaction.type/direction/source`, `Loan.status/kind/calculationType`, `FixedDeposit.status/payoutMode/compoundingFrequency`, `LoanScheduleEntry.status` and `HouseholdMember.role`. None are Prisma enums or CHECK constraints.
  - No `@@unique([fixedDepositId, periodEnd])` on `FixedDepositPayout`.
  - No uniqueness on `(loanId, installmentNumber)` for live schedule rows (this is what allows DF-11's duplicates).
  - No unique `LoanPayment.transactionId`.
  - `LoanPayment` and `FixedDepositPayout` lack `updatedAt`/`deletedAt`, although PRD §2.6 says every synced entity carries a tombstone.
  - `Loan.residualValueMinor Int? @default(0)` is nullable for no reason.
  - No CHECK constraints for `amountMinor > 0`, `ADJUSTMENT ⇒ direction NOT NULL`, or `toAccountId` required for TRANSFER.
- **Impact:** Typos and unknown states persist (e.g. `"Closed"`). Duplicate payouts and installments aren't prevented at the DB level. Payment and payout deletions can't sync.
- **Fix:**
  - Introduce Prisma `enum`s, or CHECK constraints via a SQL migration.
  - Add `@@unique([fixedDepositId, periodEnd])`, `@@unique([transactionId])` on `LoanPayment`, and a partial unique index `(loanId, installmentNumber) WHERE "deletedAt" IS NULL` (raw SQL in a migration).
  - Add `updatedAt`/`deletedAt` to `LoanPayment` and `FixedDepositPayout`.
  - Make `residualValueMinor` non-null with a default of 0.

### DF-27: Schema: missing FKs and dangerous cascades
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `prisma/schema.prisma`
- **Evidence:**
  - Missing relations:
    - `householdId` on Category, Account, Transaction, FixedDeposit and Loan has no relation to `Household`.
    - `Transaction.createdByUserId`/`updatedByUserId` have no relation.
    - `Account.linkedSettlementAccountId`, `CreditCardInstallmentPlan.originalTransactionId`, `Transaction.possibleDuplicateOfTransactionId`, `TransactionTemplate.accountId/toAccountId/categoryId` and `AppliedMutation.userId` are plain strings.
  - Risky cascades:
    - `Transaction.account … onDelete: Cascade`: a hard account delete wipes its ledger.
    - `Transaction.toAccount … onDelete: SetNull`: the TRANSFER keeps debiting the source while the destination credit disappears.
    - `TransactionSplitItem.category … onDelete: Cascade`: split sums no longer equal the parent.
    - `Household.owner … onDelete: Cascade`: deleting the owner user deletes the household and every member's membership.
    - `Budget.category` Cascade.
- **Impact:** Orphaned household ids after a household delete leave rows that no current household can see. Hard deletes or admin cleanup can silently break ledger invariants.
- **Fix:** Add relations with `onDelete: Restrict` for ledger-bearing references (account, category on splits) and `SetNull` where appropriate. Add `Household` relations with `Restrict`. Require ownership transfer before user deletion.

### DF-28: No Prisma migrations; global sequence created at runtime
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `prisma/` (only `schema.prisma`), `src/lib/server-seq.ts:13–20`
- **Evidence:** No `prisma/migrations` directory. `CREATE SEQUENCE IF NOT EXISTS global_server_seq` is executed from request code, and the failure is swallowed.
- **Impact:** Schema state in production isn't reproducible or reviewable. Indexes and CHECKs that need raw SQL (DF-26) can't be expressed. Runtime DDL needs elevated DB privileges, and silently falls back to a second counter (DF-18).
- **Fix:** Adopt `prisma migrate`. Create the sequence and partial indexes in an initial SQL migration. Drop the runtime DDL and fallback.

### DF-29: Sync push mutation application isn't transactional
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/app/api/sync/push/route.ts:91–1177`, specifically `:424–437`, `:506–520`, `:811–837`, `:964–990`, `:1164–1173`
- **Evidence:** Each mutation does several independent awaits: split `deleteMany` then N `create`s, placement tx then FD upsert, disbursement tx then loan upsert. `appliedMutation.upsert` runs last, outside any transaction. Two concurrent pushes of the same `mutationId` both pass the `findUnique` check (l.93).
- **Impact:** A crash midway leaves a transaction with zero split items, or a placement expense with no FD (money lost from net worth). The idempotency guarantee is only best-effort under concurrency.
- **Fix:** Wrap each mutation in `prisma.$transaction(async tx => { insert appliedMutation first (unique) … apply … })`. A unique violation on `appliedMutation` then means it was already applied.

### DF-30: SMS ingestion, merge and tx routes do multi-writes without a transaction
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/lib/sms/ingestion.ts:180–250` (cash account create, parent TRANSFER, fee child), `src/app/api/transactions/[id]/merge/route.ts:56–74`, `src/app/api/fixed-deposits/**` (see DF-06)
- **Evidence:** The `ingestion.ts` file has no `$transaction`. The parent tx and fee child are created separately. Merge updates the SMS tx and then soft-deletes the manual tx in two calls.
- **Impact:** Partial failures leave ATM withdrawals without fees (or the reverse), or merges with both rows alive (double-counted).
- **Fix:** Wrap each in `$transaction`. Give fee children deterministic ids (`uuid5(parentId+":fee")`).

### DF-31: EMI tx: principal counted as expense in stats; payment date always "now"
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/[id]/pay-emi/route.ts:89–107`
- **Evidence:** `type: "EXPENSE", subType: "EMI_PAYMENT", … transactionDate: now, excludeFromBudget: true, excludeFromStats: false`, with no `categoryId`. `paymentDate: now` is fixed, and the body offers no date.
- **Impact:** Stats/expense totals include principal repayment (a balance-sheet movement), which overstates spending. PRD §5 wants an "Interest paid" view. Users can't log a payment made yesterday, so monthly stats and the billing month are wrong. The tx also has no category, so it shows as "Uncategorized".
- **Fix:** Accept `paymentDate` (date-only, user timezone). Either exclude the EMI tx from stats and surface interest via `LoanPayment`, or post interest as a separate stats-included row with a "Loan Interest" category. Confirm the intended behaviour with the PRD owner.

### DF-32: UI forces loan/FD start date = now
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/components/account/loan-modal.tsx:76–77`, `fixed-deposit-modal.tsx:101–105`
- **Evidence:** `const now = new Date(); const startDate = now.toISOString();`. The forms have no start-date input.
- **Impact:** An existing loan taken 2 years ago gets a full fresh schedule starting next month, with wrong remaining principal and due dates. The disbursement is posted today, inflating this month's bank balance. An existing FD posts its placement today and matures a full tenure from now.
- **Fix:** Add a start-date field (default today). For pre-existing loans, add "already paid N installments" (mark the first N rows PAID without cash, as `initialPaidInstallments` does for card plans) and a "don't post disbursement/placement" toggle.

### DF-33: Cron budget rollover cost and history rewrite
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** M
- **Where:** `src/lib/jobs/cron-runner.ts:51–190`
- **Evidence:** For every budget, the cron runs `prisma.transaction.findMany({ where: { userId, deletedAt: null, excludeFromBudget: false }, include: { splitItems: true } })` (all history), then loops months from the earliest transaction. Each month calls `getNextServerSeq()` and upserts. Closed months are re-upserted every tick with the *current* `budget.monthlyLimitMinor`.
- **Impact:** O(budgets × transactions × months) per tick, which degrades quickly. Editing a limit rewrites every past month's snapshot and carry-over. Every tick bumps `serverSeq` on all snapshots, forcing clients to re-pull them.
- **Fix:** Freeze closed snapshots (create once, update only on an explicit recompute). Query per month with an aggregate (`groupBy` on category with a date range). Only touch the current month on each tick.

### DF-34: Cron secret has a public default and is logged
- **Severity:** Medium. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/v1/cron/tick/route.ts:5–11`
- **Evidence:** `const configuredSecret = process.env.CRON_SECRET || "optional-cron-secret-token"; console.log("CRON DEBUG:", { configuredSecret, authHeader, cronSecretHeader });`
- **Impact:** If `CRON_SECRET` is unset, anyone can trigger money-posting jobs. Combined with DF-14 races, that means duplicate-creation errors on demand. The secret is written to logs on every call. (This is a security-area cross-reference, included because the endpoint posts financial rows.)
- **Fix:** Fail closed when unset (500 at boot or on request). Remove the log line. Compare with `timingSafeEqual`.

### DF-35: Rounding and formatting edge semantics
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `money.ts:9–14`, `:25–41`; `loans.ts:65`
- **Evidence:**
  - `roundHalfUp(-2.5) = -3`, which is half-away-from-zero, not half-up (PRD §2.1 says half-up).
  - `formatMoney` always uses `/100` and two decimals; PRD §2.1 says to use the ISO 4217 exponent (e.g. JPY 0, KWD 3).
  - `calculateFlatRateEmi` uses `Math.floor` for the EMI rather than half-up.
  - UI code formats with `(x / 100).toFixed(2)` in many places (`loan-detail-modal.tsx:103`, `accounts/page.tsx:296`).
- **Impact:** Inconsistent negative rounding (calibrations and refunds). Incorrect display for non-2-decimal currencies, if the `currency` field is ever honoured.
- **Fix:** Document "half away from zero" or implement true half-up. Centralize formatting with `Intl.NumberFormat(locale, { style: "currency", currency })` and the currency's minor digits.

### DF-36: Tiny 0% loans produce an unpayable 0-amount final row
- **Severity:** Low. **Status:** CONFIRMED (probe). **Effort:** S
- **Where:** `loans.ts:35–37`; `pay-emi/route.ts:32`
- **Evidence:** `Math.ceil((P - R)/n)` front-loads the remainder. Probe: P = 10 minor, n = 6 gives EMIs `[2,2,2,2,2,0]`. pay-emi rejects `amountMinor <= 0`, so the final row can never be PAID and the loan never auto-closes.
- **Impact:** An edge case for very small or interest-free loans (e.g. family loans in odd amounts), but these loans stay ACTIVE forever.
- **Fix:** Use `floor` and absorb the remainder in the final row (consistent with the PRD). Skip zero-amount rows, or auto-mark them PAID.

### DF-37: Deterministic IDs aren't UUIDv5 as specified
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `cron-runner.ts:122` (`snap_…`), `:238` (`stmt_…`), `:301` (`inst_…`); `push/route.ts:813`, `:966`; `loans/route.ts:149`; `finance-core/uuid.ts` (helpers unused: `grep` finds no callers)
- **Evidence:** `` const deterministicId = `inst_${plan.id}_${cutoffDateStr}`; ``. PRD §2.7 says to use `uuid5(planId + ":" + cycleEndDate)`. The namespace is the RFC 4122 DNS namespace, not an app namespace.
- **Impact:** Ids don't match what a client would compute with `uuid.ts`, so client-side catch-up could create duplicates. These are non-UUID primary keys in a schema documented as UUID.
- **Fix:** Use the helpers in `uuid.ts` with an app-specific namespace everywhere. Migrate existing ids if needed.

### DF-38: "Investment Yield" category lookup ignores tombstones and races
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposits/[id]/close/route.ts:70–83`, `deposit-proceeds/route.ts:75–88`, `cron-runner.ts:416–431`
- **Evidence:** `findFirst({ where: { name: "Investment Yield", OR: [{ userId }, { userId: null }] } })` has no `deletedAt: null`, then a `create` if nothing is found. The category isn't seeded in `categories-data.ts` (SUSPECTED, not verified exhaustively).
- **Impact:** Income gets attached to a deleted category, which is hidden from stats. Concurrent runs create duplicate categories.
- **Fix:** Seed the system category per user at registration. Look it up with `deletedAt: null`. Add a unique `(userId, name)` partial index.

### DF-39: `(prisma as any)` in every money route
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `loans/[id]/*.ts`, `fixed-deposits/[id]/*.ts`, `cron-runner.ts:374+`, `sync/push/route.ts:815+`
- **Evidence:** `const loan = await (prisma as any).loan.findFirst(...)` and `tx: any`.
- **Impact:** `tsc` can't catch wrong field names, wrong types (e.g. a float into an Int) or missing required fields in the most sensitive code.
- **Fix:** Remove the casts (the generated client includes these models) and fix the resulting type errors.

### DF-40: Premature-closure penalty invisible; WHT not applied
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposits/[id]/close/route.ts:43–44`
- **Evidence:** `principalToReturn = Math.min(principal, actual); interestToReturn = Math.max(0, actual - principal)`. A shortfall (penalty) isn't recorded, and no `FixedDepositPayout`/WHT breakdown is stored for the closure interest.
- **Impact:** A broken FD with a penalty shows as a net-worth drop with no explanatory row, and the drop is excluded from stats. The interest-earned report is missing closure interest gross/tax.
- **Fix:** When `actual < principal`, post the shortfall as a stats-included "FD penalty" expense, or post the full principal plus a penalty row. Record a payout row with gross, WHT and net (let the user enter gross and tax, or derive them from `withholdingTaxRateBps`).

### DF-41: Loan read-model inaccuracies
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/app/api/loans/route.ts:43–60`
- **Evidence:** `totalInstallmentsCount: loan.tenureMonths` ignores SHORTER_TENURE regeneration. `paidInstallmentsCount` counts PAID rows, including duplicates from DF-11.
- **Impact:** Progress bars and "X of Y paid" are wrong after an extra-principal payment.
- **Fix:** Derive the counts from live schedule rows (`deletedAt: null`).

### DF-42: Missing indexes for hot financial queries
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `prisma/schema.prisma`
- **Evidence:**
  - `Transaction` has no index on `toAccountId` (cron l.208 uses `OR [{accountId},{toAccountId}]`) and none on `householdId`.
  - There's no composite index for duplicate detection (`userId, accountId, amountMinor, source, transactionDate`, used in push l.345 and ingestion l.70–80).
  - `HouseholdMember` has only `@@unique([householdId, userId])`, while every push and pull queries by `userId` alone.
  - `LoanScheduleEntry` has no `(loanId, deletedAt, installmentNumber)` index.
- **Impact:** Sequential scans grow with ledger size on every sync and cron tick.
- **Fix:** Add `@@index([toAccountId])`, `@@index([householdId])`, `@@index([userId, accountId, transactionDate])`, `@@index([userId])` on HouseholdMember, and `@@index([loanId, installmentNumber])`.

### DF-43: FD routes ignore `deletedAt` and household roles
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `fixed-deposits/[id]/close/route.ts:18–20`, `deposit-proceeds/route.ts:19–21`
- **Evidence:** `findUnique({ where: { id, userId: user.id } })`, with no `deletedAt: null` and no household path.
- **Impact:** A soft-deleted FD can still be closed and post proceeds. A household CO_OWNER can't close a shared FD, although they can edit it via sync.
- **Fix:** Use `findFirst({ where: { id, deletedAt: null, OR: [{ userId }, { householdId: { in: ownerOrCoOwnerHouseholds } }] } })`.

### DF-44: Cron push reminders re-enqueued every tick
- **Severity:** Low. **Status:** CONFIRMED. **Effort:** S
- **Where:** `src/lib/jobs/cron-runner.ts:540–548`
- **Evidence:** `if (userTime >= configuredTime) { enqueuePushNotification(...) }` has no "already sent today" marker.
- **Impact:** With a per-minute cron, users get a reminder every tick from 20:00 to midnight. (Cross-reference for the push/PWA area.)
- **Fix:** Persist `lastReminderSentOn` (date in the user's timezone) and send only when it differs from today.

---

## Part 3: Recommended remediation order

1. **Stop money corruption now:** DF-02, DF-05, DF-03, DF-04, DF-15, DF-17. All are small changes.
2. **Make money commands atomic and idempotent:** DF-06, DF-07, DF-11, DF-12, DF-14, DF-29, DF-30. Introduce one `LoanService`/`FixedDepositService` used by REST, sync and cron, with `$transaction`, conditional state transitions and deterministic ids.
3. **Schema hardening:** DF-01 (BigInt), DF-26, DF-27, DF-28, DF-42, delivered as the first real migration set.
4. **Loan/FD domain correctness:** DF-08, DF-09, DF-10, DF-13, DF-16, DF-22, DF-23, DF-24, DF-32.
5. **Precision, time and validation:** DF-19, DF-20, DF-21, DF-25, then the remaining Lows.

## Test coverage notes
- `tests/unit/finance-core.test.ts` has golden vectors for the happy-path EMI, flat, lease, FD compound and monthly payout cases. Nothing covers half-boundary rounding, month-end dates, residual payoff, partial/over-payment, OVERRIDDEN plus extra principal, or concurrency.
- E2E specs `s17-fixed-deposits.spec.ts` and `s18-loans-leases.spec.ts` exist but weren't run (no `node_modules`, no DB). Whether they assert the account balance after premature closure (DF-02) wasn't verified.
- Suggested regression tests:
  - Premature close credits the account exactly once.
  - Two concurrent `pay-emi` calls produce one payment.
  - Jan-31 schedule due dates are clamped.
  - Lease keeps the residual liability after the last EMI.
  - Extra principal with an OVERRIDDEN row yields no duplicate installment numbers.
  - An interrupted cron payout recovers on the next tick.
  - A sync CREATE with another user's id is rejected.

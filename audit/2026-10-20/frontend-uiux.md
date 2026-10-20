# Hard Money — Frontend UI/UX, Accessibility & PWA Audit

Date: 2026-10-20 · Scope: `src/app/**` pages, `src/components/**`, `public/sw.js`, `public/manifest.json`, `src/middleware.ts` (auth redirect surface), `src/app/globals.css`.
Mode: read-only. No code changes, no installs, no DB access.

Spec references: `PRD.md` (esp. §1 PWA/Auth, §2.6 sync, §5.0 design, §6 NFRs) and `PLAN.md` (Steps 7, 20, 21).

---

## 0. Commands run & verification limits

| Command | Result |
|---|---|
| `pnpm lint` | **Could not run.** `node_modules/` is absent and Corepack prompted interactively to download `pnpm@12.6.0`. The process was killed; installing dependencies would mutate the workspace, which this audit is not allowed to do. |
| `pnpm exec tsc --noEmit` | **Could not run**, same reason. |
| `ls node_modules/next/dist/docs` | Not present (no `node_modules`). The Next.js 16 `middleware` → `proxy` rename was checked against the official docs instead: [Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy), [Proxy file convention](https://nextjs.org/docs/pages/api-reference/file-conventions/proxy). |
| `grep` a11y attributes across `src/` | `role="dialog"`, `aria-modal`, `aria-live`, `role="status"`, `aria-invalid`, `aria-describedby`, `aria-expanded`, `aria-pressed`, `aria-selected`, `role="switch"`: **0 occurrences**. `aria-label`: 9 occurrences in total. `Escape` key handling: **0**. `confirm(`: **1** (loan close). |
| WCAG contrast calc (node script, sRGB relative luminance) | Results are cited in A11Y findings. |
| `sips` on icons | 192/512/180/64 px. The 512 icon is 290 KB. |

Because lint and tsc could not run, nothing in this report depends on their output. Every CONFIRMED finding comes from reading the code. SUSPECTED means the code path is clear but the runtime or visual effect was not observed in a browser.

---

## 1. How the frontend currently works

### 1.1 Shell & providers (`src/app/layout.tsx`)
- `RootLayout` server component: inline theme bootstrap `<script>` → `ThemeProvider` → `<Suspense>` → `SyncProvider` → `QuickAddProvider` → flex shell containing `Sidebar` (desktop, `.desktop-only`), the scrollable main area with `{children}`, `Fab`, `BottomNav` (mobile, `.mobile-only`), the global `QuickAddModal`, and `PwaManager`.
- `body` is `h-screen w-screen overflow-hidden`. Only the inner `div.flex-1.overflow-y-auto` scrolls.
- Nav items (identical in sidebar and bottom nav): Trans. `/`, Stats `/stats`, Budget `/budget`, Accounts `/accounts`, More `/more`. Sidebar, bottom nav and FAB hide themselves on `/login` and `/register`.

### 1.2 Data flow
- Every feature page is a `"use client"` component. Data comes from Dexie (`src/lib/db/index.ts`, DB name `hardmoney_<userId>`) through `useLiveQuery` hooks in `sync-provider.tsx` (`useAccounts`, `useTransactions`, …). Each hook returns `[]` while the query is loading.
- Writes go through `local*` helpers in `src/lib/sync/client.ts`. Each helper writes Dexie and appends an outbox mutation. `SyncProvider` pushes/pulls on user change, on `online`, whenever pending mutations exist, and on a 1 s interval while anything is pending.
- Some features skip the outbox and call REST endpoints directly: FD close/deposit-proceeds, loan pay-EMI / close / schedule override, household management, SMS inbox, SMS activity, settings, Gemini, webhook key, push.
- `userId` is seeded from `localStorage.hardmoney_active_user` and refreshed from `/api/auth/session` on every pathname change.

### 1.3 Routes in scope
| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Transactions: month switcher, summary bar, search/filter, tabs Daily / Calendar / Monthly / Summary, edit sheet, undo toast |
| `/stats` | `src/app/stats/page.tsx` | Expense/Income donut + ranked list, 6-month trend |
| `/budget` | `src/app/budget/page.tsx` | Category budgets, rollover, safe-to-spend, add/edit modal |
| `/accounts` | `src/app/accounts/page.tsx` | Net worth, Cash/Bank/CC groups, installment plans, FDs, loans; account form; 7 modals |
| `/accounts/[id]` | `src/app/accounts/[id]/page.tsx` | Account detail, CC cycle stats, tx history, statements, plans, calibrate/settle |
| `/more` | `src/app/more/page.tsx` | Profile/logout, user settings, Gemini, webhook key, reminders, theme, menu |
| `/more/household` | `src/app/more/household/page.tsx` | Create household, members, roles, transfer, remove, leave |
| `/more/inbox` | `src/app/more/inbox/page.tsx` | SMS review: post / ignore / retry |
| `/more/sms-activity` | `src/app/more/sms-activity/page.tsx` | SMS audit log with status filter |
| `/more/bookmarks` | `src/app/more/bookmarks/page.tsx` | Quick-add templates CRUD |
| `/more/categories` | `src/app/more/categories/page.tsx` | Category create/delete |
| `/more/shortcuts` | `src/app/more/shortcuts/page.tsx` | iOS Shortcuts guide + download |
| `/login`, `/register` | `src/app/login/page.tsx`, `src/app/register/*` | Credentials auth |
| `/offline` | `src/app/offline/page.tsx` | SW offline fallback |

### 1.4 Modals / sheets (all hand-rolled `fixed inset-0` divs)
`QuickAddModal`, `TransactionEditModal`, `CalibrationModal`, `SettleModal`, `InstallmentPlanModal`, `EarlyPayoffModal`, `FixedDepositModal`, `FdCloseModal`, `LoanModal`, `LoanDetailModal` (+ nested Log-EMI dialog), plus inline modals: account form (accounts page), budget modal, SMS raw modal (daily view), and the household mobile role sheet. None have dialog semantics, focus management or Escape-to-close (A11Y-01).

### 1.5 PWA
- `public/sw.js` (hand-written, not Serwist as PLAN Step 20 specifies). It precaches `/offline` + icons. Navigations are network-first and every 200 HTML response gets cached. Other GETs (excluding `/api/`, `/_next/`) are cache-first with background refresh and `ignoreSearch`. It also handles push and notificationclick.
- `PwaManager` registers the SW in production only, primes a Cache Storage entry with `/_next/` assets, captures `beforeinstallprompt` into a window global, and shows an update banner.
- `public/manifest.json`: standalone, portrait-primary, dark theme color, 192/512 icons (the 512 is reused as maskable).

### 1.6 Formatting
- `formatMoney()` (`src/lib/finance-core/money.ts:24`) always renders `LKR` + `en-LK` grouping + 2 decimals. `SummaryBar` has its own formatter. The calendar uses `en-US` with 0 decimals. Budget prints a hard-coded `Rs.`. Dates use a mix of `toLocaleDateString()` (implicit locale), `en-US`, and raw ISO strings.

---

## 2. Severity summary

| Severity | Count | Highlights |
|---|---|---|
| Critical | 5 | FD premature-close double-posts proceeds; push subscription is a hard-coded fake; all date views pinned to Oct 2026; no confirmation/undo on hard-deleting an account; offline cold start relies on HTTP cache because the SW never serves `/_next/` |
| High | 17 | Double-submit on money-moving forms, no confirmation on household/destructive actions, silent failures on server-only flows, invisible Budget buttons, split-amount input unusable, open redirect, 401 shown as "Synced", contributor balance leak, logout ignores pending outbox, no modal a11y, mouse-only rows, safe-area overlap |
| Medium | 51 | Loading flashes as empty/not-found, inconsistent totals across views, currency/locale inconsistency, contrast failures, SW RSC caching, update-flow defects, PRD gaps |
| Low | 33 | Copy, dead code, minor visual/tokens, manifest polish |
| **Total** | **106** | |

Effort key: **S** < ½ day · **M** ½–2 days · **L** > 2 days.

---

## 3. Findings

### 3.1 Money-moving flows & data integrity (UI-initiated)

**FIN-01 · Critical · CONFIRMED · Effort S — FD premature close posts proceeds twice**
- File: `src/components/account/fd-close-modal.tsx:52-62`, `:69-104`; server `src/app/api/fixed-deposits/[id]/close/route.ts` (creates principal + interest transactions).
- Evidence: the modal calls `fetch('/api/fixed-deposits/${fd.id}/close' …).catch(() => {})`. The server route itself `prisma.transaction.create(...)`s the `FD_MATURITY` principal and `FD_INTEREST` rows. Then the client *also* calls `localCreateTransaction(db, { subType: "FD_MATURITY", … })` and, if there is interest, a second `localCreateTransaction`, using fresh client UUIDs.
- Impact: online, every premature close credits the target account twice (server rows plus client rows synced via the outbox). Balances and net worth inflate by the principal amount. Server errors are swallowed, so the user can't tell.
- Fix: pick one source of truth. Either (a) offline-first: only write locally via the outbox and drop the server-side transaction creation, or (b) server-first: await the response, check `res.ok`, show the error, and pull instead of creating local rows. Add server-side idempotency (deterministic UUIDv5 per FD close).

**FIN-02 · High · CONFIRMED · Effort S — "Deposit proceeds" ignores failures; offline closes the FD without posting money**
- File: `src/app/accounts/page.tsx:253-276`.
- Evidence: `try { await fetch('/api/fixed-deposits/${fd.id}/deposit-proceeds', …) } catch { // offline fallback }` followed unconditionally by `localUpdateFixedDeposit(db, fd.id, { status: "CLOSED", … })`. `res.ok` is never checked. If no linked/funding/bank account exists, `targetAccountId` can be `undefined`.
- Impact: offline or on a 4xx/5xx, the FD is marked CLOSED locally and that closure syncs, but no proceeds transaction ever exists. The principal disappears from net worth. There's no confirmation, no submitting state, and a double tap fires two requests.
- Fix: disable the button while the request is in flight, require `res.ok` before the local update, show errors inline, block the action offline (or queue it properly in the outbox), and add a confirmation that shows the target account and amount.

**FIN-03 · High · CONFIRMED · Effort S — Quick-Add Save/Continue has no in-flight guard (duplicate transactions)**
- File: `src/components/transaction/quick-add-modal.tsx:158-226`, buttons around `:566-585`.
- Evidence: `validateAndSubmit` awaits `localCreateTransaction` with no `submitting` state. Buttons are only `disabled={isDivisionByZero}`. "Continue" keeps the sheet open with the same account and category selected.
- Impact: a double tap (common on mobile) or Enter + click creates duplicate expenses and income.
- Fix: add `const [submitting, setSubmitting]`, return early if set, disable both buttons and show a spinner. Apply the same pattern to every money-moving form (FIN-04).

**FIN-04 · High · CONFIRMED · Effort M — Other money-moving actions lack double-submit protection**
- Files / evidence:
  - Account create/edit: `src/app/accounts/page.tsx:315-394`, submit button `:1157` has no `disabled`.
  - Installment plan: `src/components/account/installment-plan-modal.tsx:55-136`, submit `:282`. No state at all, and it can post the processing-fee transaction twice.
  - Calibration: `src/components/transaction/calibration-modal.tsx:145-198`. Save only disabled on `isNothingToAdjust`; a double tap posts two adjustments, doubling the correction.
  - Convert to installment: `src/components/transaction/transaction-edit-modal.tsx:86-131`. No guard, so it can create two plans for one swipe.
  - Transaction edit save/delete: `:175-215`.
  - Budget save: `src/app/budget/page.tsx:222-245`.
  - Settle (`settle-modal.tsx:51`) disables via `isSubmitting` but only after validation, which is acceptable. FD create/Loan create/EMI do disable.
- Impact: duplicate ledger rows, double adjustments, duplicate plans.
- Fix: a shared `useSubmitting()` hook or form wrapper. Disable while pending and make each operation idempotent (e.g. pre-generate the UUID when the form opens so a retry is an upsert).

**FIN-05 · Critical · CONFIRMED · Effort S — Deleting an account is one tap, hard-deletes locally, no confirmation, no undo**
- File: `src/app/accounts/page.tsx:311-313` (`handleDelete` → `localDeleteAccount`), buttons `:1350`, `:1506`; `src/lib/sync/client.ts:339-353` (`await db.accounts.delete(id)`, a hard delete rather than a soft delete).
- Impact: a misplaced tap on a 25 px trash icon removes the account and syncs a DELETE. Its transactions become orphans and render as `"Account"` in Daily view (`daily-view.tsx` `accountMap.get(...) || "Account"`). Balances and net worth change. The PRD (§2.5 "Deletes are soft deletes") is violated on the client.
- Fix: confirmation dialog stating the transaction count; block deletion (offer Archive) when transactions exist; soft-delete with an undo snackbar consistent with the transaction-delete UX.

**FIN-06 · High · CONFIRMED · Effort S — Loan "Log EMI", "Early Payoff" and schedule override fail silently**
- File: `src/components/account/loan-detail-modal.tsx:113-139` (pay EMI), `:142-161` (close), `:163-189` (override).
- Evidence: `if (res.ok) { … }` with no else branch. `catch (err) { console.error(...) }` / `catch { // ignore }`.
- Impact: offline or on a server rejection, the dialog just stops spinning. The user may retry and double-pay once the network returns, or believe a payment was recorded when it wasn't. These are online-only actions in an app that bills itself as offline-first, and nothing tells the user that.
- Fix: surface `data.error` inline (`role="alert"`). Disable the actions with an explanation when `!navigator.onLine`, or route them through the outbox. Validate override inputs (non-negative, principal + interest = EMI or show the delta).

**FIN-07 · Medium · CONFIRMED · Effort S — Loan "Early Payoff" is a schedule-clearing close, not a payoff**
- File: `src/components/account/loan-detail-modal.tsx:142-161`, server `src/app/api/loans/[id]/close/route.ts` (sets CLOSED, deletes SCHEDULED entries, posts no payment).
- Impact: the label promises a payoff, but no payment transaction or payment-account debit is recorded. Remaining principal silently disappears from liabilities while the cash never leaves an account, so net worth jumps.
- Fix: rename to "Close loan" or implement a real payoff (amount + source account + final payment row). Replace native `confirm()` with the app's confirmation dialog showing the remaining principal.

**FIN-08 · Medium · CONFIRMED · Effort S — EMI payment account picker shows opening balance as if it were the balance**
- File: `src/components/account/loan-detail-modal.tsx:585` — `{a.name} ({formatMoney(a.openingBalanceMinor)})`.
- Impact: misleading figure when choosing the source of a payment.
- Fix: show the ledger-derived balance (as computed on the Accounts page) or nothing.

**FIN-09 · Medium · CONFIRMED · Effort S — Early installment payoff has no fee field and swallows errors**
- File: `src/components/account/early-payoff-modal.tsx:28-63`.
- Evidence: posts `remainingPrincipalMinor` only; `catch (err) { console.error(...) }`.
- Impact: PRD §Subsystem 2 item 4 requires an optional early-settlement fee and an editable payoff amount. Failures are invisible.
- Fix: add an editable amount + optional fee (posted as a `FEE` row) and inline error display.

**FIN-10 · High · CONFIRMED · Effort S — "Cancel Plan" is destructive and one-tap**
- File: `src/app/accounts/page.tsx:627-640`, duplicated at `src/app/accounts/[id]/page.tsx:530-543`.
- Impact: it immediately restores the original swipe to the card balance and deletes the plan. There is no confirmation and no undo. The button sits next to "Early Payoff".
- Fix: confirmation describing the balance effect. Extract the duplicated block into one component.

**FIN-11 · Medium · CONFIRMED · Effort S — Duplicate "Merge" is unconfirmed and errors are unhandled**
- File: `src/components/transaction/daily-view.tsx:293-305` and dismiss `:309-321`.
- Evidence: `await fetch('/api/transactions/${tx.id}/merge', …)` inside `try/finally` with no `catch` and no `res.ok` check.
- Impact: merging soft-deletes the manual row with no confirmation (PRD: "never merged silently"; a confirmation at the click point is advisable). Offline it throws an unhandled rejection and nothing is shown.
- Fix: confirm, check `res.ok`, show feedback, disable offline.

**FIN-12 · Medium · CONFIRMED · Effort S — Accounts "Shared Household" scope can be chosen with no household**
- File: `src/app/accounts/page.tsx:354-358` (`chosenHouseholdId = accessScope === "SHARED_HOUSEHOLD" ? (editingAccount?.householdId || activeHouseholdId) : null`), toggle `:1003-1026`.
- Impact: if `/api/households` failed or the user has none, the account saves as `SHARED_HOUSEHOLD` with `householdId: null`, an inconsistent state the server may reject (and the failure is only visible as the sync error count). It also always uses `households[0]`.
- Fix: disable the Shared option (with explanation and a link to the Household page) when there is no household; add a household picker if multiple are supported.

**FIN-13 · Medium · CONFIRMED · Effort S — Placeholder user IDs written into records**
- Files: `src/app/accounts/page.tsx:376` `userId: "current-user"`; `src/app/more/categories/page.tsx:43` `userId: "current-user"`; quick-add/bookmarks/calibration `userId || "default"`; budget `userId || "usr_anonymous"`; early payoff/installment `|| "current-user"`.
- Impact: if the session fetch hasn't resolved (e.g. offline cold start before `localStorage` is set), records are created with fake owners. Whether the server overwrites them is not verified (SUSPECTED for server behavior).
- Fix: block creation until `userId` is known, or let the server always derive ownership from the session and drop these client fields.

**FIN-14 · Medium · CONFIRMED · Effort M — Loan/FD start date is always "now"**
- Files: `src/components/account/loan-modal.tsx:76-77`, `src/components/account/fixed-deposit-modal.tsx:100-105`.
- Impact: users can't onboard an existing loan or FD that started months ago, so schedules, accrual and maturity are wrong. `maturity.setMonth(getMonth()+n)` also overflows on the 29th-31st (Jan 31 + 1 month → Mar 3).
- Fix: add a start-date field (default today) and use a date-fns `addMonths` equivalent.

**FIN-15 · Low · CONFIRMED · Effort S — Pre-filled sample money values in create forms**
- Files: `loan-modal.tsx:21-24` (`"1200000.00"`, APR `"12.0"`), `fixed-deposit-modal.tsx:20-22` (`"1000000.00"`).
- Impact: users can save the sample figures by accident.
- Fix: empty inputs with placeholders.

**FIN-16 · Medium · CONFIRMED · Effort S — Money parsing accepts junk and negatives silently**
- File: `src/lib/finance-core/money.ts:44-51` — `input.replace(/[^0-9.-]/g, "")` then `parseFloat`.
- Impact: `"1.2.3"` → 1.20, `"12-5"` → 12, `"abc"` → 0 (reported as "must be greater than zero"), `"-500"` is accepted for an opening balance, split items and loan overrides. Text inputs lack `inputMode="decimal"`, so mobile shows a full keyboard (accounts, settle custom, FD close, loan, inbox, bookmarks, edit modal).
- Fix: strict regex validation (`^\d+(\.\d{0,2})?$`, allowing a sign only where meaningful), inline error per field, `inputMode="decimal"` on every amount input.

### 3.2 Date / period correctness

**DATE-01 · Critical · CONFIRMED · Effort S — Every month-based screen is pinned to October 2026**
- Files: `src/app/page.tsx:23`, `src/app/budget/page.tsx:36`, `src/app/stats/page.tsx:18` (comment "Oct 2026 default"), `src/components/ui/month-switcher.tsx:12`.
- Evidence: `useState(() => new Date(2026, 9, 1))`.
- Impact: from 1 Nov 2026 the Transactions, Stats and Budget screens open on the wrong month. New entries appear "missing" and budgets show the wrong period. This looks like a test-fixture leak.
- Fix: default to the current month in the user's timezone (`Asia/Colombo` default; the helper already exists in quick-add as `getTodayDateString`). Inject the clock in E2E via the existing test API instead of hard-coding it.

**DATE-02 · Medium · CONFIRMED · Effort S — Calendar's selected day does not follow month changes**
- File: `src/components/transaction/calendar-view.tsx:60-68`.
- Evidence: `selectedDate` is initialized once with `useState(() => …)`. The component isn't keyed by month.
- Impact: after switching months, the detail panel stays on a date outside the grid and shows "No transactions recorded on this date."
- Fix: `key={monthPrefix}` on `<CalendarView>` in `page.tsx`, or reset in an effect.

**DATE-03 · Medium · CONFIRMED · Effort S — Inconsistent / timezone-unsafe date rendering**
- Files: `src/app/accounts/page.tsx:792` `new Date(fd.maturityDate).toLocaleDateString()`; `loan-detail-modal.tsx:285,359,459`; `daily-view.tsx` SMS modal `toLocaleString()`; inbox `toLocaleTimeString()` (no date, `inbox/page.tsx` master list); account detail and stats show raw ISO `tx.transactionDate`; CC statements `.slice(0,10)`.
- Impact: formats vary by device locale; date-only ISO strings parsed as UTC can show the previous day west of UTC; the inbox list shows only a time, so older items are ambiguous.
- Fix: one `formatDate(date, { tz: user.timezone })` helper using `Intl.DateTimeFormat` with explicit locale and timezone, used everywhere.

**DATE-04 · Low · CONFIRMED · Effort S — Budget safe-to-spend for past/future months is meaningless**
- File: `src/app/budget/page.tsx:105-112`.
- Impact: for non-current months it divides by the full month length, showing a "per day" figure for a period that is over or hasn't started.
- Fix: hide safe-to-spend outside the current month or label it.

### 3.3 Destructive actions without confirmation

**DEST-01 · High · CONFIRMED · Effort M — Household: remove member, transfer ownership, leave, role change are all one-tap**
- File: `src/app/more/household/page.tsx:159-177` (remove), `:207-227` (transfer), `:179-205` (leave), `:393` (role `<select onChange>` fires a PATCH immediately), mobile sheet `:575-581`.
- Impact: transferring ownership is irreversible for the caller (they lose owner rights). Removing a member revokes access and purges their cached data. A sole owner can "leave" (`members.length > 1` guard only), possibly orphaning the household (server behavior not verified, SUSPECTED). Role changes take effect on an accidental select change.
- Fix: a confirmation dialog for each action naming the member and the consequence. Type-to-confirm for transfer and leave. Explicit Save for role changes.

**DEST-02 · High · CONFIRMED · Effort S — Logout has no confirmation and ignores the pending outbox (PRD §1 Auth)**
- File: `src/app/more/page.tsx:229-239`.
- Evidence: posts logout, removes `hardmoney_active_user`, `router.push("/login")`. There's no outbox check. PRD: "logging out with a non-empty outbox requires explicit confirmation."
- Impact: unsynced changes get stranded in the user's IndexedDB until the next login on that device, and the user isn't told. On a shared device, the financial IndexedDB (`hardmoney_<id>`) and SW HTML cache are left behind (PRV-02). Offline, the logout POST fails and the cookie stays, so middleware bounces `/login` back to `/` (confusing).
- Fix: check `pendingMutations.length` and confirm with the count. Offer "Sync now". Optionally offer "Remove local data from this device". Handle an offline logout explicitly.

**DEST-03 · High · CONFIRMED · Effort S — Regenerate webhook key without confirmation**
- File: `src/app/more/page.tsx:241-254`, button `regenerate-webhook-key-btn`.
- Impact: it instantly invalidates the key used by the user's iOS Shortcut, and SMS ingestion silently stops. Errors are ignored (`catch { // ignore }`).
- Fix: confirmation explaining that the Shortcut must be updated; error feedback.

**DEST-04 · Medium · CONFIRMED · Effort S — Delete budget / bookmark / category / SMS ignore are one-tap**
- Files: `src/app/budget/page.tsx:247-255`; `src/app/more/bookmarks/page.tsx:100-106` (errors → `console.error`); `src/app/more/categories/page.tsx:56-58` (no handling; categories in use leave transactions showing "Uncategorized"); `src/app/more/inbox/page.tsx:189-209` (Ignore; a non-ok response is silent).
- Fix: confirmation or an undo snackbar (preferred for low-stakes items). Block or warn when a category is referenced by transactions or budgets.

**DEST-05 · Medium · CONFIRMED · Effort S — FD "Premature Close" has no review step and closes with a typo-able amount**
- File: `src/components/account/fd-close-modal.tsx`. The form is the confirmation, but the proceeds default to the principal and there's no summary of the penalty vs. principal before commit.
- Fix: show the computed principal/interest split and the shortfall ("penalty LKR X") before the confirm button. Combine with the FIN-01 fix.

### 3.4 Loading, empty and error states

**STATE-01 · Medium · CONFIRMED · Effort M — Dexie loading looks like "empty" or "not found"**
- File: `src/components/sync-provider.tsx:157-215` (`useLiveQuery(...) || []` for every hook).
- Impact: on every cold load: `/accounts` flashes "No accounts created" (`accounts/page.tsx:457`); `/accounts/[id]` flashes "Account not found." (`accounts/[id]/page.tsx:170`); `/` flashes "No transactions yet"; Budget flashes the empty state with an "Add Budget" CTA; Stats flashes "No statistics available". On slower devices this is visible and alarming for a finance app.
- Fix: return `undefined` while loading (or `{data, isLoading}`) and render skeletons. Only show empty or not-found once the query has resolved.

**STATE-02 · Medium · CONFIRMED · Effort S — Empty state ignores active filters/search**
- File: `src/app/page.tsx:283-290`.
- Evidence: shows "No transactions yet — Tap the + button to record your first…" whenever `filteredTransactions.length === 0`.
- Impact: users with filters on are told they have no transactions.
- Fix: distinguish "no transactions this month" from "no matches for current filters" and add a "Clear filters" action.

**STATE-03 · High · CONFIRMED · Effort M — Server-backed pages swallow fetch errors**
- Files:
  - `src/app/more/page.tsx:83-131,138-170` (settings, webhook, Gemini, inbox count, push: `catch { // ignore }`; non-ok saves leave no message, `:262-299`, `:301-338`).
  - `src/app/more/household/page.tsx:63-74` (initial load `.catch(() => {})`, so a failure renders the "Create a Household" form as if none exists).
  - `src/app/more/inbox/page.tsx:69-100,102-121` (inbox/accounts/categories failures → empty lists: "Inbox is clear" even when the API failed).
  - `src/app/more/sms-activity/page.tsx:34-50` (→ "No bank SMS activity found").
  - `src/app/accounts/page.tsx:63-78` (households → roles silently unknown; contributor masking fails open, see SEC-03).
  - `src/components/account/fixed-deposit-modal.tsx:129-131` (create failure → console only).
- Impact: users can't tell "nothing here" from "something broke". The household page may invite a member of an existing household to create a second one.
- Fix: a standard `{loading, error, data}` pattern with an inline error card + Retry. Distinguish offline ("You're offline — this section needs a connection") from server errors.

**STATE-04 · High · CONFIRMED · Effort S — Session expiry shows as "Synced"**
- File: `src/lib/sync/client.ts:39-42` and `:68-71` — `if (res.status === 401) { onStateChange("idle"); return; }`; `SyncIndicator` renders idle as a green check "Synced" (`sync-provider.tsx:233-238`).
- Impact: with an expired session, nothing syncs but the UI says Synced. Pending changes pile up unseen. PRD §1 says expiry should "pause sync", and that state should be visible.
- Fix: add a `"auth"`/`"paused"` sync state with a "Sign in to sync (N pending)" badge linking to `/login?callbackUrl=…`.

**STATE-05 · Medium · CONFIRMED · Effort M — Rejected mutations have no resolution UI (PRD §2.6)**
- File: `src/components/sync-provider.tsx:262-270` shows `Error (n)`; clicking only retries `sync()`. `failedMutations` with `errorReason` are never listed.
- Impact: "Rejected mutations stay visible in the UI for resolution" isn't met. Users can't discard or fix a rejected change (e.g. a viewer's write) and the error badge stays forever.
- Fix: a sync-issues sheet listing failed mutations (entity, reason, time) with Retry / Discard.

**STATE-06 · Medium · CONFIRMED · Effort S — Server 5xx on push shows as "Offline"**
- File: `src/lib/sync/client.ts:58-62`. Any push exception (including `Push HTTP error: 500`) → `onStateChange("offline")`.
- Impact: misleading status. Users debug their Wi-Fi instead of reporting a server error.
- Fix: map network failures to `offline` and HTTP errors to `error`.

**STATE-07 · Low · CONFIRMED · Effort S — Household error/success banners are not announced and parse non-JSON errors**
- File: `src/app/more/household/page.tsx:247-258` (no `role="alert"` / `aria-live`), `:94,122,…` (`await res.json()` in error branches throws on HTML error pages, showing "Unexpected token <").
- Fix: `role="alert"`, `res.json().catch(() => ({}))`.

**STATE-08 · Low · CONFIRMED · Effort S — Inbox has no loading UI on first load**
- File: `src/app/more/inbox/page.tsx:293` renders the empty state only when `!loading`; while loading the page body is blank (just a spinner on the Refresh button).
- Fix: skeleton list.

### 3.5 Forms & validation feedback

**FORM-01 · High · CONFIRMED · Effort S — Split amount input is effectively untypeable**
- File: `src/components/transaction/transaction-edit-modal.tsx:403-410` — `value={(item.amountMinor / 100).toFixed(2)}` with `onChange` → `parseMoneyToMinor(e.target.value)`.
- Impact: every keystroke is re-parsed and re-formatted. Typing "5" into "0.00" yields "0.005" → rounds → "0.01". Deleting characters fights the formatter and the caret jumps to the end. Splitting a transaction, a core PRD feature, is very hard to do by hand.
- Fix: keep a string state per split row, parse on blur or save, and validate per row.

**FORM-02 · Medium · CONFIRMED · Effort S — Labels not associated with inputs across most forms**
- Files: `accounts/page.tsx` (e.g. `:968` `<label className=…>Account Name</label>` with no `htmlFor`, input with no `id`); the same in quick-add (`:330-360`), transaction-edit, settle, FD, FD-close (`:158`,`:175`), loan, installment, inbox, bookmarks, categories, budget, filter bar. Only login/register/more-settings/household/auto-renew/extra-principal use `htmlFor`.
- Impact: screen readers announce unlabeled edit fields, and clicking a label doesn't focus its input. This fails WCAG 1.3.1 / 4.1.2.
- Fix: `useId()` + `htmlFor`/`id` in a shared `<Field label error>` component.

**FORM-03 · Medium · CONFIRMED · Effort S — Inline errors are not tied to fields**
- Files: all `errors.*` `<p>` elements (e.g. `accounts/page.tsx` `error-account-name`, loan/FD modals). No `aria-invalid` and no `aria-describedby`. Quick-add/edit error lines have no `role="alert"`. Focus doesn't move to the first invalid field.
- Fix: in the shared `Field` component, set `aria-invalid`, `aria-describedby={errorId}`, and focus the first error on submit.

**FORM-04 · Medium · CONFIRMED · Effort S — Quick-Add silently defaults the category to the first one, and categories are not type-filtered**
- File: `src/components/transaction/quick-add-modal.tsx:102-107` (`return categories[0]?.id`), category grid `:470-500`.
- Impact: a user who forgets to pick a category saves the expense under whatever category happens to be first. Income and expense categories are mixed in the same grid, and budget/edit/inbox pickers have the same problem (`budget/page.tsx:58-66` says "Select Expense Category" but lists everything).
- Fix: require an explicit choice (or remember the last-used one per type) and filter categories by kind if the model supports it.

**FORM-05 · Medium · CONFIRMED · Effort S — Calibration keypad starts pre-filled and has no Clear key**
- File: `src/components/transaction/calibration-modal.tsx:73-78` (`initialValueStr = (currentBalanceMinor/100).toFixed(2)`), keypad `:283-395`; `calculator.ts` supports `CLEAR` but no button exposes it.
- Impact: typing appends to "125000.00" → "125000.005…". The user must backspace 9 times. No decimal-place cap (applies to Quick-Add too: `1.999` silently becomes 2.00).
- Fix: select-all/replace on first keypress (calculator "fresh entry" mode), add a C key, and cap at 2 decimals in `handleKeypadPress`.

**FORM-06 · Medium · CONFIRMED · Effort S — Desktop keyboard entry in Quick-Add requires clicking a read-only field**
- File: `src/components/transaction/quick-add-modal.tsx:396-405` (`readOnly`, `inputMode="none"`, keyboard handler only on that input, no autofocus).
- Impact: desktop users can't just type an amount when the sheet opens. Keyboard-only users get no visible focus indicator (`focus:outline-none`).
- Fix: autofocus the amount input on desktop, add a visible focus ring, and attach the key handler to the dialog.

**FORM-07 · Low · CONFIRMED · Effort S — Quick-Add context keeps stale initial type/account**
- File: `src/components/transaction/quick-add-context.tsx:27-31` (`if (options?.type) setInitialType(...)`; never reset on close).
- Impact: after one "Add income" deep-open, every later FAB tap opens as Income with the same preselected account.
- Fix: reset to defaults in `closeQuickAdd` or when options are absent.

**FORM-08 · Low · CONFIRMED · Effort S — Weak password policy and confusing auth form markup**
- Files: `src/app/register/register-form.tsx:125` `minLength={6}`; `login/page.tsx:81`, `register-form.tsx` `<form action="javascript:void(0);">`; positive `tabIndex={1..4}` (`login/page.tsx:97,…`).
- Impact: 6-character passwords for a finance app. React 19 blocks `javascript:` URLs (this works because of `preventDefault` but logs a warning). Positive tabindex breaks natural tab order once more focusables are added (WCAG 2.4.3).
- Fix: min 10-12 characters plus a strength hint, remove `action`, remove the tabIndex values. Add a show-password toggle and "Forgot password" (missing entirely).

**FORM-09 · Low · CONFIRMED · Effort S — Edit modal account/to-account selects can desync from state**
- File: `src/components/transaction/transaction-edit-modal.tsx:262-292`.
- Evidence: options list only `activeAccounts` (archived excluded) and to-accounts exclude `accountId`. If the transaction's account is archived or `toAccountId` is empty, the `<select>` displays the first option while state holds a different value.
- Impact: what's displayed doesn't match what gets saved.
- Fix: include the current (archived) account as a labeled option, and initialize `toAccountId` to a valid value.

**FORM-10 · Low · CONFIRMED · Effort S — Category icon is a free-text Lucide name**
- File: `src/app/more/categories/page.tsx:108-116`.
- Impact: users must know internal icon identifiers. Categories can't be edited, only deleted.
- Fix: an icon picker grid and an edit flow.

### 3.6 Accessibility

**A11Y-01 · High · CONFIRMED · Effort M — No modal has dialog semantics, focus trap, initial focus, focus restore or Escape**
- Files: every overlay listed in §1.4, e.g. `quick-add-modal.tsx:231`, `transaction-edit-modal.tsx`, `accounts/page.tsx:943`, `budget/page.tsx:519`, `loan-detail-modal.tsx` (nested dialog at `z-60`). Repo-wide grep: 0 `role="dialog"`, 0 `aria-modal`, 0 `Escape`.
- Impact: screen-reader users aren't told a dialog opened. Tab moves into the page behind. Background content stays scrollable and readable. Keyboard users can't dismiss with Esc. Fails WCAG 2.1.2, 2.4.3, 4.1.2.
- Fix: a shared `<Dialog>`/`<Sheet>` primitive (native `<dialog>` with `showModal()`, or Radix/shadcn as the PRD suggests) with `aria-labelledby` on the title, focus trap, restore, Esc, and inert background. Migrate all 14 overlays.

**A11Y-02 · High · CONFIRMED · Effort M — Primary list rows and controls are mouse-only `div onClick`**
- Files: transaction rows `daily-view.tsx:143`, `calendar-view.tsx` rows and day cells `:138`, `accounts/[id]/page.tsx:353`, monthly rows `monthly-view.tsx:87`, budget rows `budget/page.tsx:353`, stats category rows `stats/page.tsx:366` and donut slices, inbox master list `inbox/page.tsx:483`, SMS activity expand `sms-activity/page.tsx:140`, `SyncIndicator` `sync-provider.tsx:225-231`.
- Impact: keyboard users can't open or edit transactions, budgets, calendar days, inbox items or the sync retry. PRD §6 requires a "keyboard-navigable desktop UI".
- Fix: use `<button>` (or `<a>`) for the row action with a descriptive accessible name, e.g. "Groceries, LKR 1,250.00 expense, 12 Oct — edit". Make calendar days buttons with `aria-pressed`/`aria-current="date"`.

**A11Y-03 · Medium · CONFIRMED · Effort S — Icon-only buttons without accessible names**
- Files: modal close X buttons (`account-cancel` `accounts/page.tsx:957`, `settle-cancel-btn` `settle-modal.tsx:124`, `quick-add-close` `:292`, `transaction-edit-close`, `calibration-close`, FD/loan/installment/early-payoff close, filter close, search clear); back links (`accounts/[id]/page.tsx:185` title only; `household`, `inbox`, `categories`, `sms-activity`, `shortcuts`: no name at all); SMS-activity chevron `:212-216`; split-row remove `X`; loan override edit/save; account edit/archive/delete (title only).
- Impact: announced as "button" or "link" with no purpose (WCAG 4.1.2, 2.4.4). `title` isn't reliably exposed and doesn't help touch users.
- Fix: `aria-label` on every icon-only control. Mark decorative icons `aria-hidden`.

**A11Y-04 · Medium · CONFIRMED · Effort S — Toggles, segmented controls and tabs expose no state**
- Files: `segmented-tabs.tsx:25` (no `role="tablist"/"tab"`, no `aria-selected`); stats type tabs `stats/page.tsx:205-250`; quick-add type switch `:243-287`; "Exclude from budget" and split toggles (`quick-add-modal.tsx:523`, `transaction-edit-modal.tsx:355`); access-scope Private/Shared; loan kind; settle chips; category color swatches (`categories/page.tsx:126`, color only, no name); SMS status filters; sidebar collapse (no `aria-expanded`); filter button (no `aria-expanded`).
- Impact: screen readers can't tell which option is selected or whether a switch is on (WCAG 4.1.2). The color picker is unusable without color vision (1.4.1).
- Fix: `role="switch" aria-checked` for toggles; `aria-pressed` for chip groups (or radio groups); proper tabs; `aria-label="Blue"` etc. for swatches.

**A11Y-05 · Medium · CONFIRMED · Effort S — WCAG AA contrast failures (PRD §5.0 requires AA in both themes)**
Computed ratios (AA normal text needs 4.5:1):
| Usage | Pair | Ratio |
|---|---|---|
| Budget "warning" remaining text, `--warning` light | #D98E04 on #FFFFFF / #F5F6F7 | 2.68 / 2.48 |
| Amber chips/text (`text-amber-500`: inbox reason, split tag, review chips) | #F59E0B on ~white | 2.15 |
| "Calibrate" buttons (`bg-amber-500 text-white`, `accounts/page.tsx:1379,1584`, `[id]/page.tsx`) | #FFF on #F59E0B | 2.15 |
| Amber-600 hints (mismatch, blocked) | #D97706 on white | 3.19 |
| `text-red-500` error messages | #EF4444 on white / surface | 3.76 / 3.48 |
| `text-blue-500` SMS chip / "Syncing…" | #3B82F6 on white | 3.68 |
| White on accent, dark theme (all accent buttons) | #FFF on #E8505B | 3.67 |
| White on income / expense, dark theme ("Deposit proceeds", "Confirm Premature Close") | #FFF on #5B93F0 / #F06A6E | 3.05 / 3.00 |
| `text-emerald-600` "Nothing to adjust" | #059669 on white | 3.77 |
- Impact: low-vision users can't read warnings and errors, which matter most in a finance app. The existing S01-07 axe test only scans the shell, so it misses these.
- Fix: darken the tokens (e.g. warning ≈ #9A6200 light; red-700 for errors; a dark-theme accent ≥ #C83A45 with white, or use dark text on light accents). Extend the axe scan to every screen and open modals (PLAN S21-06).

**A11Y-06 · Medium · CONFIRMED · Effort S — Search input has no label; filter state not announced**
- File: `src/components/transaction/trans-filter-bar.tsx:57-64` (placeholder only), `:93` active-filter dot.
- Fix: `aria-label="Search transactions"`, and announce the result count via `aria-live="polite"` ("12 transactions").

**A11Y-07 · Medium · CONFIRMED · Effort S — Charts have no text alternative**
- File: `src/app/stats/page.tsx:299-330` (donut SVG, `aria-label` on non-focusable `<circle>`s), trend bars `:260-280`.
- Impact: screen readers get nothing (WCAG 1.1.1). The ranked list partly compensates, but the trend has no table equivalent.
- Fix: `role="img"` + `<title>` summary on the SVG, `aria-hidden` on slices, and a visually-hidden table for the trend.

**A11Y-08 · Medium · CONFIRMED · Effort S — Undo toast, sync state and save notices are not live regions**
- Files: `src/app/page.tsx` undo toast (`data-testid="undo-toast"`), `SyncIndicator`, `settings-saved`, `gemini-settings-saved`, `reminder-status`, PWA update banner.
- Impact: screen-reader users never hear "Transaction deleted — Undo" (and it auto-dismisses after 6 s, which fails WCAG 2.2.1 timing for users who need more time).
- Fix: `role="status"`/`aria-live="polite"`, pause the timer on hover/focus, and move focus to Undo or make the timeout ≥ 10 s.

**A11Y-09 · Medium · CONFIRMED · Effort S — Tap targets below 44×44 / 24×24 px**
- Files: account edit/archive/delete (`p-1.5` + 13 px icon ≈ 25 px), split remove, category delete, filter X, search clear (`p-0.5` + 13 px ≈ 17 px), loan override buttons (`p-1` + 13-14 px ≈ 22 px), status chips with `py-0.5`.
- Impact: frequent mis-taps, made worse by FIN-05 (one-tap delete next to edit). WCAG 2.5.8 (24 px min) is failed by several of these.
- Fix: minimum 40-44 px hit area (padding or `::after` overlay) on mobile.

**A11Y-10 · Low · CONFIRMED · Effort S — Font sizes below the PRD scale**
- Files: widespread `text-[9px]` (calendar amounts), `text-[10px]`, `text-[11px]`. PRD §5.0: sizes 12/14/16/20/28.
- Impact: readability on phones. Calendar day amounts at 9 px are close to illegible.
- Fix: enforce the scale via Tailwind theme tokens. Truncate or abbreviate (e.g. "12.5k") instead of shrinking.

**A11Y-11 · Low · CONFIRMED · Effort S — MonthSwitcher container is focusable without a role/name; swipe has no announcement**
- File: `src/components/ui/month-switcher.tsx:63-70` (`tabIndex={0}` div with `focus:outline-none`), label `:85-90`.
- Impact: an extra unnamed tab stop with an invisible focus state. Month changes aren't announced.
- Fix: drop the tabIndex (the buttons already work), or give it `role="group" aria-label="Month"`. Put `aria-live="polite"` on the label.

**A11Y-12 · Low · CONFIRMED · Effort S — `select-none` on whole sheets**
- Files: quick-add `:233`, transaction-edit, calibration, installment and early-payoff modals (`select-none` on the root).
- Impact: users can't select or copy amounts or notes, and on iOS `user-select:none` can interfere with caret placement and text selection in nested inputs (SUSPECTED).
- Fix: apply `select-none` only to keypad buttons.

**A11Y-13 · Low · CONFIRMED · Effort S — Raw enum strings and jargon shown to users**
- Files: household roles `CONTRIBUTOR_ADD_ONLY`, `CO_OWNER` (`household/page.tsx:398` etc.); SMS status `IGNORED_NON_TX`, `NEEDS_REVIEW` (`sms-activity/page.tsx`); account type `(BANK_SAVINGS)` in pickers (`fd-close-modal.tsx`, `loan-modal.tsx`, `inbox`); transaction type badge `EXPENSE` in the edit header; fallback category label `tx.type`.
- Fix: a label map ("Contributor (add only)", "Savings account"), also needed for PRD §6 "text externalized for later localization".

### 3.7 Number & currency formatting

**FMT-01 · Medium · CONFIRMED · Effort M — Currency is hard-coded to LKR while settings allow changing it**
- Files: `src/lib/finance-core/money.ts:24-41` (default `"LKR"`, always 2 decimals, `en-LK`); labels "Amount (LKR)" in settle, edit, inbox, bookmarks, loan, installment, budget; `accounts/page.tsx:383` creates accounts with `currency: "LKR"`; More settings let the user set `defaultCurrency` (`more/page.tsx` `settings-currency`, free text, `maxLength=3`).
- Impact: a user who sets USD or JPY still sees LKR everywhere, and new accounts are created in LKR (PRD §2.1: single currency = `defaultCurrency`, formatted using the ISO 4217 exponent). JPY would show phantom decimals.
- Fix: a `useCurrency()` context fed from user settings. `formatMoney` should use `Intl.NumberFormat(locale, { style: "currency", currency })` with `minimumFractionDigits` from the currency. Validate the setting against a list.

**FMT-02 · Medium · CONFIRMED · Effort S — Four different money formats across screens**
- Evidence: `formatMoney` → "LKR 1,250.50"; `SummaryBar` own formatter (`summary-bar.tsx:18-25`); calendar `toLocaleString("en-US", { maximumFractionDigits: 0 })` → "+1,251" (rounded, no currency) `calendar-view.tsx:163,171`; budget `"Rs. 0.00 / day"` `budget/page.tsx:396`; trend `formatMoney(...).replace("LKR ", "")` `stats/page.tsx:276`; SMS activity `LKR {amountText}` (unformatted raw parser text); calibration delta `(delta/100).toFixed(2)` without grouping; split remaining `LKR ${(…).toFixed(2)}`.
- Impact: inconsistent and sometimes mis-rounded figures. "Rs." vs "LKR" in the same view.
- Fix: route every display through one formatter with variants (`compact`, `signed`, `noCurrency`).

**FMT-03 · Medium · CONFIRMED · Effort S — Sign conventions inconsistent; "−" and "+" rendered as separate prefixes**
- Evidence: daily/monthly/summary prepend `"- "`/`"+ "` around `formatMoney(abs)`; `formatMoney` itself emits `-LKR 1.00` for negatives (accounts net worth, balances); transfers show no sign in Daily but a sign in Account detail.
- Impact: inconsistent reading, and screen readers say "dash LKR…". Negative net worth reads "-LKR".
- Fix: use `formatMoney(x, { signDisplay })` via Intl (`signDisplay: "exceptZero"`), and use a true minus sign (U+2212).

### 3.8 Totals & view consistency (UI computation bugs)

**CALC-01 · Medium · CONFIRMED · Effort S — Refunds are lost depending on iteration order**
- Files: `src/app/page.tsx:183-186`, `summary-view.tsx:31-33,46-47`, `stats/page.tsx:59-61,83-85,149-150`.
- Evidence: `exp = Math.max(0, exp - t.amountMinor)` evaluated per row while iterating unsorted transactions.
- Impact: if a refund row is visited before the expenses it offsets, it's clamped against 0 and discarded, so the monthly expense total depends on Dexie row order.
- Fix: accumulate gross expense and refunds separately, then compute `Math.max(0, exp - refunds)`. Move this logic into `finance-core` with tests.

**CALC-02 · Medium · CONFIRMED · Effort S — Daily subtotal, Calendar, Monthly ignore refunds; Summary/Stats/SummaryBar don't**
- Files: `daily-view.tsx:64-73`, `calendar-view.tsx:44-55`, `monthly-view.tsx:47-51` (only INCOME/EXPENSE) vs. `page.tsx` SummaryBar and `summary-view.tsx` (refund-aware).
- Impact: the same month shows different expense totals on different tabs. Monthly also counts transfers in `count`.
- Fix: a single `aggregateMonth()` in `finance-core` used by every view.

**CALC-03 · Medium · CONFIRMED · Effort S — Net worth changes when "Show archived" is toggled**
- File: `src/app/accounts/page.tsx:218-248` (iterates `visibleAccounts`).
- Impact: archiving an account with a balance removes it from net worth, so a view filter changes a financial total.
- Fix: compute totals from all non-deleted accounts regardless of the display filter.

**CALC-04 · Medium · CONFIRMED · Effort S — Stats category drill-down shows the wrong amounts and signs**
- File: `src/app/stats/page.tsx:126-136,447-451`.
- Impact: for split transactions it shows the full transaction amount instead of the split portion. Refunds display as "- amount" in red like expenses.
- Fix: list split items individually and render refunds as positive or credit.

**CALC-05 · Low · CONFIRMED · Effort S — Trend bars show 6% height for zero months**
- File: `src/app/stats/page.tsx:269` — `Math.max(6, heightPct)`.
- Impact: months with no spend look like they had some.
- Fix: 0 height (or a hairline) when the total is 0.

**CALC-06 · Low · CONFIRMED · Effort S — Summary view percentages rounded independently**
- File: `summary-view.tsx:56` `Math.round(percent)`, whereas stats uses `calculatePercentagesLargestRemainder`.
- Impact: percentages can sum to 99 or 101.
- Fix: reuse the largest-remainder helper.

### 3.9 Role, privacy & auth surface (frontend-visible)

**SEC-01 · High · CONFIRMED · Effort S — Open redirect via `callbackUrl`**
- Files: `src/middleware.ts:61-63` (`callbackUrl.startsWith("/")` accepts `//evil.example`); `src/app/login/page.tsx:12,46` (`router.push(callbackUrl)` with no validation).
- Impact: `/login?callbackUrl=//evil.example/phish` redirects an authenticated user off-site (`new URL("//evil.example", request.url)` resolves cross-origin). Classic phishing vector for a finance app.
- Fix: accept only same-origin relative paths (`/^\/(?!\/|\\)/`). Validate the parsed `URL.origin === request.nextUrl.origin` in both places.

**SEC-02 · Medium · CONFIRMED · Effort S — `middleware.ts` is the deprecated Next 16 convention**
- File: `src/middleware.ts:18` `export async function middleware`. Per [Next.js docs](https://nextjs.org/docs/messages/middleware-to-proxy), the convention was renamed to `proxy` in v16. `middleware` still runs but is deprecated.
- Impact: the auth gate will break on the next major upgrade if left as is. It also hard-codes a fallback secret (`"insecure-dev-auth-secret…"`, `:4`), so a missing `AUTH_SECRET` in prod still lets the app start with a public key (forgeable sessions). Cross-ref the backend audit.
- Fix: rename to `src/proxy.ts` / `export function proxy`. Fail fast when `AUTH_SECRET` is missing outside dev.

**SEC-03 · High · CONFIRMED · Effort S — Contributor balance masking fails open and leaks through totals**
- Files: `src/app/accounts/page.tsx:180-191` (group subtotals), `:218-248` (net-worth header), `:63-78` (role map from `/api/households`, failures silently ignored); `src/app/accounts/[id]/page.tsx` (no role checks at all: full balance, outstanding, Calibrate and Settle visible).
- Impact: account cards show "—" for contributor-scoped accounts, but the Cash/Bank/Credit subtotals and Assets/Liabilities/Net Worth include those balances, so a contributor can read them. If the households fetch fails or is offline, `role` is null and all masking disappears. The detail page shows everything to anyone with the URL. PRD §3 says contributors must never see balances (the server shouldn't send them, but the UI shouldn't compute or display them either).
- Fix: exclude contributor-scoped accounts from totals, cache roles in Dexie (synced) instead of an online fetch, and apply the same `isContributor`/`isViewer` gating on the detail page (hide balance, Calibrate, Settle; viewers get read-only).

**SEC-04 · Medium · CONFIRMED · Effort S — Viewer/contributor gating missing on write actions outside the Accounts list**
- Files: quick-add (any account, any role), transaction edit/delete modal, calibration, settle on the detail page, budget, bookmarks, categories.
- Impact: viewers can attempt writes that the server later rejects. The only feedback is the sync "Error (n)" badge with no explanation (STATE-05).
- Fix: role-aware disabled states with an explanation ("View-only access"), and filter quick-add accounts by write permission.

**SEC-05 · Low · CONFIRMED · Effort S — Webhook key copy has no fallback or error handling**
- File: `src/app/more/page.tsx:255-262`. `navigator.clipboard.writeText` isn't awaited; if it rejects (non-secure context or permission denied) the UI still shows "Copied".
- Fix: await, catch, and fall back to selecting the text with a "Press ⌘C" hint.

### 3.10 PWA, service worker & push

**PWA-01 · Critical · CONFIRMED · Effort M — Push subscription is a hard-coded fake; push can never work**
- File: `src/app/more/page.tsx:186-205`.
- Evidence: `endpoint: \`https://fcm.googleapis.com/fcm/send/test-${Math.random()…}\``, `keys: { p256dh: "BMo9aW7-test-p256dh-key-mock", auth: "mockAuthKey123" }`. Repo grep: no `pushManager.subscribe`, `/api/push/vapid-public-key` is never called from the UI, and no `web-push` dependency in `package.json`.
- Impact: "Reminders active" is shown, but no real subscription is ever created, so no device ever receives a reminder. The PRD §1 VAPID requirement is unmet. The E2E S20-06 test only checks that the endpoint stores data. Unsubscribe also doesn't call `PushSubscription.unsubscribe()`.
- Fix: `const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })` → POST `sub.toJSON()`. Handle unsupported browsers and iOS-not-installed with explicit messages. Add a server sender (cross-ref backend).

**PWA-02 · Critical · SUSPECTED · Effort M — Offline cold start depends on the browser HTTP cache; SW never serves `/_next/` assets**
- Files: `public/sw.js:58-67` (`url.pathname.startsWith("/_next/") … return;`); `src/components/pwa-manager.tsx:27-63` primes `/_next/` scripts and CSS into Cache Storage that the SW never reads.
- Impact: when offline, the cached HTML loads but its JS and CSS chunks go to the network. They only work if they're still in the HTTP disk cache (subject to eviction, which is aggressive on iOS). When evicted, the app opens unstyled and non-interactive, breaking the PRD promise ("works fully offline from cold start"). PLAN tests S20-01/S20-02 (offline reload / offline tab navigation) are absent from `tests/e2e/s20-pwa.spec.ts`. Effect not reproduced in a browser, hence SUSPECTED.
- Fix: adopt Serwist (PLAN Step 20) with a build-time precache manifest of `/_next/static/**` plus a versioned cache, or at minimum serve `/_next/static/` cache-first from the SW. Add the missing S20-01/02 tests.

**PWA-03 · Medium · CONFIRMED · Effort S — RSC/flight requests are answered with cached HTML**
- File: `public/sw.js:69-121`.
- Evidence: non-HTML GETs go to the cache-first branch with `caches.match(event.request, { ignoreSearch: true })` and then `caches.match(url.pathname, { ignoreSearch: true })`. Next client navigations fetch `/<route>?_rsc=…` with `RSC: 1`. `ignoreSearch` plus the pathname fallback matches the cached HTML *document* for that route, and stale RSC payloads are also cached and served first.
- Impact: soft navigations can receive HTML instead of a flight payload (Next falls back to a hard navigation, slower with a flash) or stale RSC data after deploys (SUSPECTED runtime effect; the matching logic is confirmed).
- Fix: bypass requests with an `RSC` header or `_rsc` search param. Never use `ignoreSearch` for app routes. Restrict cache-first to known static extensions.

**PWA-04 · Medium · CONFIRMED · Effort S — Update flow is undermined by unconditional `skipWaiting()`**
- File: `public/sw.js:14` (`self.skipWaiting()` in install) + `clients.claim()`; `pwa-manager.tsx:79-101,123-133`.
- Impact: a new SW activates immediately under an old page (version skew between old JS and new SW cache rules). `reg.waiting` is almost never set, so the "New version available" banner rarely appears. When it does, the reload icon spins permanently (`animate-spin`, `:156`), which reads as "loading".
- Fix: remove the install-time `skipWaiting`, keep the `SKIP_WAITING` message path, and use a static icon.

**PWA-05 · Medium · CONFIRMED · Effort S — Cache version is a manual constant duplicated in two files; cache grows unbounded**
- Files: `public/sw.js:2` `"hardmoney-v4"`; `pwa-manager.tsx:31` `caches.open("hardmoney-v4")`.
- Impact: forgetting to bump both on deploy leaves stale shells. Every visited HTML route and static GET is cached forever with no size or age limit. If they drift, the manager writes into a cache that `activate` deletes.
- Fix: build-time revision (Serwist), expiration plugin, and a single source of the cache name (or let the SW own all caching).

**PWA-06 · Medium · CONFIRMED · Effort S — Authenticated HTML is cached per-URL and survives logout**
- File: `public/sw.js:79-86` (caches every 200 navigation response); logout (`more/page.tsx:229-239`) doesn't clear caches or IndexedDB.
- Impact: today's pages are client shells without server-rendered data, so the leak is low. With `cacheComponents: true` (`next.config.ts`), any future server-rendered personal data would be persisted in Cache Storage across users on a shared device. Combined with PRV-02, a logged-out device keeps the full ledger in IndexedDB.
- Fix: only cache an allow-list of public shells. On logout, `caches.delete` and post a message to the SW. Offer a "clear local data" option.

**PWA-07 · Low · CONFIRMED · Effort S — Notification fallback URL points to a non-existent route**
- File: `public/sw.js:130,146,157` default `"/transactions"`. No such route exists (Transactions is `/`). The cron payload uses `"/"` (`src/lib/jobs/cron-runner.ts:546`).
- Fix: default to `"/"`. Validate `targetUrl` as same-origin before `openWindow`.

**PWA-08 · Low · CONFIRMED · Effort S — No in-app install prompt despite capturing `beforeinstallprompt`**
- File: `pwa-manager.tsx:19-25` stores the event on `window.__hardMoneyInstallPrompt` and dispatches `hardmoney_install_ready`, but nothing listens. The iOS note on More only shows on iOS.
- Fix: an "Install app" row on More (Android/desktop) that calls `prompt()`, hidden when `display-mode: standalone`.

**PWA-09 · Low · CONFIRMED · Effort S — Manifest polish**
- File: `public/manifest.json`.
- Issues: no `id`/`scope`; `orientation: "portrait-primary"` locks tablet and desktop installs; static dark `theme_color`/`background_color` gives light-theme users a dark splash; the maskable icon reuses `icon-512.png`, which already has a rounded square with padding (seen in the image), producing a double-rounded mask; no `shortcuts` (e.g. "Add expense" → open quick add); no `screenshots` (richer Android install UI); the icon artwork reads "VG" while the in-app brand mark is "H" (`sidebar.tsx`, login). `icon-512.png` is 290 KB.
- Fix: add `id: "/"`, `scope: "/"`, drop the orientation lock, add a dedicated maskable icon with a safe zone, shortcuts and screenshots, and a compressed icon. Align the branding.

**PWA-10 · Low · CONFIRMED · Effort S — Offline fallback page copy and chrome**
- File: `src/app/offline/page.tsx:22-25`.
- Impact: it renders inside the full app shell (nav, FAB). The FAB opens Quick Add, which works offline, so that's fine, but the copy says "cached ledger data are still accessible" without a link back to `/`.
- Fix: add a "Go to Transactions" button. Ensure `/` is always precached so that link works.

**PWA-11 · Low · CONFIRMED · Effort S — Leftover create-next-app assets**
- Files: `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`; `src/app/favicon.ico` alongside `public/favicon.png`.
- Fix: delete the unused files, keep one favicon.

### 3.11 Mobile layout & responsiveness

**MOB-01 · High · CONFIRMED · Effort S — Bottom nav, FAB, toasts ignore safe-area insets despite `viewportFit: "cover"`**
- Files: `layout.tsx:13-21` (`viewportFit: "cover"`, `statusBarStyle: "black-translucent"`); `bottom-nav.tsx:32` `fixed bottom-0 h-16`; `fab.tsx:36` `bottom-20`; undo toast and PWA banner `bottom-20`; `layout.tsx:62` `pb-16`. No `env(safe-area-inset-*)` anywhere.
- Impact: on notched iPhones in standalone mode, the bottom nav sits under the home indicator. The top content goes under the status bar because black-translucent overlays content and there's no top inset, so the page header collides with the clock and battery.
- Fix: `padding-bottom: env(safe-area-inset-bottom)` on the nav (height `calc(4rem + inset)`), offset the FAB and toasts the same way, and add `padding-top: env(safe-area-inset-top)` to the shell.

**MOB-02 · Medium · CONFIRMED · Effort S — `h-screen` (100vh) shell on mobile**
- File: `layout.tsx:46` `h-screen w-screen overflow-hidden`.
- Impact: on mobile browsers 100vh includes the collapsing URL bar, so the bottom of each page is clipped behind browser chrome. `w-screen` can add horizontal overflow when a scrollbar is present. When the keyboard opens, sheets using `max-h-[90vh]` don't shrink, so focused inputs and Save buttons end up behind the keyboard.
- Fix: `h-dvh`; `max-h-[90dvh]` on sheets; consider `interactive-widget=resizes-content` in the viewport.

**MOB-03 · Medium · CONFIRMED · Effort S — FAB overlaps content and appears on every page**
- File: `src/components/ui/fab.tsx:15-18` (hidden only on login/register).
- Impact: it covers the last list row's amount and action buttons (e.g. "Details & Schedule", inbox Post button, settings Save buttons) on every page, including More sub-pages where adding a transaction makes no sense. The main scroll padding is only `pb-16` (nav height), with nothing for the FAB.
- Fix: extra bottom padding (`pb-36`) on mobile, hide the FAB on `/more/*` and `/accounts/[id]` (or make it contextual: preselect the account on the detail page via `openQuickAdd({ accountId })`).

**MOB-04 · Medium · CONFIRMED · Effort S — Dense rows overflow on narrow screens**
- Files: CC stats `grid-cols-4` (`accounts/page.tsx:1519`) with "LKR 1,234,567.00" in each cell; FD/loan meta rows `flex items-center gap-3` with 4 spans and no wrap (`:756-761`, `:885-892`); summary bar 3 columns with long amounts; settle chips `grid-cols-3` with `truncate` (amount cut off, `settle-modal.tsx:148-169`); monthly view puts income and expense side by side.
- Impact: truncated or clipped money values at 320-375 px widths, where users can't see the amount they're about to settle.
- Fix: `flex-wrap`, a 2×2 grid on mobile, compact number format, and never truncate money (wrap instead).

**MOB-05 · Low · CONFIRMED · Effort S — Mobile header controls duplicated per page**
- Files: `src/app/page.tsx` mobile theme/color-swap/sync controls; `accounts/page.tsx` sync only; other pages have none. `AppHeader` (`src/components/navigation/app-header.tsx`) exists but is unused.
- Impact: inconsistent top bar across tabs; sync status is visible only on two tabs on mobile.
- Fix: use `AppHeader` on every tab and move theme controls to More only.

**MOB-06 · Low · CONFIRMED · Effort S — Inbox renders both mobile and desktop DOM**
- File: `src/app/more/inbox/page.tsx` (mobile list + desktop master/detail, both rendered, hidden with CSS).
- Impact: duplicated forms and testids. Each item's form state is shared across both, which is fine, but screen-reader users of desktop zoom (≥ md) won't hit the hidden copy. Doubles render cost.
- Fix: one responsive layout, or conditional rendering via a media-query hook.

### 3.12 Navigation & consistency

**NAV-01 · Medium · CONFIRMED · Effort S — "View Transaction →" deep link goes nowhere**
- File: `src/app/more/sms-activity/page.tsx:177` → `/?highlight=<id>`. `src/app/page.tsx` never reads search params, and the month is pinned (DATE-01).
- Fix: read `highlight`, switch to that transaction's month, scroll to it and highlight it, or open the edit sheet.

**NAV-02 · Medium · CONFIRMED · Effort S — "Export & Import" menu row is a dead control**
- File: `src/app/more/page.tsx:366` (`href: null`) renders with `cursor-pointer` and a chevron but does nothing (PLAN Step 21 still ☐).
- Fix: hide it until implemented, or show a "Coming soon" disabled state.

**NAV-03 · Low · CONFIRMED · Effort S — Placeholder content on More**
- File: `src/app/more/page.tsx:956-961` (an `EmptyState` titled "Settings & Tools" at the bottom of a populated page, commented "Empty State requirement"); `:396` fallback email `treasury-admin@local`.
- Fix: remove both. Show a skeleton while the profile loads.

**NAV-04 · Low · CONFIRMED · Effort S — Back navigation is hard-coded and inconsistent**
- Files: sub-pages link to `/more` or `/accounts` with arrow icons of different sizes and styles (`size 16` vs `18`, bordered vs not: `sms-activity`, `shortcuts`, `categories`, `household`, `inbox`, `bookmarks`, account detail). Modals don't integrate with browser history, so Android back or the swipe-back gesture leaves the page instead of closing the sheet.
- Fix: a shared `PageHeader` with back affordance. Push a history entry (or use intercepting/parallel routes) for sheets so hardware back closes them.

**NAV-05 · Low · CONFIRMED · Effort S — Household UI supports only `households[0]`**
- File: `src/app/more/household/page.tsx:229`.
- Impact: if a user belongs to more than one household (e.g. invited into one after creating their own), the others are invisible.
- Fix: a household switcher, or enforce single-membership on the server and explain it.

**NAV-06 · Low · CONFIRMED · Effort S — Shortcuts guide has wrong pointers and an overstated privacy claim**
- File: `src/app/more/shortcuts/page.tsx:67` ("More > User Settings", but the key lives under "SMS Webhook Ingress"); `:104` hard-coded `https://your-domain.com/...` instead of the actual origin; `:118-121` claims raw SMS are "processed strictly in memory", while the SMS Activity page shows stored raw messages.
- Fix: deep-link to the webhook section, render `window.location.origin`, and correct the privacy copy (legal and trust risk).

**NAV-07 · Low · CONFIRMED · Effort S — Gemini model list includes legacy models**
- File: `src/app/more/page.tsx:629-634` (`gemini-1.5-flash`, `gemini-1.5-pro`).
- Fix: drive the list from server config. Validate on save.

### 3.13 Visual / design-token defects

**VIS-01 · High · CONFIRMED · Effort S — Budget "Add Budget" and "Save Budget" buttons are invisible**
- File: `src/app/budget/page.tsx:269`, `:593` — `bg-[var(--primary)] text-white`. `--primary` isn't defined in `globals.css`, so the background is transparent. Also `focus:ring-primary`, `text-primary` (`:531,555,575`) reference undefined tokens.
- Impact: white text on a white or light background. The main CTA of the Budget tab, and the modal's submit, can't be seen in light mode.
- Fix: use `--accent` (or define `--primary`). Add a lint rule or test that rejects unknown CSS vars.

**VIS-02 · Medium · CONFIRMED · Effort S — Undefined tokens used in 24 places**
- Evidence (grep): `var(--surface-hover)` (accounts scope buttons `:1010,1022`, FD close summary, More, household, inbox, quick-add chip row, shortcuts), `var(--muted)` (`sync-provider.tsx:236,248`), Tailwind `bg-accent` / `text-accent` / `border-accent` (`trans-filter-bar.tsx:93`, `calendar-view.tsx:143,150`). `@theme` defines no `--color-accent`, and `globals.css` defines neither `--surface-hover` nor `--muted`.
- Impact: hover states, the calendar "today" ring, the active-filter dot, and panel backgrounds silently don't render. "Synced" text inherits its color.
- Fix: add the tokens to `:root`/`.dark` and `@theme` (`--color-accent`), or replace the usages.

**VIS-03 · Medium · CONFIRMED · Effort S — Hard-coded Tailwind palette colors bypass theme and color-swap**
- Files: `text-red-500`, `bg-red-600` (errors, delete), `text-blue-500`/`bg-blue-500` (sync, progress bars, SMS chip), `text-green-600`, `emerald`, `amber`, `purple`, `zinc` (reminders toggle).
- Impact: dark-mode contrast issues (A11Y-05). The "color swap" preference (red = income) conflicts with red error and delete styling, and blue progress bars read as "income".
- Fix: semantic tokens (`--danger`, `--info`, `--success`, `--progress`) independent of the income/expense pair.

**VIS-04 · Low · CONFIRMED · Effort S — Theme flash on load for explicit-theme users**
- File: `src/components/theme-provider.tsx:20-33,57-69`.
- Evidence: the initial state is `"system"` and the saved theme is applied in a microtask, but the apply effect runs first with `"system"` (removes `data-theme`, may toggle `.dark`) and sets `data-color-swap="false"`, then re-applies.
- Impact: a one-frame flash of the wrong theme or colors for users whose saved choice differs from the OS (SUSPECTED visibility; the logic is confirmed).
- Fix: lazily initialize state from `document.documentElement` (set by the inline script) instead of `"system"`.

**VIS-05 · Low · CONFIRMED · Effort S — Hydration mismatch from `localStorage` in `useState` initializers**
- Files: `src/app/page.tsx:24-34` (`trans-start-view`), `sync-provider.tsx:35-40` (`hardmoney_active_user`).
- Impact: the server renders "daily" while the client may render "calendar", which triggers React hydration errors and re-renders. This is fragile with `cacheComponents: true`.
- Fix: read in an effect (`useMounted` already exists) or use `useSyncExternalStore` with a server snapshot.

**VIS-06 · Low · CONFIRMED · Effort S — Misc copy**
- `register/page.tsx:36` "registration closed" (lowercase); budget empty state "No budgets set for this month" (budgets are global); SMS modal fallback shows `tx.note` labeled as the raw SMS from sender "BANK" (`daily-view.tsx:39,46`), which is misleading.
- Fix: copy pass, and show "Original SMS not available offline" instead of fabricated content.

### 3.14 Performance (UI)

**PERF-01 · Medium · CONFIRMED · Effort M — Every screen loads entire tables into memory and re-filters per render**
- Files: `sync-provider.tsx:157-215` (`.filter(...).toArray()` on full tables); `page.tsx` filters all transactions by `startsWith(monthPrefix)`; account detail renders the full history without pagination (`accounts/[id]/page.tsx:340-420`); `monthly-view.tsx:38-60` does 12 × N iterations; `planProgressMap` is O(plans × transactions).
- Impact: with years of data (tens of thousands of rows) every live-query change re-materializes and re-filters everything on each tab, causing jank on mid-range phones and violating PRD §6 ("computed incrementally").
- Fix: indexed range queries (`where("transactionDate").between(...)`), virtualization or pagination for long lists, memoized per-month aggregates.

**PERF-02 · Low · CONFIRMED · Effort S — Sync poll loop and overlapping syncs**
- File: `sync-provider.tsx:104-122` (an effect fires `triggerSync` whenever pending changes, plus a 1 s `setInterval` while pending, even offline); `syncNow` has no in-flight guard (`client.ts:22`).
- Impact: overlapping push requests every second while offline or failing, which drains the battery and floods requests. Session lookups also run on every pathname change (`:43-59`).
- Fix: a single-flight guard, exponential backoff, and pausing while `!navigator.onLine`.

### 3.15 Privacy

**PRV-01 · Medium · CONFIRMED · Effort S — Raw bank SMS shown with `select-all` and no masking**
- Files: `inbox/page.tsx` (`select-all` raw message), `sms-activity/page.tsx` raw + parsed JSON, `daily-view.tsx` SMS modal.
- Impact: full account numbers or OTP-like content may appear on screen (shoulder-surfing, screenshots). The Gemini disclosure promises masking for the AI step only.
- Fix: display the masked version by default (`mask-numbers.ts` exists) with a "Reveal" toggle.

**PRV-02 · Medium · CONFIRMED · Effort S — Local financial data persists after logout with no "remove from this device" option**
- Files: `more/page.tsx:229-239`; `src/lib/db/index.ts:374-381` (per-user DB is never deleted).
- Impact: on a shared or borrowed device, the full ledger stays readable in DevTools. The PRD intentionally keeps data across *expiry*, but an explicit logout should offer a wipe.
- Fix: a logout dialog with "Keep data for offline use" vs "Remove data from this device" (`db.delete()`, clear caches).

### 3.16 Dead code / maintainability (frontend)

**DEAD-01 · Low · CONFIRMED · Effort S — Unused modules and imports**
- `src/lib/db/dexie.ts` (a second Dexie schema, `hardmoney-<id>` naming, never imported); `src/components/navigation/app-header.tsx` (unused); `src/lib/use-local-storage.ts` (unused); unused imports such as `Send`, `HelpCircle`, `Inbox` in `inbox/page.tsx:10-14`; `isSearchVisible` state in `trans-filter-bar.tsx:28`; test hooks exposed on `window` in production (`__hardMoneyTriggerUpdatePrompt`, `__hardMoneyDb`, `__hardMoneyTriggerSync`) in `pwa-manager.tsx:117` and `sync-provider.tsx:84-87`.
- Impact: confusion, since two DB naming schemes invite bugs. `window.__hardMoneyDb` hands any injected script the whole ledger (low marginal risk, but unnecessary).
- Fix: delete the dead modules and gate test hooks behind `E2E_MODE`.

**DEAD-02 · Low · CONFIRMED · Effort M — Large copy-pasted UI blocks**
- Examples: installment-plan card and cancel logic duplicated between `accounts/page.tsx:575-700` and `accounts/[id]/page.tsx:480-590`; `AccountCard` vs `CreditCardAccountCard` share most markup; keypad and `getTodayDateString` duplicated in quick-add and calibration; the transaction row renderer is triplicated (daily, calendar, account detail).
- Impact: fixes land in one copy and miss the others (e.g. a11y and confirmation fixes above).
- Fix: extract `InstallmentPlanCard`, `TransactionRow`, `Keypad`, `useToday()`.

---

## 4. Recommended fix order

1. **Data-integrity blockers (Critical/High, S effort):** FIN-01, FIN-02, DATE-01, FIN-05, FIN-03/04, FORM-01, VIS-01, SEC-01.
2. **Trust & safety:** DEST-01/02/03, STATE-04, SEC-03, FIN-06, FIN-10.
3. **PWA promises:** PWA-01 (real push), PWA-02/03/04/05 (adopt Serwist per PLAN Step 20; add S20-01/02 tests), MOB-01/02.
4. **Accessibility pass (PRD §6, PLAN S21-06):** build a shared `Dialog`, `Field`, `IconButton`, `Toggle`, `Tabs` set, then migrate (A11Y-01…09). Extend the axe scan to all screens and open modals.
5. **Consistency:** a single money/date formatter (FMT-01/02/03, DATE-03), a single aggregation in finance-core (CALC-01/02/04), loading skeletons (STATE-01), error pattern (STATE-03/05).
6. **Polish & cleanup:** remaining Medium/Low items.

## 5. Not verified / out of scope
- No browser session was run, so visual effects (theme flash, safe-area overlap, RSC fallbacks, offline cold start) are inferred from code and marked SUSPECTED where it matters.
- Lint and typecheck could not run (no `node_modules`; installing would mutate the workspace).
- Server-side authorization, role enforcement, sync conflict handling and the API routes are covered by other audit areas. Server code was read only where a UI flow depends on it (FD close/deposit-proceeds, loan close/pay-EMI).

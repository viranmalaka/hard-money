# Hard Money: Master Audit Report, 2026-10-20 (second run, "v2")

- **Audit date:** 2026-10-20 (second audit run of the day). Folder: `audit/2026-10-20-v2/`.
- **Commit audited:** `0c401ec` ("feat: add confirmation modal component and integrate into account actions"), 33 commits after the first run's `f8e719a`. Working tree clean apart from the untracked screenshots in `audit/`.
- **Mode:** read-only. No source changes, no commits, no database access, no dev server.
- **Inputs:** six per-area reports written in parallel (`backend-security.md`, `domain-financial.md`, `ui-visual-design.md`, `accessibility.md`, `pwa-mobile.md`, `infra-prd.md`), the seven screenshots in `audit/`, and a small amount of backfill code reading by the aggregator (findings `BF-01` to `BF-04`).
- **Priority lens (from the user):** the product is used mainly as an installed mobile PWA, so UI/UX and accessibility are weighted highest wherever severity is comparable.

Status labels are kept from the source reports. **CONFIRMED** means the code path is unambiguous, a screenshot shows it, or a command reproduced it. **SUSPECTED** means it is likely but depends on runtime, device or deployment behaviour that could not be exercised here.

---

## 1. Executive summary

### Verdict: **Not production-ready.**

The app has a solid local-first core (Dexie outbox, ledger-derived balances, finance-core with golden-vector tests, Argon2id auth with session revocation, safe-area-aware mobile shell). It is not ready to ship to real users as a mobile PWA, for five reasons:

1. **Anyone signed in can overwrite or delete other users' financial rows** through `POST /api/sync/push` (SEC-001, SEC-002, SEC-003 / FIN-02, FIN-03). This alone blocks launch.
2. **The core mobile task, adding a transaction, is not accessible and not safe.** The full-screen Quick Add can't be operated with VoiceOver, TalkBack, a keyboard or Switch Control (A11Y-02). A double tap on Save creates two transactions (PWA-26). "Add New" category throws away the draft (UI-71). The sheet ignores the light theme and colour-swap setting (UI-70).
3. **Large parts of the UI can't be reached by assistive technology.** List rows, budget cards, calendar days and chart slices are `div onClick` (A11Y-01). 18 overlays have no dialog semantics or focus handling (A11Y-03). 90 of 135 form controls have no label (A11Y-04). Primary buttons fail contrast in dark theme, which every screenshot uses (A11Y-07).
4. **Visible product bugs on every screen.** Every month view opens on October 2026 (UI-24). Dividers render as bright white lines (UI-01). The Budget "Add" button has no background (UI-02). Budget cards print the icon name ("Wallet Salary", UI-43). Reminders say "active" but can never be delivered (PWA-01, UI-83). Household ownership transfer is one tap with no confirmation (UI-79).
5. **Money and operations are not trustworthy yet.** Money columns are int4 and overflow above LKR 21.47 M (FIN-01; the screenshot already shows a 9.8 M disbursement). Editing a loan re-opens paid EMIs (FIN-04). Due dates are one day late in Sri Lanka (FIN-05). No scheduler runs the cron jobs (INF-02). `docker compose up` cannot work (INF-01). Raw bank SMS bodies are written to production logs (SEC-005).

### Finding counts

**282 findings in total**: 278 from the six area reports plus 4 backfilled by the aggregator. Every finding is kept. Cross-area duplicates are cross-referenced rather than deleted, so the raw count overstates the number of distinct problems. §18.1 groups the overlapping findings into 56 duplicate clusters.

**By severity**

| Severity | Count |
|---|---|
| Critical | 13 |
| High | 71 |
| Medium | 133 |
| Low | 65 |
| **Total** | **282** |

**By area (each count matches the per-area report)**

| Area (report) | Critical | High | Medium | Low | Total | SUSPECTED |
|---|---|---|---|---|---|---|
| UI, visual design and mobile UX (`ui-visual-design.md`, UI-01…95) | 3 | 24 | 51 | 17 | **95** | UI-50 fully; UI-51, UI-90, UI-92 partly |
| Accessibility, WCAG 2.2 AA (`accessibility.md`, A11Y-01…29) | 2 | 8 | 12 | 7 | **29** | 4 (A11Y-20, A11Y-22 fully; A11Y-14, A11Y-25 partly) |
| PWA and mobile (`pwa-mobile.md`, PWA-01…42) | 1 | 6 | 24 | 11 | **42** | 4 (PWA-07, -09, -21, -22) |
| Backend, API and security (`backend-security.md`, SEC-001…035) | 2 | 6 | 17 | 10 | **35** | 1 (SEC-029) |
| Domain and financial correctness (`domain-financial.md`, FIN-01…40) | 3 | 12 | 14 | 11 | **40** | FIN-28, FIN-40 fully; FIN-08, FIN-31 partly |
| Infra, tests, deployment and PRD gaps (`infra-prd.md`, INF-01…37) | 2 | 15 | 13 | 7 | **37** | INF-27 fully; INF-08, -10, -11, -12, -28, -30 partly |
| Aggregator backfill (this report, BF-01…04) | 0 | 0 | 2 | 2 | **4** | BF-01 partly |
| **Total** | **13** | **71** | **133** | **65** | **282** | |

UI/UX, accessibility and PWA together account for 166 of the 282 findings (59 %) and 6 of the 13 Criticals.

### The Criticals at a glance

| ID | Problem | Area |
|---|---|---|
| A11Y-01 | List rows, budget cards, calendar days, chart slices are `div onClick`: no keyboard, no role, no name | Accessibility |
| A11Y-02 | Mobile Quick Add can't be understood or completed with a screen reader | Accessibility |
| UI-24 | Every month-based screen opens on October 2026 | UI |
| UI-79 | Household "Transfer ownership" is one tap, no confirmation | UI |
| UI-83 / PWA-01 | Reminders report "active" but push is faked end to end | UI / PWA |
| SEC-001 / FIN-02 | Sync push `loanScheduleEntry` and `loanPayment` have no authorization | Security / Finance |
| SEC-002 / FIN-03 | Sync push CREATE is a blind upsert that overwrites any user's row by ID | Security / Finance |
| FIN-01 | Money columns are int4 (overflow above LKR 21,474,836.47) | Finance |
| INF-01 | `docker compose up` can't work (no Dockerfile, worker or migrate step) | Infra |
| INF-02 | No scheduler: statements, installments, FD payouts, budgets and reminders never run | Infra |

---

## 2. Scope and methodology

### 2.1 What was reviewed
- Every page under `src/app`, every component under `src/components`, all 48 route files under `src/app/api`, `src/middleware.ts`, `src/lib/**` (auth, authorization, rate-limit, encryption, server-seq, sync, SMS, jobs, finance-core), `prisma/schema.prisma` and all 4 migrations, `public/sw.js`, `public/manifest.json`, `next.config.ts`, `docker-compose.yml`, `.env.example`, `playwright.config.ts`, the tests, `PRD.md` and `PLAN.md`.
- Next.js 16.4.3 usage was checked against the bundled docs in `node_modules/next/dist/docs/` (`version-16.md`, `proxy.md`, `generate-viewport.md`, `generate-metadata.md`, `progressive-web-apps.md`, `cacheComponents.md`, `accessibility.md`). Viewport, metadata and route-handler usage are correct for this version; `middleware.ts` is deprecated in favour of `proxy.ts`.

### 2.2 Commands run and results (current results from `infra-prd.md` §0)

| Command | Result | First run (`f8e719a`) |
|---|---|---|
| `pnpm lint` | **FAIL** (exit 1): 157 problems, 142 errors, 15 warnings. 139 `no-explicit-any`, 2 React Compiler `set-state-in-effect` bail-outs (`more/sms-activity/page.tsx:51`, `loan-detail-modal.tsx:97`), 1 `prefer-const` (`calculator.ts:98`). | FAIL: 163 errors, 24 warnings |
| `pnpm exec tsc --noEmit` | **PASS** (exit 0) | PASS |
| `pnpm exec vitest run` | **PASS**: 8 files, 62 tests, 0.92 s | PASS: 6 files, 44 tests |
| `pnpm build` (no env) | **FAIL**: `AUTH_SECRET must be configured with at least 32 bytes in production` (`src/lib/auth.ts:9`) during page-data collection | PASS |
| `AUTH_SECRET=<placeholder> pnpm build` | **PASS**: 46 static pages. Warns that `middleware` is deprecated. `/api/push/vapid-public-key` is prerendered static (○). | n/a |
| `docker compose config -q` | Valid YAML; warns `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET` unset | n/a |
| `docker compose build web` | Not possible: no `Dockerfile` exists, and the Docker daemon wasn't running | Same |
| Playwright E2E | **Not run** (needs Postgres and a server, which this audit may not use) | Not run |
| Bundle measurement of `.next/static` (pwa-mobile) | ~1.08 MB raw / ~317 KB gzip JS on every route, `/login` included | n/a |
| Node reproductions | Open-redirect bypass via `/%09/evil.com` (SEC-010); fallback VAPID key decodes to 64 bytes, not 65 (SEC-016); key-rotation corruption (INF-04); multibyte cron secret 500 (INF-32) | n/a |
| Contrast script over `globals.css` tokens; TypeScript AST scans of all `.tsx` | Contrast table in §4.4; 29 `div onClick`, 135 form controls of which 45 labelled | n/a |
| Scratch vitest probe against real `loans.ts`, `investments.ts`, `dates.ts` (deleted afterwards) | Confirmed FIN-05, FIN-17, FIN-20, FIN-32 | n/a |

The builds rewrote the git-ignored `.next/` and re-ran `prisma generate` inside `node_modules`. No tracked file changed.

### 2.3 Screenshots reviewed

All seven were opened and mapped by content. They are dark theme, captured in a browser device frame at roughly 640 CSS px wide (mobile) and 1186 px (desktop).

| File | Screen |
|---|---|
| `audit/image.png` | Trans. tab, Daily view (mobile) |
| `audit/image2.png` | Stats tab, Expense donut (mobile) |
| `audit/image3.png` | Budget tab (mobile) |
| `audit/image4.png` | Accounts tab, Cash & Bank (mobile) |
| `audit/image5.png` | More / Settings & More (mobile) |
| `audit/image6.png` | More → Shopping List (mobile) |
| `audit/image-desktop.png` | Trans. tab with sidebar (desktop) |

**Correction to `pwa-mobile.md`:** that report swaps `image5.png` and `image6.png` in several findings (PWA-12, PWA-21, PWA-28, PWA-29, PWA-30, PWA-31, PWA-32, PWA-36, PWA-39). The aggregator re-opened both files: `image5.png` is the More tab and `image6.png` is the Shopping List, as `ui-visual-design.md` and `accessibility.md` say. This report uses the corrected mapping. The findings themselves are unaffected.

### 2.4 What could NOT be verified
- **Real devices and assistive technology:** VoiceOver (iOS installed PWA), TalkBack (Android), external keyboard, Switch Control, iOS Larger Text / Android font scale, 200 % zoom, 320 px width, landscape. Screen-reader behaviour is predicted from markup, contrast is computed from tokens. Not a WCAG conformance claim.
- **Screens not in the screenshots:** light theme, Liabilities and Investments tabs, any open sheet or dialog, Quick Add, login/register, standalone safe areas, the on-screen keyboard and the real status bar.
- **Runtime behaviour needing Postgres or a browser:** offline cold start on iOS (PWA-07 / INF-11), FD cron crash loop (INF-10), sync races and skipped rows (SEC-019, FIN-15), pay-EMI and FD double-post races (FIN-08, SEC-013), E2E flakiness (INF-30), secure-cookie failure on plain-HTTP LAN installs (INF-27), Apple Shortcut import (INF-12), `X-Forwarded-For` handling by the real proxy (SEC-015), CSP compatibility with `cacheComponents` (SEC-014).
- **Not run in either audit:** `pnpm audit` (known CVEs), the Playwright suite, the Docker image build.
- **Not re-verified this run:** client purge after a household role downgrade, revoked-member local data purge (S6.4), installment-plan cancel restoring the original swipe, the inbox desktop master/detail layout, and earlier MOB-06 (inbox renders both layouts).

---

## 3. System overview

### 3.1 Architecture
- **One Next.js 16.4.3 app** (App Router, Turbopack, React 19.3, React Compiler, `cacheComponents`, `partialPrefetching`). All server logic is in Route Handlers under `src/app/api` (48 route files; no Server Actions). This diverges from the PRD's tRPC + monorepo (`apps/web`, `apps/worker`) + pg-boss design.
- **Database:** Prisma 6.19 on PostgreSQL 16, 4 migrations. The global `global_server_seq` sequence is created lazily at runtime (`src/lib/server-seq.ts:19`), not by a migration.
- **Client:** offline-first. A per-user Dexie database (`hardmoney_<userId>`, versions v1–v6) holds the ledger. Writes go to an outbox and are pushed to `POST /api/sync/push`; reads arrive from `GET /api/sync/pull?cursor=N`. React Query + axios handle the REST-only flows (loan EMI, FD close, SMS inbox, households, settings).
- **Shell:** fixed `100dvh` body, one inner `ScrollContainer`, mobile bottom nav (5 tabs) + global FAB, desktop collapsible sidebar. `NativeTabContainer` statically imports all five tab pages into the root layout and keeps visited tabs mounted (`hidden` + `inert`). Sub-pages use React `<ViewTransition>` slides.
- **PWA:** hand-written `public/sw.js` (cache `hardmoney-v5`, network-first HTML, ignores `/_next/` and `/api/`), `PwaManager` (registers only in production, primes a `hardmoney-v4` cache, update banner), static `manifest.json`.
- **Background work:** all in the web process. SMS ingest uses `setTimeout(processBankSms)`. `runCronTick()` (budgets, card statements, installments, FD payouts/maturity, reminders) runs only when something POSTs `/api/v1/cron/tick`; nothing in the repo schedules it. Push "sending" appends to an in-memory array; no Web Push library is installed.
- **Deployment:** `docker-compose.yml` with Postgres (published on all interfaces with default credentials) and a `web` service built from a Dockerfile that doesn't exist. No CI, no README.

### 3.2 Data model (22 Prisma models, no Prisma enums)
- **Identity and sharing:** `User` (settings, `sessionVersion`, encrypted Gemini key, webhook `apiKeyHash`), `PushSubscription`, `Household`, `HouseholdMember` (roles OWNER, CO_OWNER, CONTRIBUTOR_ADD_ONLY, VIEWER as free text), `ShoppingListItem`.
- **Ledger:** `Account` (CASH, BANK_SAVINGS incl. USD, CREDIT_CARD; scope PRIVATE or SHARED_HOUSEHOLD), `Category`, `Transaction` (type, flags `excludeFromBalance/Stats/Budget`, `destinationAmountMinor`, `exchangeRateMicros`, reversal and duplicate links), `TransactionSplitItem`, `TransactionTemplate`.
- **Planning:** `Budget`, `BudgetMonthSnapshot`, `CreditCardStatement`, `CreditCardInstallmentPlan`.
- **Investments and debt:** `FixedDeposit`, `FixedDepositPayout`, `Loan` (LOAN or LEASE, reducing or flat), `LoanScheduleEntry`, `LoanPayment`.
- **SMS and sync:** `BankSms` (dedupe key, status, parse method), `AppliedMutation` (idempotency by `mutationId`), `SyncSequence` (fallback counter).
- **Conventions:** money as integer minor units in JS `number`, stored as Postgres `INTEGER` (int4) rather than the PRD's `BIGINT`; rates in basis points; FX in micro-units; balances never stored (derived by `ledger.ts`); soft deletes with `deletedAt`; every row carries `serverSeq`. Enum-like columns are free text, several uniques and indexes are missing, and date-only fields are timestamps (FIN-27, FIN-22).

### 3.3 Auth and request flow
1. **Register / login** (`/api/auth/register`, `/api/auth/login`): zod validation, in-memory rate limits (5/h and 10/15 min per IP and per email), Argon2id with a dummy-hash verify for unknown emails. On success an HS256 JWT (7 days; `userId`, `email`, `name`, `sessionVersion`) is set as `hardmoney_session` (`httpOnly`, `SameSite=Lax`, `secure` only when `NODE_ENV=production`). No sliding refresh.
2. **Middleware** (`src/middleware.ts`, Edge runtime, deprecated name in Next 16) verifies signature and expiry only, not `sessionVersion`. Public paths: `/login`, `/register`, `/offline`, `/api/auth`, `/api/health`, `/api/test`, `/api/v1/cron`, `/api/v1/webhooks`. Pages without a token redirect to `/login?callbackUrl=…`; APIs get 401 JSON.
3. **Route handlers** call `getSessionUser()`, which re-reads `User.sessionVersion` and rejects revoked tokens. Logout increments `sessionVersion`, signing out every device.
4. **Authorization:** `assertCanWriteAccount` (owner, or a non-VIEWER member for shared accounts), `authorizeLoan` / `authorizeFixedDeposit` (owner or any member; write excludes only VIEWER, so CONTRIBUTOR passes, SEC-004), inline per-entity checks in `sync/push` (incomplete, SEC-001…003, SEC-009), and role-filtered `sync/pull` (contributors get only their own transactions and zeroed shared balances).
5. **Machine auth:** SMS webhook via `x-api-key` (SHA-256, unindexed lookup), cron via `CRON_SECRET` (`timingSafeEqual`, 503 when unset), test API via `E2E_MODE=1` + non-production + `x-e2e-secret` for POST (GET needs only `E2E_MODE=1`, SEC-008).
6. **Sync loop:** while the outbox is non-empty the client pushes every second (even offline, PWA-14). A 401 is treated as "idle", so an expired session shows "Synced" (PWA-13, SEC-018).

---

## 4. Top 10 priorities

Ordered by user harm, with UI/UX and accessibility placed first where severity is comparable. Every item is in Phase 1 of the roadmap (§20).

| # | Priority | Finding IDs | Why it matters on a phone |
|---|---|---|---|
| 1 | Close the sync-push authorization holes: load, authorize, then write; never blind-upsert | SEC-001, SEC-002, SEC-003, SEC-009, FIN-02, FIN-03, FIN-19 | Any signed-in user can rewrite or delete other people's money data. Launch blocker regardless of UI. |
| 2 | Rebuild mobile Quick Add: accessible field rows and keypad, live amount, themed tokens, save guard, keep the draft | A11Y-02, PWA-26, PWA-27, UI-70, UI-71, UI-72, UI-73, UI-74, A11Y-26 | It's the FAB flow and the app's most frequent task. Today it is unusable with AT, can double-save, and can lose the entry. |
| 3 | Make rows real buttons and ship one accessible Sheet/Dialog primitive | A11Y-01, A11Y-03, UI-32, UI-65, UI-66, PWA-33, PWA-34, PWA-24 | Editing a transaction, a budget or a calendar day is impossible without a pointer; sheets trap nobody and announce nothing. |
| 4 | Fix the date and visible-bug cluster on the main tabs | UI-24, UI-01, UI-02, UI-43, UI-44, UI-39, UI-29, A11Y-08, A11Y-21, PWA-28, PWA-35, PWA-38 | Every screenshot shows at least one of these. They make the product look broken on first open. |
| 5 | Add confirmations and feedback to destructive and money-moving actions | UI-79, UI-80, UI-19, PWA-12, UI-85, UI-53, UI-58, UI-67, UI-95, UI-94 | One-tap ownership transfer, member removal, logout with unsynced data, silent key regeneration, silent loan failures. |
| 6 | Contrast, focus and target-size pass on the design tokens | A11Y-07, A11Y-11, A11Y-13, A11Y-15, PWA-32, PWA-30, UI-13, UI-14, UI-15, UI-48, UI-16, A11Y-14, PWA-29 | Every dark-theme primary button is 3.67:1; there is no `:focus-visible`; 25 px Delete sits next to Archive; the FAB covers the last row. |
| 7 | Labels, error announcements and the right mobile keyboard | A11Y-04, A11Y-09, A11Y-05, A11Y-06, A11Y-12, PWA-25, UI-68, UI-93 | 90 unlabelled controls, silent validation errors, QWERTY keyboards for money, no state on tabs and switches. |
| 8 | Make reminders honest, then real | PWA-01, PWA-02, PWA-03, UI-83, SEC-007, SEC-016, INF-06, INF-19 | Users are told "Reminders active" and never get one. Hide or fix before launch. |
| 9 | Money correctness: BIGINT, loan edit, due dates, existing loans/FDs, atomic and idempotent money routes | FIN-01, INF-07, FIN-04, FIN-05, FIN-06, FIN-07, FIN-08, FIN-09, SEC-013, FIN-12 | Wrong balances, due dates and duplicate EMI/FD postings. A 9.8 M LKR row already exists in the screenshot. |
| 10 | Offline shell, privacy and deployability | PWA-07, INF-11, PWA-10, PWA-13, SEC-018, SEC-005, INF-03, SEC-006, SEC-008, INF-01, INF-02, INF-13 | Offline cold start can fail, sessions expire silently, raw SMS leaks to logs, and the app cannot be deployed or run its jobs as shipped. |

---

## 5. Mobile PWA UX and accessibility

This is the most important section for this product. It merges `ui-visual-design.md` (95), `accessibility.md` (29) and the mobile-facing half of `pwa-mobile.md` (PWA-19…41). Push, service worker and manifest internals are in §11.

### 5.1 What already works
- Pinch-zoom allowed, `lang="en"` set, mobile inputs forced to 16 px so iOS doesn't auto-zoom.
- Safe-area insets on shell, bottom nav, FAB and most sheets; `100dvh` shell; `viewport-fit=cover` (fixed since the first run).
- Bottom-nav targets about 75×64 px; FAB 52 px with a name; inactive tabs are `inert`.
- `useModalHistory` closes 12 sheets on Android back and iOS edge-swipe; `ConfirmationModal` handles Escape and now guards account delete/archive and installment cancel.
- Login/register use `htmlFor`/`id`, correct `autocomplete`, `autoCapitalize="none"`, `role="alert"` errors.
- Shopping List names its icon buttons with the item ("Delete Suger"), which is the pattern to copy.
- System fonts only, no webfonts; reduced motion honoured for page transitions.

### 5.2 Per-screen review (all 7 screenshots)

| Screenshot | Screen | Issues seen (screenshot plus the code behind it) | Finding IDs |
|---|---|---|---|
| `image.png` | Trans. tab, Daily view, mobile, dark | Month reads "October 2026" regardless of today. Bright white dividers between Income/Expense/Total. "Fri, Oct 23" day total LKR 0.00 and summary Income 0.00 sit above a "+ LKR 9,800,000.00" loan-disbursement row with no "excluded" explanation; the Calendar view counts it. Row title is the raw enum "EXPENSE"/"INCOME" when there is no category; raw bank refs and "added by Viran" in 10 px accent red. SMS chip is ~16 px tall, blue-on-navy (4.12:1), nested inside a clickable `div` row. Rows aren't buttons. Search has only a placeholder. Daily/Calendar/Monthly/Summary tabs expose no selected state. `<h1>` is "Hard Money", not "Transactions". Header icons (colour swap, theme) are 30–34 px and cryptic. Amounts mix monospace and proportional fonts. Three money formats on one screen. Lone "-"/"+" signs may not be spoken. "Synced" pill shows even when the session has expired. Month chevrons ~26 px. | UI-24, UI-01, PWA-28, A11Y-27, UI-29, PWA-38, UI-28, A11Y-29, UI-30, UI-35, A11Y-07, A11Y-15, A11Y-01, UI-32, A11Y-04, A11Y-06, UI-08, A11Y-17, UI-12, UI-06, PWA-37, UI-25, A11Y-22, PWA-13, UI-91, A11Y-12, UI-11, PWA-30, UI-07, A11Y-24, PWA-31, A11Y-18, INF-07 |
| `image2.png` | Stats tab, Expense donut, mobile, dark | Title only: no sync status or theme controls (headers differ per tab). Pill-style segmented control, a different style from Trans. Grey single-slice donut reads as empty; SVG has no `role`/`title`, slices aren't focusable. On-screen hint "Tap a slice or category row" describes a pointer-only action, and tapping "Uncategorized" does nothing. Callout text ~9 px. Same white dividers. FAB present on a screen where adding isn't the main action. | UI-10, PWA-36, UI-91, UI-08, UI-40, A11Y-19, A11Y-01, UI-39, A11Y-24, UI-01, PWA-28, UI-16, UI-24 |
| `image3.png` | Budget tab, mobile, dark | "+ Add Budget" renders as plain text with no button fill (`--primary` undefined; white-on-white in light theme; no focus ring in the form). Budget card heading reads "Wallet Salary" (Lucide icon name printed as text, and spoken). An income category (Salary) is budgeted. Progress track invisible; "ok" uses the income colour. Overview: Total Spent 0.00 in red, Remaining in blue, safe-to-spend shown for any month. Month switcher in a bordered panel, unlike other tabs. Card isn't a button. Progress bar has no `role="progressbar"`. "Rs." vs "LKR". | UI-02, A11Y-08, UI-43, A11Y-21, PWA-35, UI-44, UI-45, UI-46, UI-11, A11Y-01, PWA-34, A11Y-19, A11Y-29, UI-09, UI-10, UI-24, UI-16 |
| `image4.png` | Accounts tab, Cash & Bank, mobile, dark | Three 13 px icons (edit, archive, delete) per row in ~25 px targets 4 px apart, Delete next to Archive, named only by `title` ("Delete", not "Delete Sampath LKR"). Rows show internal SMS sender IDs ("BOCONLINE", "sampathtxn"). Bright white vertical dividers in Assets/Liabilities/Net Worth, values nearly fill their cells. "Show archived" is a bright white native checkbox (no root `color-scheme`) and toggling it changes subtotals and net worth. White solid "+ Add Account" (yet another primary-button style). Selected segment only slightly darker (1.22:1). Header row won't wrap at 320 px. Section titles are spans. | UI-48, A11Y-15, PWA-30, A11Y-05, UI-49, UI-01, UI-50, A11Y-20, UI-54, PWA-20, BF-02, UI-09, A11Y-11, A11Y-06, UI-08, A11Y-18, PWA-37, A11Y-22, UI-10, UI-24 |
| `image5.png` | More / Settings & More, mobile, dark | "Log Out" is the most prominent control at the top, one tap, ignores the unsynced outbox and leaves the ledger on the device. White dividers between every row. "SMS Review Inbox", a daily task, is buried under "Developer & Automation"; descriptions use jargon ("Lucide icons", "ingress"). FAB covers the "Apple Shortcuts Guide" chevron, and an empty placeholder card is cut off at the bottom. Section titles are styled spans (no heading navigation). 11 px descriptions. iOS-only Shortcuts row shown to Android users; no install row, no app version. Tab label "Trans.". | UI-19, PWA-12, SEC-034, INF-29, UI-01, PWA-28, UI-18, PWA-39, UI-16, PWA-29, A11Y-14, A11Y-18, A11Y-24, PWA-31, PWA-17, UI-17, A11Y-29, UI-03 |
| `image6.png` | More → Shopping List, mobile, dark | White "+ Add" on coral accent is 3.67:1 (fails AA). Field outlines barely visible (1.34:1). 20 px checkbox, 18 px back arrow, small pencil; reorder is drag-only with no Move up/down. The transaction FAB is still shown and suggests it adds a shopping item. With no household, Add silently does nothing. Copy polish ("Suger" is user data, but there's no edit affordance hint). Good: icon buttons are named with the item. | A11Y-07, PWA-32, A11Y-11, UI-76, A11Y-15, PWA-30, A11Y-16, UI-16, PWA-29, UI-77, UI-78, UI-21 |
| `image-desktop.png` | Trans. tab with sidebar, desktop, dark | A stretched mobile list (`max-w-4xl`) with a large empty area instead of the PRD's multi-card dashboard. Two add buttons (sidebar "New Transaction" and a floating "Add Transaction" pill). Page title "Hard Money" repeats the logo. Sidebar labels the theme button by target ("Light Mode") while Preferences labels it by current state. Collapse button and collapsed links rely on `title`. No skip link before the 9-control sidebar. The red "H" mark doesn't match the green piggy-bank home-screen icon. Same row, search, tab and divider issues as `image.png`. | UI-22, A11Y-26, A11Y-05, A11Y-23, A11Y-17, PWA-18, A11Y-01, A11Y-04, A11Y-06, A11Y-07, UI-01, UI-24, UI-29 |

### 5.3 Core flows and their blockers

Predicted from markup in `accessibility.md` §4 (SUSPECTED until checked on a device).

| Task | Sighted touch user | VoiceOver / TalkBack user | Keyboard / Switch Control user | Blocking IDs |
|---|---|---|---|---|
| Add an expense (FAB) | Works, but the sheet is always dark, double tap saves twice, "Add New" category loses the draft, picking from the other group flips Expense↔Income | Sheet opens with focus left behind; rows read as plain text; keys read "hyphen", "C"; total never read back; errors silent | Field rows unreachable | A11Y-02, A11Y-03, A11Y-09, PWA-26, PWA-27, UI-70, UI-71, UI-72 |
| Edit or delete a transaction | Works; undo only on Trans. tab, 6 s | Row fragments read separately, not announced as actionable; undo toast silent | Can't open a row | A11Y-01, A11Y-12, UI-37 |
| Split a bill | Split amount field reformats on every keystroke (caret jumps) | Same, plus unlabelled | Same | UI-95, A11Y-04 |
| Switch Daily → Calendar | Calendar "today" marker doesn't render; selection goes stale on month change | No "selected" state; days not reachable | Days not reachable | A11Y-06, A11Y-27, UI-33, A11Y-19 |
| Check a stats category | "Uncategorized" tap does nothing | Donut not exposed; rows not actionable | Not reachable | UI-39, A11Y-19, A11Y-01 |
| Create or edit a budget | Button invisible in light theme; income categories offered | Fields unlabelled; card reads "Wallet Salary" | No focus ring in the form | UI-02, A11Y-08, UI-44, A11Y-04, A11Y-21 |
| Delete an account | 25 px Delete next to Archive (now confirmed by a modal) | Buttons named "Delete" with no account name | Delete can sit under the FAB on the last row | UI-48, A11Y-05, A11Y-14 |
| Pay an EMI / close a loan / FD proceeds | Failures are silent; FD proceeds is one tap with no progress; EMI picker shows opening balance | Same, plus no dialog semantics | Same | UI-58, UI-53, UI-60, UI-61, A11Y-03 |
| Manage household | Transfer ownership, remove member and leave are one tap; feedback banners off-screen | Raw role names spoken | | UI-79, UI-80, UI-81, UI-82, A11Y-29 |
| Turn on reminders | Says "Reminders active"; nothing ever arrives | Switch has an empty name | Switch shows no focus | UI-83, PWA-01, PWA-02, A11Y-06, A11Y-13 |
| Log out | One tap; unsynced changes stay stuck; data stays on device | | | UI-19, PWA-12, SEC-034 |
| Open a More sub-page and go back | Back buttons differ per page | Back arrow is an unnamed link; new page announced as "Hard Money" | Focus not moved to the new page | A11Y-05, A11Y-17, UI-21 |

### 5.4 Visual system and tokens
- **Undefined tokens fail silently.** `--primary`, `--surface-hover` (29–30 uses) and `--muted` are referenced but not defined; `@theme` defines no `--color-accent`, `--color-primary` or `--color-hairline`, so `divide-hairline` (18 uses), `border-accent`, `text-accent`, `bg-accent` and `ring-primary` generate nothing. Results: white dividers (UI-01, PWA-28), the invisible Budget button and missing focus ring (UI-02, A11Y-08), the missing calendar "today" marker and filter dot (A11Y-27, UI-33), no drop-target highlight (A11Y-27), and the unstyled sync pill text (PWA-36). Other leftovers: UI-03.
- **Semantic colours are overloaded.** The income/expense swap also flips success, danger and status colours (Synced, Log Out, Premature Close, balances) (UI-04). Hard-coded Tailwind palette colours bypass tokens and cause most contrast failures (UI-05, A11Y-07).
- **Type scale.** 4× 9 px, 93× 10 px, 189× 11 px against a PRD minimum of 12 px; 130 `font-mono` amounts mixed with proportional text; 16 px inputs next to 12 px UI (UI-06, UI-07, A11Y-24, PWA-31, PWA-37). All sizes are px, so the user's text-size setting is ignored (A11Y-20).
- **Component drift.** Three segmented-control styles (UI-08), four primary-button styles (UI-09), five page-header layouts with sync status on two tabs only (UI-10, PWA-36, UI-91), inconsistent month switcher (UI-11), cryptic header icons (UI-12), differing overlay patterns and button orders (UI-66), mixed native `confirm()` and `ConfirmationModal` (UI-67). The shared `AppHeader` exists but nothing imports it.

**Computed contrast of the core tokens** (from `accessibility.md` §1.3; AA needs 4.5:1 for text, 3:1 for UI components)

| Pair | Dark | Light |
|---|---|---|
| `--text` on `--bg` | 15.86 ✅ | ≈16 ✅ |
| `--text-muted` on `--bg` / `--surface` | 6.95 / 6.31 ✅ | 5.00 / 4.62 ✅ |
| White on `--accent` (every primary button) | **3.67 ❌** | 5.46 ✅ |
| `--warning` text on `--bg` / `--surface` | 9.29 ✅ | **2.68 / 2.48 ❌** |
| `--border` vs `--bg` (input and card outlines) | **1.34 ❌** | **1.25 ❌** |
| Quick Add OK on `#EF4444` | **3.76 ❌** | **3.76 ❌** |
| White on amber `#F59E0B` (Merge, Calibrate) | **2.15 ❌** | **2.15 ❌** |
| SMS chip `blue-500` | **4.12 ❌** | **3.04 ❌** |

### 5.5 Accessibility findings (WCAG 2.2 AA), by severity

| ID | Sev | Status | WCAG | Summary | Duplicates / related |
|---|---|---|---|---|---|
| A11Y-01 | Critical | CONFIRMED | 2.1.1, 4.1.2, 1.3.1 | 29 `div onClick` rows, cells, cards, slices and the sync chip | UI-32, PWA-34 |
| A11Y-02 | Critical | CONFIRMED | 4.1.2, 1.3.1, 2.1.1, 4.1.3, 3.3.1, 3.3.2 | Mobile Quick Add rows, keypad, switch, type selector, errors | PWA-27, UI-74, UI-70 |
| A11Y-03 | High | CONFIRMED | 4.1.2, 1.3.1, 2.4.3, 2.4.11 | 18 overlays without dialog role, focus move, trap or restore | UI-65, PWA-33, PWA-24 |
| A11Y-04 | High | CONFIRMED | 1.3.1, 4.1.2, 3.3.2, 2.5.3 | 90 of 135 controls unlabelled; search placeholder only | UI-68, UI-38 |
| A11Y-05 | High | CONFIRMED | 4.1.2, 2.4.4, 2.4.6, 1.1.1 | Icon-only buttons and back links with no name or `title` only | UI-21, UI-93 |
| A11Y-06 | High | CONFIRMED | 4.1.2, 1.3.1, 1.4.1 | Tabs, segments, switches, disclosures expose no state | UI-08, UI-74, UI-93 |
| A11Y-07 | High | CONFIRMED | 1.4.3 | Text contrast failures on primary buttons, chips, warnings, errors | PWA-32, UI-13, UI-05 |
| A11Y-08 | High | CONFIRMED | 1.4.3, 1.4.11, 2.4.7 | Budget actions have no background; focus ring removed | UI-02 |
| A11Y-09 | High | CONFIRMED | 3.3.1, 3.3.3, 4.1.3 | Validation errors not announced or linked | UI-68 |
| A11Y-10 | High | CONFIRMED | 1.3.4 | Manifest locks the installed app to portrait | PWA-16 |
| A11Y-11 | Medium | CONFIRMED | 1.4.11 | Input outlines, switch tracks, selected segments under 3:1 | |
| A11Y-12 | Medium | CONFIRMED | 4.1.3, 2.2.1 | Silent status changes; undo toast times out in 6 s | UI-37, UI-93 |
| A11Y-13 | Medium | CONFIRMED | 2.4.7 | No `:focus-visible`; several focus indicators removed | UI-14 |
| A11Y-14 | Medium | CONFIRMED (2.4.11 fail SUSPECTED) | 2.4.11, 1.4.10 | FAB and fixed overlays cover the last rows | UI-16, PWA-29 |
| A11Y-15 | Medium | CONFIRMED | 2.5.8 | Targets below 24 px; many below 44 px | UI-15, PWA-30, UI-48, UI-76 |
| A11Y-16 | Medium | CONFIRMED | 2.5.7, 2.1.1 | Shopping List reorder is drag-only | |
| A11Y-17 | Medium | CONFIRMED | 2.4.2, 2.4.6, 2.4.3 | Every route titled "Hard Money"; tab switches not announced | |
| A11Y-18 | Medium | CONFIRMED | 1.3.1, 2.4.6 | Headings are spans; lists aren't lists | |
| A11Y-19 | Medium | CONFIRMED | 1.1.1, 1.3.1, 1.4.1 | Donut, trend bars, budget bars, calendar lack structure | UI-40, UI-41 |
| A11Y-20 | Medium | SUSPECTED | 1.4.10, 1.4.4, 1.4.12 | Clipping at 320 px or 200 % text (body can't scroll horizontally) | UI-50, UI-51 |
| A11Y-21 | Medium | CONFIRMED | 1.3.1, 2.4.6 | Icon names rendered and spoken ("Wallet Salary") | UI-43, PWA-35 |
| A11Y-22 | Medium | SUSPECTED | 1.3.1 | Amount signs may not be spoken | UI-25 |
| A11Y-23 | Low | CONFIRMED | 1.3.1, 2.4.1, 2.4.3 | Auth/offline pages lack `<main>`; positive `tabIndex`; no skip link | UI-88 |
| A11Y-24 | Low | CONFIRMED | (1.4.4, PRD) | 9–11 px text throughout | UI-06, PWA-31 |
| A11Y-25 | Low | CONFIRMED | 2.2.2, 2.3.3 | Reduced motion covers page transitions only; spinner never stops | INF-36, UI-89 |
| A11Y-26 | Low | CONFIRMED | (preference) | Quick Add ignores light theme; no "System" option; forced colours | UI-70, PWA-27 |
| A11Y-27 | Low | CONFIRMED | 1.4.1 | Undefined colours remove today, active-filter, drop-target cues | UI-01, UI-03, PWA-28 |
| A11Y-28 | Low | CONFIRMED | advisory | `select-none` on whole sheets blocks copy and Speak Selection | UI-69 |
| A11Y-29 | Low | CONFIRMED | 2.4.6, 3.1.4 | "Trans.", raw enums, "Rs." vs "LKR" | UI-28, UI-17 |

### 5.6 UI and UX findings by screen area (`ui-visual-design.md`)

Severity in brackets. All CONFIRMED unless marked.

- **Global visual system:** UI-01 hairline dividers white [High]; UI-02 Budget buttons no background [High]; UI-03 other undefined tokens [Medium]; UI-04 colour swap leaks into status colours [High]; UI-05 hard-coded palette [Medium]; UI-06 type scale below PRD, mono/sans mix [Medium]; UI-07 16 px inputs next to 12 px UI [Low]; UI-08 three segmented styles [Medium]; UI-09 no button hierarchy [Medium]; UI-10 page headers differ per tab [Medium]; UI-11 month switcher framing, small targets, no picker [Medium]; UI-12 cryptic header icons [Low]; UI-13 contrast failures [Medium]; UI-14 no visible focus [High]; UI-15 tap targets below 44 px [High].
- **Navigation and IA:** UI-16 FAB on every screen covers content [High]; UI-17 bottom nav abbreviated label, weak active state, no re-tap [Medium]; UI-18 More buries daily tasks under "Developer", placeholder card [Medium]; UI-19 one-tap Log Out ignoring unsynced changes [High]; UI-20 Summary view duplicates Stats with different maths [Low]; UI-21 inconsistent, unlabelled back buttons [Low]; UI-22 desktop is a stretched mobile layout [Medium]; UI-23 no onboarding, dead-end empty states [High].
- **Formatting:** UI-24 every month view opens on October 2026 [Critical]; UI-25 several money formats per screen [Medium]; UI-26 currency preference has no effect [Medium]; UI-27 five date formats, timezone ignored [Medium]; UI-28 raw enums and jargon [Medium]; UI-29 totals contradict visible excluded rows [High].
- **Transactions tab:** UI-30 weak, noisy row hierarchy [Medium]; UI-31 empty state ignores active filters [Medium]; UI-32 clickable `<div>` rows [High]; UI-33 calendar stale selection, broken today marker, unreadable amounts [Medium]; UI-34 monthly view overflow, empty future months [Low]; UI-35 SMS chip and raw-SMS modal [Low]; UI-36 duplicate prompt tiny buttons, no feedback [Medium]; UI-37 undo only on Trans., not announced [Low]; UI-38 weak filter feedback [Low].
- **Stats:** UI-39 "Uncategorized" tap does nothing [High]; UI-40 donut reads as empty, not accessible [Medium]; UI-41 trend chart false bars, truncated labels [Low]; UI-42 drill-down read-only with ISO dates [Low].
- **Budget:** UI-43 icon name printed as text [High]; UI-44 income and system categories budgetable [High]; UI-45 invisible progress track, "ok" uses income colour [Medium]; UI-46 overview colours and safe-to-spend mislead [Medium]; UI-47 centred modal, unconfirmed delete, jargon [Medium].
- **Accounts:** UI-48 Delete next to Archive/Edit as 25 px icons [High]; UI-49 SMS sender IDs shown [Low]; UI-50 three-column money headers tight [Medium, SUSPECTED]; UI-51 loan/FD/card cards don't wrap [High; overflow SUSPECTED]; UI-52 stacked empty messages, tiny entry points [Medium]; UI-53 FD "Deposit proceeds" one tap, no feedback [High]; UI-54 tiny "Show archived" checkbox [Low]; UI-55 account detail lacks structure and actions [Medium]; UI-56 settle modal truncates amounts [Medium].
- **Loans and FDs:** UI-57 loan header puts X between title and "Delete loan" [High]; UI-58 Pay EMI, close, edit, override fail silently [High]; UI-59 "Early Payoff" only closes the loan [Medium]; UI-60 EMI picker shows opening balance [Medium]; UI-61 EMI dialog lacks breakdown and mobile input [Medium]; UI-62 cramped, unvalidated inline loan edit [Medium]; UI-63 FD premature-close dialog gaps [Medium]; UI-64 schedule uses cashflow colours and raw values [Low]; UI-94 loan/FD forms pre-filled with sample money [Medium].
- **Modals and forms:** UI-65 no dialog semantics, focus or Escape [High]; UI-66 overlay patterns and button order differ [Medium]; UI-67 mixed confirmations, ConfirmationModal hides failures [Medium]; UI-68 wrong keyboard, unlinked labels [Medium]; UI-69 `select-none` blocks copying [Low]; UI-95 split amounts reformat every keystroke [High].
- **Quick add:** UI-70 ignores light theme and colour swap [High]; UI-71 "Add New" category discards the draft [High]; UI-72 category from other group flips type silently [Medium]; UI-73 no save feedback, "Continue" or Split [Medium]; UI-74 fields and toggles not accessible [Medium]; UI-75 back label always "Trans.", no remembered account [Low]. Also BF-04 (quick-add initial type not reset on close) [Low].
- **Shopping list:** UI-76 controls too small [Medium]; UI-77 silent no-op without a household [Medium]; UI-78 polish [Low].
- **Household:** UI-79 one-tap ownership transfer [Critical]; UI-80 remove member and leave unconfirmed [High]; UI-81 feedback off-screen [Medium]; UI-82 raw roles, single household, unclear invite [Medium].
- **Preferences, Developer, Categories, Inbox:** UI-83 "Reminders active" with a fake subscription [Critical]; UI-84 silent failures, ambiguous controls [Medium]; UI-85 "Regenerate Key" silently breaks SMS ingest [High]; UI-86 instant category/bookmark deletes, icon field asks for a code name [Medium]; UI-87 inbox mobile cards dense, raw values, distant errors [Medium].
- **Auth:** UI-88 login/registration basics missing [Medium].
- **PWA states:** UI-89 update banner on top of the FAB, spinning icon [Medium]; UI-90 no install prompt, splash/status bar ignore theme [Low; look SUSPECTED]; UI-91 sync status hard to find and not operable [Medium]; UI-92 thin loading and error states [Medium; empty flash SUSPECTED]; UI-93 screen readers miss state changes, icon buttons, charts [Medium].

### 5.7 Mobile-shell and mobile-form findings (`pwa-mobile.md` §D–G)

| ID | Sev | Status | Summary |
|---|---|---|---|
| PWA-19 | Medium | CONFIRMED | Status bar and `theme-color` follow the OS theme, not the in-app theme; no iOS startup images |
| PWA-20 | Medium | CONFIRMED | No root `color-scheme`: native checkbox, date/time pickers and scrollbars render light in dark mode (`image4.png`) |
| PWA-21 | Medium | SUSPECTED | `interactive-widget=resizes-content` lifts bottom nav and FAB above the Android keyboard; iOS keyboard covers sheet Save buttons |
| PWA-22 | Medium | SUSPECTED | No `touch-action: manipulation`: fast keypad taps can double-tap-zoom on iOS; grey tap flash on Android |
| PWA-23 | Medium | CONFIRMED | Each tab switch pushes history, so Android back walks back through tabs |
| PWA-24 | Low | CONFIRMED | 4 overlays lack `useModalHistory`; 7 lack bottom safe-area padding; one `85vh` sheet remains |
| PWA-25 | High | CONFIRMED | 14 money inputs open a full QWERTY keyboard; numeric fields use `type="number"`; no `enterKeyHint` |
| PWA-26 | High | CONFIRMED | No in-flight guard on Quick Add Save: double tap creates two transactions |
| PWA-27 | Medium | CONFIRMED | Quick Add hard-coded dark, ignores colour swap, X doesn't close, AT gaps |
| PWA-28 | Medium | CONFIRMED | `divide-hairline` isn't a utility: white divider lines |
| PWA-29 | Medium | CONFIRMED | FAB on every page covers the last row (`image5.png`), misleading on Shopping List (`image6.png`) |
| PWA-30 | Medium | CONFIRMED | Many targets under 44 px / 48 dp |
| PWA-31 | Medium | CONFIRMED | Text too small for phone reading |
| PWA-32 | Medium | CONFIRMED | Dark-theme accent buttons 3.67:1 |
| PWA-33 | Medium | CONFIRMED | Sheets lack dialog semantics and focus management (19 roots) |
| PWA-34 | Medium | CONFIRMED | Primary rows are `div onClick` |
| PWA-35 | Low | CONFIRMED | Budget card prints the icon name |
| PWA-36 | Low | CONFIRMED | Inconsistent tab headers; sync status missing on three tabs; `--muted` undefined |
| PWA-37 | Low | CONFIRMED | Amounts mix monospace and proportional fonts |
| PWA-38 | Low | CONFIRMED | Excluded-from-stats rows unexplained |
| PWA-39 | Low | CONFIRMED | More tab clean-up: placeholder card, fallback email, iOS-only row on Android |
| PWA-40 | High | CONFIRMED | ~317 KB gzip JS on every route (root layout bundles all tabs) — see §13 |
| PWA-41 | Medium | CONFIRMED | Live queries load whole tables on every change — see §13 |

### 5.8 Recommended UI/UX and accessibility fix order
1. **Primitives first** (unblocks ~40 findings): `Dialog/Sheet` on native `<dialog>` with `aria-labelledby`, initial focus, restore, inert background, safe-area padding and `useModalHistory` (A11Y-03, UI-65, UI-66, PWA-33, PWA-24); `Field` with `useId` wiring for label, hint, `aria-invalid`, `aria-describedby` (A11Y-04, A11Y-09, UI-68); `IconButton` with a required label (A11Y-05); `Switch`, `Tabs`, `SegmentedControl` with ARIA state (A11Y-06, UI-08); one live announcer (A11Y-12, UI-93); `AppHeader` with sync status (UI-10, PWA-36, UI-91). Add the `jsx-a11y` rules `no-static-element-interactions`, `click-events-have-key-events`, `label-has-associated-control`, `control-has-associated-label`.
2. **Same-day visible bugs:** UI-24, UI-01/PWA-28 (`--color-hairline`), UI-02/A11Y-08, UI-43/A11Y-21, UI-44, UI-39, UI-29/PWA-38, A11Y-27, PWA-20.
3. **Core flows:** Quick Add rebuild (A11Y-02, PWA-26, PWA-27, UI-70…75) and row buttons (A11Y-01, UI-32, PWA-34); split input (UI-95); amount keyboards (PWA-25).
4. **Destructive actions and feedback:** UI-79, UI-80, UI-19/PWA-12, UI-85, UI-53, UI-58, UI-67, UI-47, UI-86.
5. **Tokens and ergonomics:** contrast (A11Y-07, A11Y-11, PWA-32), global `:focus-visible` (A11Y-13, UI-14), 44 px targets and moving Delete into an overflow menu (A11Y-15, UI-15, UI-48, PWA-30), FAB scope and padding (UI-16, PWA-29, A11Y-14), type scale in rem (UI-06, A11Y-24, PWA-31), `touch-action` (PWA-22), tab history (PWA-23), orientation (A11Y-10).
6. **Structure and polish:** titles and focus on navigation (A11Y-17), headings and lists (A11Y-18), chart alternatives (A11Y-19, UI-40), signs (A11Y-22), reflow (A11Y-20), theme options (A11Y-26), onboarding (UI-23), desktop dashboard (UI-22).
7. **Verification:** extend the axe test in `tests/e2e/s01-app-shell.spec.ts` to every route and open dialog, both themes, 320 px; then a scripted manual pass with VoiceOver, TalkBack, keyboard, Switch Control, 200 % text and landscape.

---

## 6. Authentication and sessions

**Works:** zod-validated register/login; Argon2id with a dummy-hash verify for unknown emails; `AUTH_SECRET` fails closed in production; 7-day JWT with `sessionVersion` re-checked by every handler; logout revokes; `ALLOW_REGISTRATION` flag.

| ID | Sev | Status | Finding |
|---|---|---|---|
| SEC-018 | Medium | CONFIRMED | Session lifecycle doesn't fit an offline-first PWA: hard 7-day expiry, no sliding refresh, 401 swallowed as "idle", logout signs out every device |
| PWA-13 | Medium | CONFIRMED | Same from the device angle: expired session shows "Synced"; weekly forced re-login |
| SEC-010 | Medium | CONFIRMED (node) | Open redirect after login: `/%09/evil.com` and `/%0a/evil.com` pass the middleware regex; `login/page.tsx` pushes `callbackUrl` unvalidated |
| SEC-015 | Medium | CONFIRMED | In-memory rate limiter: spoofable via `X-Forwarded-For` (proxy behaviour SUSPECTED), per instance, unbounded, lets anyone lock a victim out. Password minimum still 6; no maximum on login |
| SEC-023 | Medium | CONFIRMED | Email enumeration via `/api/users/search`, member add and the register 409 (returns owner name and ID) |
| SEC-028 | Low | CONFIRMED | `middleware.ts` deprecated in Next 16; Edge gate doesn't check `sessionVersion` |
| SEC-029 | Low | SUSPECTED | CSRF relies on `SameSite=Lax` alone; JSON parsed regardless of Content-Type |
| SEC-034 | Low (Medium on shared devices) | CONFIRMED | Logout leaves the Dexie ledger and SW caches on the device |
| INF-18 | Medium | CONFIRMED | `pnpm build` needs `AUTH_SECRET` at build time (side effect of the fail-closed fix) |
| INF-27 | Medium | SUSPECTED | `secure` cookie keyed on `NODE_ENV`: plain-HTTP LAN self-hosting breaks login silently |
| INF-29 | Medium | CONFIRMED | Logout ignores the outbox and leaves data and caches |
| UI-19, PWA-12 | High / Medium | CONFIRMED | One-tap prominent Log Out with no unsynced-changes warning |
| UI-88 | Medium | CONFIRMED | Login/registration basics missing (show password, strength hints, forgot-password copy, onboarding) |
| A11Y-23 | Low | CONFIRMED | Login uses positive `tabIndex`, no `<main>` |
| INF-31 | Low | CONFIRMED | `middleware` convention deprecated (build warning) |

**Recommendation:** sliding session (re-issue below half lifetime), a distinct `auth-expired` sync state with a "Sign in to sync, N changes pending" banner that keeps the outbox, per-device logout by default, validate `callbackUrl` with `new URL(x, origin).origin === origin`, move to `proxy.ts`, and a logout sheet offering "Keep data / Remove data from this device".

---

## 7. Authorization and multi-tenancy

The role matrix (PRD §3.A) is OWNER and CO_OWNER (full), CONTRIBUTOR_ADD_ONLY (add to shared accounts, see own transactions, no balances, no FDs/loans/budgets) and VIEWER (read-only).

| ID | Sev | Status | Finding |
|---|---|---|---|
| SEC-001 = FIN-02 | Critical | CONFIRMED | Sync push `loanScheduleEntry` and `loanPayment` mutations have no authorization (`sync/push/route.ts:1241-1310`) |
| SEC-002 = FIN-03 | Critical | CONFIRMED | Sync push CREATE is an upsert by client-supplied ID; the `update` branch overwrites any user's account, transaction, template, installment plan, FD, loan or shopping item (and resets account `currency` to LKR) |
| SEC-003 | High | CONFIRMED | Sync push lets non-members edit and delete household transactions |
| SEC-004 | High | CONFIRMED | `authorizeLoan` / `authorizeFixedDeposit` let CONTRIBUTOR_ADD_ONLY read and write shared loans and FDs through REST (regression from the earlier F-012 fix) |
| SEC-009 | Medium | CONFIRMED | Household and attribution injection via `payload.householdId` and `createdByUserId` in sync push |
| SEC-024 | Medium | CONFIRMED | Membership edge cases: CO_OWNER can delete a CO_OWNER; removed creators can still edit shared rows; transfer-ownership edge cases |
| SEC-032 | Low | CONFIRMED | Inconsistent household access across REST: `GET /api/loans` owner-only; FD PATCH owner-only |
| FIN-19 | Medium | CONFIRMED | Loan/FD terms and status editable through generic sync UPDATE; FD edit form forces `status: ACTIVE` |
| FIN-37 | Low | CONFIRMED | Household loans missing from `GET /api/loans` |
| BF-01 | Low | CONFIRMED in code; impact SUSPECTED | **Backfilled.** The earlier run's contributor-masking finding (frontend SEC-03) wasn't re-checked by any v2 report. Re-checked: `AccountCard` masks per-card balances for contributors (`accounts/page.tsx:1309-1374`), but the Cash/Bank/Credit subtotals (`:431`, `:459`, `:499`) and the Assets/Liabilities/Net Worth header (`use-account-portfolio.ts:199-225`) sum every visible account with no role check, and `accounts/[id]/page.tsx` has no role checks at all. Server-side pull sanitization (own transactions only, zeroed shared balances) limits what the client can actually compute, so the exposure is probably small. Fix: exclude contributor-scoped accounts from totals and gate the detail page. |

**Fix pattern for the sync push holes:** for every entity and op, load the existing row by ID first, authorize against the *stored* owner/household, reject CREATE when the ID already exists for someone else, derive `householdId` and `createdByUserId` on the server, and run the mutation plus `AppliedMutation` inside one `$transaction`. Then tighten `authorizeLoan`/`authorizeFixedDeposit` to exclude CONTRIBUTOR_ADD_ONLY, and add unit tests for `authorization.ts` and the push rules (SEC-035, INF-17).

---

## 8. API layer per route group

Full route inventory: `backend-security.md` §1.6.

| Route group | Routes | AuthN / AuthZ | Main findings |
|---|---|---|---|
| Auth | `/api/auth/{login,register,logout,session}` | public / self | SEC-010, SEC-013 (non-atomic register), SEC-015, SEC-018, SEC-023, SEC-029 |
| Health and test | `/api/health`, `/api/test/[...slug]` | public | SEC-033 / INF-21 (checks nothing, exposes test clock); **SEC-008** (GET dumps every user's data whenever `E2E_MODE=1`); INF-30, INF-37 |
| Cron | `/api/v1/cron/tick` | `CRON_SECRET` | SEC-027, INF-32 (multibyte secret → 500), INF-02 (never scheduled), INF-10, FIN-12, FIN-26, FIN-40, PWA-03 |
| SMS webhook | `/api/v1/webhooks/sms-ingress` | `x-api-key` | **SEC-005 / INF-03** (raw SMS and emails logged), SEC-026 (post-auth per-process limit, unindexed key hash, dedupe race returns 500, empty sender wildcard), INF-09 (no retry), INF-26 |
| SMS inbox and activity | `/api/sms/inbox/**`, `/api/sms/activity` | session, `userId` | FIN-25 (post and merge-transfer repeatable on a processed SMS), SEC-012 (free-text `type`), SEC-013, SEC-020 (unbounded lists), FIN-31 (`parseFloat × 100`) |
| Sync | `/api/sync/push`, `/api/sync/pull` | session; inline, incomplete | **SEC-001, SEC-002, SEC-003**, SEC-009, SEC-019 / FIN-15 / INF-08 (cursor can skip rows), SEC-020 / INF-28 (unbounded, crash-prone parsing), SEC-021 (Prisma errors to clients), SEC-031 / FIN-38 (global idempotency keys, fixture code), FIN-16, FIN-24 |
| Loans | `/api/loans`, `/[id]`, `/[id]/close`, `/[id]/pay-emi`, `/[id]/schedule/[entryId]` | session; `authorizeLoan` | SEC-004, SEC-011 (unbounded `tenureMonths`), SEC-012, SEC-013 / FIN-08, FIN-04, FIN-10, FIN-13, FIN-14, FIN-17, FIN-20, FIN-28, FIN-29, FIN-37 |
| Fixed deposits | `/api/fixed-deposits/[id]`, `/close`, `/deposit-proceeds` | session; owner-only PATCH, `authorizeFixedDeposit` | SEC-004, SEC-012, SEC-013 / FIN-09, FIN-17, FIN-19, FIN-21, FIN-34, FIN-36, SEC-032 |
| Transactions | `/api/transactions`, `/[id]`, `/[id]/merge`, `/dismiss-duplicate`, `/raw-sms` | session | FIN-18 (BigInt serialization 500 *after* the write commits), SEC-012, SEC-024, FIN-39 (self-transfers) |
| Households | `/api/households/**`, `/api/users/search` | session; role checks | SEC-023, SEC-024; UI-79, UI-80 on the client |
| Push | `/api/push/{subscribe,unsubscribe,settings,vapid-public-key}` | session | SEC-007, SEC-016 / INF-19 / PWA-05, SEC-025 (rebind across users, unvalidated endpoint), SEC-030 (`99:99` accepted), PWA-04 (unsubscribe deletes every device) |
| User settings | `/api/user/{settings,gemini-settings,webhook-key,accounts,categories}` | session, self | SEC-017 / INF-04 (rotation), SEC-030, UI-85 |
| Shopping list | `/api/shopping-list/count` | session, membership | none server-side; SEC-002 covers sync |

Cross-cutting: no request body schema on sync push; 10 MB default body buffer is the only size limit; `(prisma as any)` hides type errors (FIN-35); raw error strings reach users (SEC-021).

---

## 9. Data model

| ID | Sev | Status | Finding |
|---|---|---|---|
| FIN-01 = INF-07 | Critical / High | CONFIRMED | 33 `*Minor` columns are `Int` (int4); overflow above LKR 21,474,836.47. The init migration bakes it in. PRD §2.1 requires BIGINT. |
| FIN-27 | Medium | CONFIRMED | Free-text enums, missing uniques, no tombstones on payouts/payments, risky cascades (`TransactionSplitItem.category onDelete: Cascade`), missing indexes |
| FIN-15 = SEC-019 = INF-08 | High / Medium / High | CONFIRMED (design) | `global_server_seq` not in migrations, created at runtime, silent fallback to `SyncSequence`, allocated before commit |
| FIN-22 | Medium | CONFIRMED | Date-only fields stored as timestamps; `User.timezone` unused; `Asia/Colombo` hard-coded in 14 places |
| FIN-23 | Medium | CONFIRMED | Loans and FDs have no currency; card statements and the SMS hint use source amounts |
| FIN-33 | Low | CONFIRMED | Deterministic IDs aren't the PRD's UUIDv5 scheme; `uuid.ts` helpers unused |
| FIN-30 | Low | CONFIRMED | Balance-mismatch hint never synced, checked per user not per account |
| INF-25 | Medium | CONFIRMED | Migration history squashed after the fact (`8486714`); no `db:migrate` / `db:seed` scripts |
| INF-26 | Medium | CONFIRMED | `apiKeyHash` lookup unindexed |
| PWA-11 | Medium | CONFIRMED | Client side: no `navigator.storage.persist()`, so the unsynced outbox can be evicted |

Migration note: moving to BIGINT changes Prisma's JS type to `bigint`. FIN-18 shows the transport already breaks on BigInt, so plan a serialization layer (or superjson, as the PRD intended) before the column change.

---

## 10. Financial correctness

**Works:** integer minor units, basis points, `addMonthsClamped`, ledger-derived balances, golden-vector tests, strict `parseMoneyToMinor`, pay-EMI amount and status checks, FD deterministic IDs, maturity check on deposit-proceeds. Ten earlier DF findings are fixed (§19).

| ID | Sev | Status | Finding |
|---|---|---|---|
| FIN-01 | Critical | CONFIRMED | int4 money columns |
| FIN-02 | Critical | CONFIRMED | Sync schedule/payment mutations unauthorized (= SEC-001) |
| FIN-03 | Critical | CONFIRMED | Blind CREATE upsert (= SEC-002) |
| FIN-04 | High | CONFIRMED | Editing a loan re-opens EMIs paid through pay-emi (status derived from `paidInstallments` by index) |
| FIN-05 | High | CONFIRMED (probe) | Loan due dates one day late in Sri Lanka (local-midnight start + UTC month maths); FD month-end maturities shift |
| FIN-06 | High | CONFIRMED | Existing loans: "already paid" installments never applied on the UI create path; client and server disagree on remaining principal |
| FIN-07 | High | CONFIRMED | Existing FDs: cron ignores `paidPeriods` and back-posts every elapsed monthly payout as new income |
| FIN-08 | High | CONFIRMED (race SUSPECTED) | pay-emi reads outside the transaction, no idempotency key: double tap or two devices pay twice |
| FIN-09 | High | CONFIRMED | FD close/proceeds not atomic; partial failure locks the FD (P2002); close + proceeds can double-credit |
| FIN-10 | High | CONFIRMED | Schedule override can re-open PAID rows, leaves stale rows, unvalidated input |
| FIN-11 | High | CONFIRMED | Deleting/editing EMI or system txs, or deleting a loan/FD, leaves orphaned money effects |
| FIN-12 | High | CONFIRMED | Cron poison pill: non-atomic FD payout + deterministic tx ID + no isolation or lock |
| FIN-13 | High | CONFIRMED | Loan "early payoff" moves no money; the liability disappears (UI-59) |
| FIN-14 | High | CONFIRMED | Lease residual has no payment path; leases never close; pay-emi books arbitrary principal |
| FIN-15 | High | CONFIRMED | serverSeq allocated before commit; pull can skip rows |
| FIN-16 | Medium | CONFIRMED | Sync push accepts unvalidated amounts, splits, types, transfers |
| FIN-17 | Medium | CONFIRMED (probe) | REST gaps: NaN schedule from undefined rate, negative rows when residual > principal, WHT > 100 % gives negative payout |
| FIN-18 | Medium | CONFIRMED | `/api/transactions` POST/PATCH return BigInt and 500 after commit |
| FIN-19 | Medium | CONFIRMED | Terms/status editable via sync UPDATE; FD edit forces ACTIVE |
| FIN-20 | Medium | CONFIRMED (probe) | Flat-rate re-amortization on reduced balance; silent 240-row cap; stale EMI/tenure |
| FIN-21 | Medium | CONFIRMED | FD auto-renew/compound: capitalized interest unrecorded, final payout lost, no-account payouts skipped |
| FIN-22 | Medium | CONFIRMED | Timezone hard-coded; server-local cycle start |
| FIN-23 | Medium | CONFIRMED | Cross-currency gaps (net worth sums USD and LKR into one total too) |
| FIN-24 | Medium | CONFIRMED | Multi-write operations without a transaction (push, SMS ingestion, merges) |
| FIN-25 | Medium | CONFIRMED | SMS post/merge-transfer repeatable (double posting) |
| FIN-26 | Medium | CONFIRMED | Cron budget job O(budgets × all txs), rewrites closed months, drops net refunds |
| FIN-27 | Medium | CONFIRMED | Schema integrity (§9) |
| FIN-28 | Medium | SUSPECTED | Long interactive transactions can hit Prisma's 5 s timeout |
| FIN-29 | Medium | CONFIRMED | EMI tx counts principal as expense, date always "now", no category |
| FIN-30…FIN-40 | Low | see bug table | Mismatch hint, float rounding, flat EMI helper, UUIDv5, Investment Yield lookup, `as any`, invisible penalty/WHT, loan read models, fixture code, self-transfers, installment numbering |
| BF-02 | Medium | CONFIRMED | **Backfilled.** "Show archived" changes financial totals: `visibleAccounts` (`use-account-portfolio.ts:127-130`) feeds the Cash/Bank/Credit subtotals and the net-worth loop (`:204`), so archiving an account with a balance removes it from net worth. Earlier frontend CALC-03, not re-checked by any v2 report. |
| BF-03 | Medium | CONFIRMED | **Backfilled.** Refunds are clamped per row with `Math.max(0, exp - refund)` inside the loop (`app/page.tsx:183-185`, `stats/page.tsx:60-107`, `summary-view.tsx:30-47`), so monthly expense totals depend on Dexie row order. Daily and Calendar show REFUND as income (`daily-view.tsx:137`, `calendar-view.tsx:226`) while totals subtract it from expense. Earlier frontend CALC-01/02, not re-checked by any v2 report. |

UI-side money-display defects: UI-20 (Summary vs Stats maths), UI-29 (excluded rows), UI-46 (safe-to-spend for other months), UI-60 (EMI picker shows opening balance), UI-94 (sample values pre-filled), UI-95 (split input).

---

## 11. PWA, service worker and push

| ID | Sev | Status | Finding | Duplicates |
|---|---|---|---|---|
| PWA-01 | Critical | CONFIRMED | Push faked end to end: client posts `fcm…/test-<random>` with mock keys, never calls `pushManager.subscribe`; server has no `web-push`, never reads `VAPID_PRIVATE_KEY` | UI-83, SEC-007, INF-06 |
| PWA-02 | High | CONFIRMED | "Reminders active" shown when Push is unsupported, not installed (iOS Safari tab) or denied; toggle state from the server, not `Notification.permission` | UI-83 |
| PWA-03 | High | CONFIRMED (latent) | Reminders re-enqueued on every cron tick after the configured time | earlier DF-44, SEC-027 |
| PWA-04 | Medium | CONFIRMED | Unsubscribe on one phone deletes every device's subscription; settings per user | |
| PWA-05 | Low | CONFIRMED | VAPID key frozen at build time, falls back to a sample key | SEC-016 (key is 64 bytes, invalid), INF-19 |
| PWA-06 | Low | CONFIRMED | Default URL `/transactions` doesn't exist; `includes("/")` matches any window; full-colour badge; no `tag`; no `pushsubscriptionchange` | INF-34, SEC-025 (unvalidated URL) |
| PWA-07 | High | SUSPECTED | Offline cold start depends on the HTTP cache: SW returns early for `/_next/` | INF-11 |
| PWA-08 | Medium | CONFIRMED | Priming cache `hardmoney-v4` vs SW `hardmoney-v5`; never read; grows ~1.4 MB per deploy | INF-11 |
| PWA-09 | Medium | SUSPECTED | RSC requests hit the cache-first branch with `ignoreSearch`; unbounded entries | |
| PWA-10 | Medium | CONFIRMED | Install-time `skipWaiting()` makes the Reload button a no-op; banner covers the FAB; no `reg.update()` on resume | UI-89, A11Y-25, INF-11 |
| PWA-11 | Medium | CONFIRMED | No persistent storage request | |
| PWA-12 | Medium | CONFIRMED | Logout leaves ledger and caches | UI-19, SEC-034, INF-29 |
| PWA-14 | Low | CONFIRMED | 1 s sync poll even offline; no single-flight | |
| PWA-15 | Low | CONFIRMED | Offline page is a dead end | |
| PWA-16 | Medium | CONFIRMED | Manifest lacks `id`, `scope`, `screenshots`, `shortcuts`, `lang`; portrait lock; dark-only colours | A11Y-10, UI-90 |
| PWA-17 | Medium | CONFIRMED | `beforeinstallprompt` captured, never used; iOS hint hidden in Preferences | UI-90 |
| PWA-18 | Low | CONFIRMED | 242/232 KB icons, brand mismatch (piggy bank vs red "H"), create-next-app leftovers | INF-33 |
| PWA-42 | Medium | CONFIRMED | No automated PWA tests (SW blocked, `next dev`) | INF-16 |
| INF-22 | Medium | CONFIRMED | `sw.js` served without no-cache headers | SEC-014 |

**Fix outline:** adopt Serwist (as the Next PWA guide suggests) or serve `/_next/static/**` cache-first with a build-ID cache name; bypass `RSC`/`_rsc`; drop install-time `skipWaiting` and post `SKIP_WAITING` to `reg.waiting`; real `pushManager.subscribe` with a runtime VAPID key and `web-push` on the server, once-per-day dedupe, per-device enablement, 404/410 cleanup; honest capability checks and an "Install app" row.

---

## 12. Security

Beyond §6–§8:

| ID | Sev | Status | Finding |
|---|---|---|---|
| SEC-005 = INF-03 | High | CONFIRMED | Full raw bank SMS bodies, API-key prefixes and user emails logged in production (commit `da48e4f`); redacted only in E2E, which hides it from the log-secrecy test |
| SEC-006 = INF-05 | High | CONFIRMED | Gemini provider keeps every raw, unmasked SMS in process memory; key in URL; no response schema or timeout; `.env.example` disables real Gemini |
| SEC-007 | High | CONFIRMED | Web push mocked in production |
| SEC-008 | High | CONFIRMED | `GET /api/test/*` unauthenticated whenever `E2E_MODE=1`, dumps all users' data |
| SEC-011 | Medium | CONFIRMED | Unbounded `tenureMonths`: one request creates millions of rows |
| SEC-012 | Medium | CONFIRMED | REST money routes accept unvalidated types (500s, negative and float amounts, free-text enums) |
| SEC-013 | Medium | CONFIRMED | Double-submit and races on pay-EMI, FD close/proceeds, SMS post, register |
| SEC-014 = INF-22 | Medium | CONFIRMED | No CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy |
| SEC-016 | Medium | CONFIRMED | VAPID key static and invalid |
| SEC-017 = INF-04 | Medium / High | CONFIRMED (node) | Key rotation broken: ciphertext has no key ID |
| SEC-020 | Medium | CONFIRMED | Unbounded push/pull/SMS lists; bad cursor → 500 |
| SEC-021 | Medium | CONFIRMED | Internal errors and full financial payloads leak to clients and logs |
| SEC-022 = INF-13 | Medium / High | CONFIRMED | Postgres on all interfaces with default credentials |
| SEC-025 | Medium | CONFIRMED | Push subscriptions rebindable across users; endpoint not validated (SSRF once delivery exists) |
| SEC-026, SEC-027, SEC-030, SEC-031, SEC-033 | Low | CONFIRMED | Webhook hardening, cron edge cases, settings validation, idempotency/fixtures, health endpoint |
| SEC-035 | Low | CONFIRMED | Lint red; nothing tests the authorization layer |
| UI-85 | High | CONFIRMED | "Regenerate Key" silently breaks SMS ingest (no confirmation, no warning that the Shortcut must be updated) |

---

## 13. Performance

| ID | Sev | Status | Finding |
|---|---|---|---|
| PWA-40 | High | CONFIRMED | ~1.08 MB raw / ~317 KB gzip JS on every route, `/login` and `/offline` included, because `NativeTabContainer` statically imports all five tabs (including the 1,642-line `accounts/page.tsx`) into the root layout, and `QuickAddModal` and `SyncProvider` mount on `/login`. Fix: lazy tabs, lazy Quick Add, an auth route group with its own layout, and a CI bundle budget. |
| PWA-41 | Medium | CONFIRMED | Live queries `filter().toArray()` whole tables on every change for every mounted tab; no indexed ranges, no list virtualisation |
| PWA-14 | Low | CONFIRMED | 1 s sync polling even offline |
| SEC-020 / INF-28 | Medium | CONFIRMED (impact SUSPECTED) | Initial pull returns every row from 14 parallel `findMany` with no `take` |
| FIN-26 | Medium | CONFIRMED | Cron budget job O(budgets × all transactions) |
| FIN-28 | Medium | SUSPECTED | One round trip per schedule row inside interactive transactions |
| INF-10 | High | CONFIRMED (crash loop SUSPECTED) | Cron runner correctness and scale |
| PWA-08, PWA-09 | Medium | CONFIRMED / SUSPECTED | Unbounded SW caches |
| PWA-18 | Low | CONFIRMED | 474 KB of icons precached on install |

---

## 14. Code quality

- **Lint red:** 142 errors, 15 warnings (INF-20, SEC-035, FIN-35). 139 `no-explicit-any`, mostly `(prisma as any)` in `sync/push`, `loans/*`, `fixed-deposits/*`, `cron-runner`, `sms/worker`, `sms/ingestion`; these hide real type errors from `tsc`. 2 React Compiler bail-outs (`set-state-in-effect`).
- **Very large files:** `accounts/page.tsx` 1,642 lines, `mobile-quick-add.tsx` 1,132 lines, `sync/push/route.ts` ~1,335 lines with per-entity inline authorization.
- **Hand-rolled primitives:** 18–19 overlays, many toggles, tabs and buttons duplicated per file instead of a shared component layer (UI-08, UI-09, UI-66; PRD wanted Radix/shadcn).
- **Dead code:** unused `AppHeader`, a second dead Dexie module, `animate-in` classes that generate no CSS, unused `/api/users/search` from the client, unused `uuid.ts` helpers, create-next-app assets (INF-33, FIN-33, PWA-18).
- **Fixture code in production paths:** "Apex Visa Platinum" card and placeholder categories in sync push (FIN-38, SEC-031).
- **Duplicated logic:** ledger effect computed in three places (client portfolio hook, cron, SMS ingestion); refund handling differs between views (BF-03, UI-20).
- **Dependency hygiene:** no `engines`, stray `workerd` and `.antigravity` (INF-35).
- **Undefined CSS tokens** referenced across the UI (UI-03, A11Y-27).
- **Not externalized for i18n** (PRD §6).
- **Accessibility lint:** `jsx-a11y` rules that would catch A11Y-01/04/05 aren't enabled.

---

## 15. Testing

| Layer | Today | Gaps |
|---|---|---|
| Unit (Vitest) | 62 tests in 8 files: calculator, confirmation-modal, credit-card, encryption, finance-core golden vectors, mask-numbers, SMS template parser, transfer reconciliation. No coverage provider. | Nothing tests `cron-runner`, `sync/push`, `sync/pull`, `sms/worker`, `auth`, `authorization`, `rate-limit` or Dexie migrations (INF-17, SEC-035). No property tests (PRD §6). |
| E2E (Playwright) | 21 spec files, 247 IDs of 261 planned; projects `web`, `mobile` (Pixel 7), `mobile-safari` (3 `@smoke` tests) | Runs on `next dev` with service workers blocked (INF-16, PWA-42); S20-01/02/04 offline and update tests missing; `fullyParallel` while every test truncates the shared DB (INF-30, flakiness SUSPECTED); webhook tests send the session cookie (INF-37); 0 `toHaveScreenshot`; axe on `/` only, no dialogs (A11Y §1.5). Not executed in this audit. |
| CI | None (INF-15) | PLAN's Definition of Done can't be demonstrated for any step |

---

## 16. Infra and deployment

| ID | Sev | Status | Finding |
|---|---|---|---|
| INF-01 | Critical | CONFIRMED | `docker compose up` can't work: no Dockerfile or `.dockerignore`, no `output: "standalone"`, no worker, no migrate step, partial env |
| INF-02 | Critical | CONFIRMED | No scheduler: installments, statements, FD payouts, budget month-close and reminders never run unless someone POSTs the tick |
| INF-09 | High | CONFIRMED | SMS processing not durable: `setTimeout` in-process, `PENDING`/`PROCESSING` rows never retried |
| INF-10 | High | CONFIRMED | Cron correctness and scale; FD payout written without a transaction (crash loop SUSPECTED) |
| INF-12 | High | CONFIRMED (import failure SUSPECTED) | The shipped Apple Shortcut is an unsigned XML plist with a placeholder URL; blocks SMS onboarding |
| INF-13 | High | CONFIRMED | Postgres published on all interfaces with default credentials |
| INF-14 | High | CONFIRMED | No README, self-hosting, backup or upgrade docs |
| INF-15 | High | CONFIRMED | No CI |
| INF-21 | Medium | CONFIRMED | Health endpoint checks nothing; no compose healthcheck |
| INF-23 | Medium | CONFIRMED | No structured logging, error reporting or job history |
| INF-24 | Medium | CONFIRMED | `.env.example` and compose env don't match what the code reads (`APP_URL`, VAPID private key unused) |
| INF-35 | Low | CONFIRMED | Dependency and engine hygiene |

Recommended minimum: Dockerfile with `output: "standalone"`, a `migrate` one-shot service, a scheduler (pg-boss worker as specified, or a cron container hitting the tick with an advisory lock), Postgres bound to the internal network with generated credentials, health that checks DB and job lag, a README with first-run, backup (`pg_dump`) and upgrade steps, and a CI running lint, tsc, vitest, build and a production-build Playwright project.

---

## 17. PRD and PLAN gaps

Full table: `infra-prd.md` §3. The rows that matter most:

| Feature (PRD/PLAN) | Status | Findings |
|---|---|---|
| pg-boss worker; Docker Compose `web` + `worker` + `postgres` | Missing / Broken | INF-01, INF-02 |
| Postgres BIGINT money | Diverges (int4) | FIN-01, INF-07 |
| Serwist/Workbox SW with build-asset precache | Diverges (hand-written, no precache) | PWA-07, INF-11 |
| Web Push daily reminders | Stub | PWA-01, INF-06 |
| Logout with non-empty outbox needs confirmation | Missing | PWA-12, INF-29 |
| Raw SMS never logged | Broken | SEC-005, INF-03 |
| Apple Shortcuts template download | Broken | INF-12 |
| Review inbox "Link to existing transaction" | Missing | — |
| Full JSON export/import + CSV export | Missing (headline data-sovereignty promise) | UI-18 |
| System health page, structured logs, job history | Missing | INF-21, INF-23 |
| README, `pg_dump` backup docs | Missing | INF-14 |
| CI | Missing | INF-15 |
| Desktop multi-card dashboard and Dashboard entry | Missing | UI-22 |
| Stats trend weekly/monthly/yearly | Partial | UI-41 |
| Default start view configurable | Missing | — |
| WCAG AA in both themes on all screens; keyboard-navigable desktop | Partial (axe on shell only) | §5 |
| Respect `prefers-reduced-motion` | Partial | INF-36, A11Y-25 |
| 12/14/16/20/28 type scale | Diverges (9–11 px common) | UI-06, A11Y-24 |
| Calendar dates in the user's timezone | Partial (Colombo hard-coded) | FIN-22, UI-27 |
| Single currency in v1 | Diverges (USD added) | FIN-23 |
| tRPC + superjson, monorepo `packages/finance-core` | Diverges | record as an ADR |
| E2E against a production build with worker + Postgres | Diverges | INF-16 |
| Visual snapshot tests | Missing | — |
| Text externalized for i18n | Missing | — |
| PLAN Step 21 (export, health, hardening) | Not started; S21-01…13 missing | — |

PLAN marks Steps 0–20 done. Against their own Build lists, Steps 0 (no monorepo, worker, CI, buildable compose), 11 (no scheduler), 14 (raw SMS logged, Shortcut not importable), 15 (no Structured Outputs, no "Link to existing"), 18 (S18-12/13 missing) and 20 (no Serwist, push stub, S20-01/02/04 missing) are not complete. Extras beyond the PRD: shared shopping list, inter-account transfer SMS auto-merge, USD accounts.

---

## 18. Consolidated bug table

### 18.1 Duplicate clusters

The same defect was often reported by two or three investigators. All IDs are kept in §18.2; this table shows which ones describe the same underlying problem, so a fix closes the whole cluster. The highest severity in a cluster is the one to plan by.

| # | Underlying problem | IDs |
|---|---|---|
| C1 | Sync push authorization (schedule/payment, blind upsert, non-member edits, injection) | SEC-001 = FIN-02; SEC-002 = FIN-03; SEC-003; SEC-009; FIN-19 |
| C2 | Push reminders faked and misreported | PWA-01, PWA-02, UI-83, SEC-007, INF-06 |
| C3 | VAPID key static / invalid | PWA-05, SEC-016, INF-19 |
| C4 | Notification click URL and payload | PWA-06, INF-34, SEC-025 (URL part) |
| C5 | Reminders re-sent every tick | PWA-03, SEC-027 (part) |
| C6 | SW doesn't precache app code; cache drift and growth | PWA-07, PWA-08, PWA-09, INF-11 |
| C7 | Update banner no-op, covers FAB, spins forever | PWA-10, UI-89, A11Y-25 (part) |
| C8 | Logout: one tap, ignores outbox, leaves data | UI-19, PWA-12, SEC-034, INF-29 |
| C9 | Session expiry silent; hard 7-day session | PWA-13, SEC-018 |
| C10 | Overlays lack dialog semantics, focus and history | A11Y-03, UI-65, UI-66, PWA-33, PWA-24 |
| C11 | `div onClick` rows, cards and cells | A11Y-01, UI-32, PWA-34 |
| C12 | Mobile Quick Add accessibility and theming | A11Y-02, A11Y-26, PWA-27, UI-70, UI-74 |
| C13 | Unlabelled fields, wrong mobile keyboards | A11Y-04, UI-68, PWA-25, UI-38 (search) |
| C14 | Unnamed icon buttons and back links | A11Y-05, UI-21, UI-93 (part) |
| C15 | Tabs, switches, disclosures expose no state | A11Y-06, UI-08 (part), UI-93 (part) |
| C16 | Text contrast failures; hard-coded palette | A11Y-07, PWA-32, UI-13, UI-05 |
| C17 | Budget buttons invisible (`--primary`) | A11Y-08, UI-02 |
| C18 | Undefined tokens (hairline, accent, surface-hover, muted) | A11Y-27, UI-01, UI-03, PWA-28, PWA-36 (part) |
| C19 | No visible focus | A11Y-13, UI-14 |
| C20 | Silent status changes and short undo | A11Y-12, UI-37, UI-93 (part) |
| C21 | FAB everywhere, covers content | A11Y-14, UI-16, PWA-29 |
| C22 | Small touch targets, Delete next to Archive | A11Y-15, UI-15, PWA-30, UI-48, UI-76 |
| C23 | Portrait lock and manifest gaps | A11Y-10, PWA-16, UI-90 (part) |
| C24 | Install prompt unused; theme-color ignores app theme | PWA-17, PWA-19, UI-90 |
| C25 | Charts without text alternatives; trend bars | A11Y-19, UI-40, UI-41 |
| C26 | Reflow and non-wrapping rows | A11Y-20, UI-50, UI-51 |
| C27 | Icon name printed as text ("Wallet Salary") | A11Y-21, UI-43, PWA-35 |
| C28 | Small type, mono/sans mix | A11Y-24, UI-06, UI-07, PWA-31, PWA-37 |
| C29 | Reduced motion covers transitions only | A11Y-25, INF-36 |
| C30 | `select-none` on sheets | A11Y-28, UI-69 |
| C31 | Abbreviated labels and raw enums | A11Y-29, UI-28, UI-17 (label part) |
| C32 | Inconsistent headers, hidden sync status | UI-10, UI-91, PWA-36 |
| C33 | Excluded rows contradict totals | UI-29, PWA-38 |
| C34 | More tab structure and placeholders | UI-18, PWA-39 |
| C35 | Amount signs and money formats | A11Y-22, UI-25 |
| C36 | int4 money columns | FIN-01, INF-07 |
| C37 | serverSeq before commit; sequence not migrated | FIN-15, SEC-019, INF-08 |
| C38 | Money-route races and double submits | FIN-08, FIN-09, SEC-013, PWA-26 (client side) |
| C39 | Unvalidated money input | FIN-16, FIN-17, SEC-011, SEC-012 |
| C40 | Raw SMS in logs and in memory | SEC-005 = INF-03; SEC-006 = INF-05 |
| C41 | Key rotation broken | SEC-017, INF-04 |
| C42 | No security headers | SEC-014, INF-22 |
| C43 | Weak in-memory rate limits; unindexed key hash | SEC-015, SEC-026, INF-26 |
| C44 | Compose not buildable; Postgres exposed | SEC-022, INF-01, INF-13 |
| C45 | Deprecated `middleware.ts` | SEC-028, INF-31 |
| C46 | Health checks nothing | SEC-033, INF-21 |
| C47 | Lint red; `as any` in money routes; untested authz | SEC-035, INF-20, FIN-35, INF-17 (part) |
| C48 | Cron: unscheduled, non-atomic, poison pill | INF-02, INF-10, FIN-12, SEC-027, INF-32 |
| C49 | Unbounded pull and lists | SEC-020, INF-28 |
| C50 | Early payoff moves no money | FIN-13, UI-59 |
| C51 | Fixture code in sync push | FIN-38, SEC-031 |
| C52 | Timezone and date formats | FIN-22, UI-27 |
| C53 | Currency handling | FIN-23, UI-26 |
| C54 | PWA not covered by E2E | INF-16, PWA-42 |
| C55 | Dead code and leftover assets | INF-33, PWA-18 (part) |
| C56 | Totals depend on filters and row order | BF-02, BF-03, UI-20 |

### 18.2 All findings

Severity column shows severity · status. Area codes: UI = UI/visual/mobile UX, A11Y = accessibility, PWA = PWA and mobile, SEC = backend and security, FIN = domain and financial, INF = infra, tests, deployment, BF = aggregator backfill.

#### Accessibility (29)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| A11Y-01 | Primary list rows and day cells are `div onClick`: not focusable, no role, no name | Critical · CONFIRMED | A11Y | `daily-view.tsx:140-145`, `calendar-view.tsx`, `budget-card.tsx`, `stats-sections.tsx`; `image.png`, `image2.png`, `image3.png` |
| A11Y-02 | Mobile Quick Add can't be understood or completed with a screen reader | Critical · CONFIRMED | A11Y | `src/components/transaction/mobile-quick-add.tsx` |
| A11Y-03 | 18 overlays without dialog semantics, initial focus, containment or restore | High · CONFIRMED | A11Y | all `fixed inset-0` overlays, e.g. `transaction-edit-modal.tsx:270` |
| A11Y-04 | 90 of 135 form controls have no programmatic label | High · CONFIRMED | A11Y | `accounts/page.tsx`, `loan-modal.tsx`, `trans-filter-bar.tsx:57`; `image.png` |
| A11Y-05 | Icon-only buttons and links with no accessible name, or `title` only | High · CONFIRMED | A11Y | `more/*/page.tsx` back links, modal close buttons, `accounts/page.tsx:1380-1398`; `image4.png` |
| A11Y-06 | Tabs, segmented controls, toggles and disclosures expose no state | High · CONFIRMED | A11Y | `segmented-tabs.tsx:18-39`, `stats/page.tsx:201-247`, `preferences/page.tsx:404-417`; `image.png`, `image2.png`, `image4.png` |
| A11Y-07 | Text contrast below 4.5:1 on primary actions, chips, warnings, errors | High · CONFIRMED | A11Y | `globals.css` tokens, `daily-view.tsx:183`; `image6.png`, `image.png` |
| A11Y-08 | Budget primary actions have no background; focus ring missing | High · CONFIRMED | A11Y | `budget/page.tsx:271,550`; `image3.png` |
| A11Y-09 | Validation errors aren't announced or linked | High · CONFIRMED | A11Y | `accounts/page.tsx:991-995`, `loan-modal.tsx:145`, `mobile-quick-add.tsx:563-568` |
| A11Y-10 | Installed PWA locked to portrait | High · CONFIRMED | A11Y | `public/manifest.json` |
| A11Y-11 | Non-text contrast: input outlines, switch tracks, selected segments under 3:1 | Medium · CONFIRMED | A11Y | `globals.css` `--border`; `image6.png`, `image4.png` |
| A11Y-12 | Status changes silent; delete-undo toast times out in 6 s | Medium · CONFIRMED | A11Y | `app/page.tsx:340-356`, `sync-provider.tsx:296-334` |
| A11Y-13 | Focus indicator missing or invisible in several places | Medium · CONFIRMED | A11Y | `month-switcher.tsx:64-71`, `quick-add-modal.tsx:540`, `preferences/page.tsx:414-416` |
| A11Y-14 | FAB and fixed overlays cover last rows and can hide focused controls | Medium · CONFIRMED (2.4.11 fail SUSPECTED) | A11Y | `fab.tsx:36`, `globals.css:227-229`; `image5.png` |
| A11Y-15 | Touch targets below 24 px and widely below 44 px | Medium · CONFIRMED | A11Y | `trans-filter-bar.tsx:67-74`, `accounts/page.tsx:1373-1404`; `image4.png`, `image6.png` |
| A11Y-16 | Shopping List reordering requires dragging | Medium · CONFIRMED | A11Y | `more/shopping-list/page.tsx:228-251`; `image6.png` |
| A11Y-17 | Every route titled "Hard Money"; tab switches not announced; no focus management | Medium · CONFIRMED | A11Y | `layout.tsx:28-30`, `tab-navigation-context.tsx:122-125`; `image.png`, `image-desktop.png` |
| A11Y-18 | Section headings are styled spans; lists aren't lists | Medium · CONFIRMED | A11Y | `more/page.tsx:200-204`, `daily-view.tsx:108-110`; `image5.png`, `image4.png` |
| A11Y-19 | Donut, trend bars, budget bars, calendar grid lack accessible structure | Medium · CONFIRMED | A11Y | `stats/page.tsx:270-382`, `calendar-view.tsx:114-176`; `image2.png` |
| A11Y-20 | Content may clip at 320 px or 200 % text | Medium · SUSPECTED | A11Y | `layout.tsx:57`, `accounts/page.tsx:307-336`, `mobile-quick-add.tsx:267,343` |
| A11Y-21 | Category icon names rendered and spoken ("Wallet Salary") | Medium · CONFIRMED | A11Y | `budget/page.tsx:147,316,480`, `budget-card.tsx:56`; `image3.png` |
| A11Y-22 | Amount signs may not be spoken | Medium · SUSPECTED | A11Y | `daily-view.tsx:120-124`, `monthly-view.tsx:102-110`; `image.png` |
| A11Y-23 | Auth and offline pages lack `<main>`; positive `tabIndex`; no skip link | Low · CONFIRMED | A11Y | `login/page.tsx:87,110,122,144-151`, `offline/page.tsx:14`, `sidebar.tsx` |
| A11Y-24 | Very small text (9–11 px) below the PRD 12 px minimum | Low · CONFIRMED | A11Y | repo-wide `text-[9-11px]`; `image.png`, `image5.png` |
| A11Y-25 | Reduced motion covers page transitions only; update icon spins indefinitely | Low · CONFIRMED | A11Y | `globals.css:322-328`, `pwa-manager.tsx:156` |
| A11Y-26 | Quick Add ignores light theme; ambiguous theme control; forced colours unhandled | Low · CONFIRMED | A11Y | `mobile-quick-add.tsx:267`, `theme-provider.tsx:88-95`; `image-desktop.png` |
| A11Y-27 | Undefined Tailwind colours remove today, active-filter and drop-target cues | Low · CONFIRMED | A11Y | `calendar-view.tsx:143,150`, `trans-filter-bar.tsx:93`; `image5.png` |
| A11Y-28 | `select-none` on whole sheets blocks copying | Low · CONFIRMED | A11Y | `quick-add-modal.tsx:322`, `transaction-edit-modal.tsx:270` |
| A11Y-29 | Abbreviated and raw labels ("Trans.", EXPENSE, CONTRIBUTOR_ADD_ONLY, "Rs.") | Low · CONFIRMED | A11Y | `bottom-nav.tsx:24`, `daily-view.tsx:171`; all screenshots |

#### UI, visual design and mobile UX (95)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| UI-01 | Hairline dividers render as bright, text-coloured lines | High · CONFIRMED | UI | `summary-bar.tsx:30` + 17 files; `image5.png`, `image.png`, `image4.png`, `image-desktop.png` |
| UI-02 | Budget "Add Budget" and "Save Budget" buttons have no background | High · CONFIRMED | UI | `budget/page.tsx:271,550`; `image3.png` |
| UI-03 | Other undefined tokens fail silently | Medium · CONFIRMED | UI | `var(--surface-hover)` ×30, `--muted`, `globals.css` |
| UI-04 | Income/expense colour swap leaks into success, danger and status colours | High · CONFIRMED | UI | `globals.css` swap block |
| UI-05 | Hard-coded Tailwind palette colours bypass the token system | Medium · CONFIRMED | UI | `daily-view.tsx:183`; `image.png` |
| UI-06 | Type scale below the PRD; mono mixed with sans | Medium · CONFIRMED | UI | repo-wide; `image.png`, `image2.png`, `image-desktop.png` |
| UI-07 | Mobile inputs jump to 16 px next to 12 px UI | Low · CONFIRMED | UI | `globals.css` iOS zoom rule; `image.png` |
| UI-08 | Three segmented-control styles for the same pattern | Medium · CONFIRMED | UI | `segmented-tabs.tsx`, `stats/page.tsx:201`, `accounts/page.tsx`; `image.png`, `image2.png`, `image4.png` |
| UI-09 | No consistent button hierarchy | Medium · CONFIRMED | UI | `image3.png`, `image4.png`, `image5.png`, `image6.png` |
| UI-10 | Page headers differ on every tab; sync status on two tabs only | Medium · CONFIRMED | UI | tab `page.tsx` files; all mobile screenshots |
| UI-11 | Month switcher: inconsistent framing, small targets, no picker | Medium · CONFIRMED | UI | `month-switcher.tsx`, `budget/page.tsx:279`; `image3.png` |
| UI-12 | Header utility icons cryptic and small | Low · CONFIRMED | UI | `app/page.tsx` header; `image.png` |
| UI-13 | Contrast failures (PRD requires AA in both themes) | Medium · CONFIRMED | UI | `globals.css` |
| UI-14 | No visible keyboard/switch-control focus anywhere | High · CONFIRMED | UI | `globals.css` (0 `:focus-visible`) |
| UI-15 | Tap targets well below 44×44 px | High · CONFIRMED | UI | `image4.png`, `image6.png`, `image.png` |
| UI-16 | FAB on every screen covers content | High · CONFIRMED | UI | `fab.tsx`; `image5.png`, `image6.png`, `image2.png`, `image3.png` |
| UI-17 | Bottom nav: abbreviated label, weak active state, no re-tap | Medium · CONFIRMED | UI | `bottom-nav.tsx`; all mobile screenshots |
| UI-18 | More tab buries daily tasks under "Developer", placeholder content | Medium · CONFIRMED | UI | `more/page.tsx:114-160,183,251-256`; `image5.png` |
| UI-19 | Log Out one tap, prominent, ignores unsynced changes | High · CONFIRMED | UI | `more/page.tsx:48-60,189-197`; `image5.png` |
| UI-20 | Trans. Summary duplicates Stats with different maths | Low · CONFIRMED | UI | `summary-view.tsx` vs `stats/page.tsx` |
| UI-21 | Back buttons inconsistent and often unlabelled | Low · CONFIRMED | UI | `more/*/page.tsx`; `image6.png` |
| UI-22 | Desktop is a stretched mobile layout, differs from PRD | Medium · CONFIRMED | UI | `image-desktop.png` |
| UI-23 | No first-run onboarding; empty states dead-end | High · CONFIRMED | UI | `register-form.tsx`, `mobile-quick-add.tsx` account panel |
| UI-24 | Every month-based screen opens on October 2026 | Critical · CONFIRMED | UI | `app/page.tsx:23`, `stats/page.tsx:20`, `budget/page.tsx:39`, `month-switcher.tsx:12`; all screenshots |
| UI-25 | Several money formats on the same screen | Medium · CONFIRMED | UI | `image.png`, `image3.png` |
| UI-26 | Currency preference has no visible effect | Medium · CONFIRMED | UI | `finance-core/money.ts:24` |
| UI-27 | Dates in at least five formats; timezone setting ignored | Medium · CONFIRMED | UI | multiple views |
| UI-28 | Raw enum values and internal jargon shown | Medium · CONFIRMED | UI | `image.png`, `image-desktop.png`, `image4.png` |
| UI-29 | Monthly totals contradict visible excluded rows (loan disbursement) | High · CONFIRMED | UI | `app/page.tsx:162-196`, `daily-view.tsx:72`, `calendar-view.tsx:44-55`; `image.png`, `image-desktop.png` |
| UI-30 | Transaction row hierarchy weak and noisy | Medium · CONFIRMED | UI | `daily-view.tsx:143-245`; `image.png` |
| UI-31 | Empty state ignores active search and filters | Medium · CONFIRMED | UI | `app/page.tsx:284-290` |
| UI-32 | Rows, cells and cards are clickable `<div>`s | High · CONFIRMED | UI | `daily-view.tsx:143`, `calendar-view.tsx`, `accounts/[id]/page.tsx` |
| UI-33 | Calendar: stale selection, broken today marker, unreadable amounts | Medium · CONFIRMED | UI | `calendar-view.tsx:60-68,143,150,161-171` |
| UI-34 | Monthly view overflows; lists empty future months | Low · CONFIRMED | UI | `monthly-view.tsx` |
| UI-35 | SMS chip and raw-SMS modal mislead and lack basics | Low · CONFIRMED | UI | `daily-view.tsx:30-52,337-381`; `image.png` |
| UI-36 | Possible-duplicate prompt: tiny buttons, no confirmation or feedback | Medium · CONFIRMED | UI | `daily-view.tsx:279-327` |
| UI-37 | Undo only on Trans. tab and not announced | Low · CONFIRMED | UI | `app/page.tsx:340-357`, `accounts/[id]/page.tsx` |
| UI-38 | Filter UI gives weak feedback | Low · CONFIRMED | UI | `trans-filter-bar.tsx` |
| UI-39 | Tapping "Uncategorized" does nothing despite the hint | High · CONFIRMED | UI | `stats/page.tsx:145,422`; `image2.png` |
| UI-40 | Donut reads as empty and isn't accessible | Medium · CONFIRMED | UI | `stats/page.tsx:288-418`; `image2.png` |
| UI-41 | Trend chart false bars, truncated labels | Low · CONFIRMED | UI | `stats-sections.tsx:39-49` |
| UI-42 | Category drill-down read-only, ISO dates | Low · CONFIRMED | UI | `stats-sections.tsx:112-138` |
| UI-43 | Budget cards print the Lucide icon name ("Wallet Salary") | High · CONFIRMED | UI | `budget/page.tsx:316,480`, `budget-card.tsx`; `image3.png` |
| UI-44 | Income and system categories can be budgeted | High · CONFIRMED | UI | `budget/page.tsx:61-69`; `image3.png` |
| UI-45 | Progress track invisible; "ok" uses income colour | Medium · CONFIRMED | UI | `budget/page.tsx:363`; `image3.png` |
| UI-46 | Overview colours and safe-to-spend send wrong signals | Medium · CONFIRMED | UI | `budget-overview.tsx`, `budget/page.tsx:107-111`; `image3.png` |
| UI-47 | Budget modal: centred dialog, unconfirmed delete, jargon | Medium · CONFIRMED | UI | `budget/page.tsx:446-560` |
| UI-48 | Delete next to Archive and Edit as 25 px icons | High · CONFIRMED | UI | `accounts/page.tsx:1380-1407,1536-1563`; `image4.png` |
| UI-49 | Account rows show internal SMS sender IDs | Low · CONFIRMED | UI | `accounts/page.tsx:1340`; `image4.png` |
| UI-50 | Three-column money headers tight on narrow phones | Medium · SUSPECTED | UI | `summary-bar.tsx:30`, `accounts/page.tsx:342`; `image4.png` |
| UI-51 | Loan, FD and credit-card cards don't wrap on mobile | High · CONFIRMED (overflow SUSPECTED) | UI | `accounts/page.tsx:720,855` |
| UI-52 | Liabilities/Investments stacked empty messages, tiny entry points | Medium · CONFIRMED | UI | `accounts/page.tsx:483-488,519-548,655-681,820-848` |
| UI-53 | FD "Deposit proceeds" one tap, no progress or feedback | High · CONFIRMED | UI | `accounts/page.tsx:96-119,920-926` |
| UI-54 | "Show archived" is a tiny native checkbox in the header | Low · CONFIRMED | UI | `accounts/page.tsx:309-318`; `image4.png` |
| UI-55 | Account detail lacks list structure and actions | Medium · CONFIRMED | UI | `accounts/[id]/page.tsx` |
| UI-56 | Settle modal truncates the amounts being paid | Medium · CONFIRMED | UI | `settle-modal.tsx:137-170` |
| UI-57 | Loan detail header: close button between title and "Delete loan" | High · CONFIRMED | UI | `loan-detail-modal.tsx:280-292` |
| UI-58 | Pay EMI, close, edit, override fail silently; no success feedback | High · CONFIRMED | UI | `loan-detail-modal.tsx:89,148,203` |
| UI-59 | Loan "Early Payoff" only closes the loan | Medium · CONFIRMED | UI | `loan-detail-modal.tsx:185-205` |
| UI-60 | EMI account picker shows the opening balance | Medium · CONFIRMED | UI | `loan-detail-modal.tsx:654` |
| UI-61 | EMI dialog has no breakdown or mobile-friendly input | Medium · CONFIRMED | UI | `loan-detail-modal.tsx:620-725` |
| UI-62 | Inline loan edit form cramped and unvalidated | Medium · CONFIRMED | UI | `loan-detail-modal.tsx:295-306` |
| UI-63 | FD premature-close dialog gaps | Medium · CONFIRMED | UI | `fd-close-modal.tsx:84-170` |
| UI-64 | Loan schedule uses cashflow colours and raw values | Low · CONFIRMED | UI | `loan-detail-modal.tsx:555-560` |
| UI-65 | No dialog semantics, focus management or consistent back/Escape | High · CONFIRMED | UI | all overlays |
| UI-66 | Overlay patterns and button order differ between flows | Medium · CONFIRMED | UI | all overlays |
| UI-67 | Confirmation patterns mixed; ConfirmationModal hides failures | Medium · CONFIRMED | UI | `loan-detail-modal.tsx:186,208`, `shopping-list/page.tsx:114`, `confirmation-modal.tsx` |
| UI-68 | Amount fields open the wrong keyboard; labels not linked | Medium · CONFIRMED | UI | amount inputs across modals |
| UI-69 | `select-none` on whole sheets blocks copying | Low · CONFIRMED | UI | edit, confirmation, early payoff, calibration, quick-add roots |
| UI-70 | Mobile quick add ignores light theme and colour swap | High · CONFIRMED | UI | `mobile-quick-add.tsx:118-155,267,345` |
| UI-71 | "Add New" category throws away the half-entered transaction | High · CONFIRMED | UI | `mobile-quick-add.tsx:811-822,274-282` |
| UI-72 | Category from the other group silently flips Expense ↔ Income | Medium · CONFIRMED | UI | `mobile-quick-add.tsx:228-238,765-808` |
| UI-73 | Quick add lacks save feedback, "Continue" and Split | Medium · CONFIRMED | UI | `mobile-quick-add.tsx` |
| UI-74 | Quick-add fields and toggles aren't accessible | Medium · CONFIRMED | UI | `mobile-quick-add.tsx:397-561` |
| UI-75 | Mobile back label always "Trans."; no remembered account | Low · CONFIRMED | UI | `mobile-quick-add.tsx:281`, `quick-add-modal.tsx` |
| UI-76 | Shopping list controls too small | Medium · CONFIRMED | UI | `shopping-list/page.tsx:154,256,278`; `image6.png` |
| UI-77 | With no household, the list silently does nothing | Medium · CONFIRMED | UI | `shopping-list/page.tsx:71,219` |
| UI-78 | Shopping list polish | Low · CONFIRMED | UI | `shopping-list/page.tsx`; `image6.png` |
| UI-79 | Transfer ownership is one tap, no confirmation | Critical · CONFIRMED | UI | `more/household/page.tsx:178-189,386-399` |
| UI-80 | Remove member and Leave household have no confirmation | High · CONFIRMED | UI | `household/page.tsx:292-299,402-413` |
| UI-81 | Household feedback appears off-screen on phones | Medium · CONFIRMED | UI | `household/page.tsx:219-230,428-505` |
| UI-82 | Household: raw roles, single household, unclear invite | Medium · CONFIRMED | UI | `more/household/page.tsx` |
| UI-83 | "Reminders active" while push uses a fake subscription | Critical · CONFIRMED | UI | `more/preferences/page.tsx:139-151` |
| UI-84 | Preferences: silent failures, ambiguous controls | Medium · CONFIRMED | UI | `preferences/page.tsx:117,316,355,416` |
| UI-85 | "Regenerate Key" silently breaks SMS ingest | High · CONFIRMED | UI | `more/developer/page.tsx:71-83,212-219` |
| UI-86 | Category and bookmark deletes instant; icon field asks for a code name | Medium · CONFIRMED | UI | `categories/page.tsx:91-93,285-306`, `bookmarks/page.tsx:100-106,352` |
| UI-87 | SMS Review Inbox (mobile): dense forms, raw values, distant errors | Medium · CONFIRMED | UI | `inbox-items.tsx:70-110,150-180`, `inbox/page.tsx:266-273` |
| UI-88 | Login and registration basics missing | Medium · CONFIRMED | UI | `login/page.tsx`, `register/register-form.tsx` |
| UI-89 | Update banner on top of the FAB; icon always spins | Medium · CONFIRMED | UI | `pwa-manager.tsx:144,156`, `fab.tsx:36` |
| UI-90 | Install prompt never shown; splash and status bar ignore theme | Low · CONFIRMED (look SUSPECTED) | UI | `pwa-manager.tsx:19-25`, `public/manifest.json` |
| UI-91 | Sync status hard to find, not operable, not explained | Medium · CONFIRMED | UI | `sync-provider.tsx:292-334`; `image.png`, `image4.png` vs `image2.png`, `image3.png`, `image5.png` |
| UI-92 | Loading and error states thin | Medium · CONFIRMED (empty flash SUSPECTED) | UI | `sync-provider.tsx`, page components |
| UI-93 | Screen readers miss state changes, icon buttons, charts | Medium · CONFIRMED | UI | repo-wide (0 `aria-live`) |
| UI-94 | Loan and FD create forms pre-filled with sample money values | Medium · CONFIRMED | UI | `loan-modal.tsx:23-26`, `fixed-deposit-modal.tsx:25-27` |
| UI-95 | Split amount fields reformat on every keystroke | High · CONFIRMED | UI | `transaction-edit-modal.tsx:498-507` |

#### PWA and mobile (42)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| PWA-01 | Push reminders fake end to end; can never reach a device | Critical · CONFIRMED | PWA | `more/preferences/page.tsx:140-146`, `lib/push/outbox.ts`, `package.json` |
| PWA-02 | Reminder UI reports success when push is unsupported, not installed or denied | High · CONFIRMED | PWA | `more/preferences/page.tsx:83-86,131-151` |
| PWA-03 | Reminders re-sent on every cron tick after the configured time | High · CONFIRMED (latent) | PWA | `lib/jobs/cron-runner.ts:541` |
| PWA-04 | Turning reminders off on one phone unsubscribes every device | Medium · CONFIRMED | PWA | `services/push-service.ts:13-16`, `api/push/unsubscribe/route.ts:26-31` |
| PWA-05 | VAPID public key frozen at build time; sample fallback | Low · CONFIRMED | PWA | `api/push/vapid-public-key/route.ts:4-6` |
| PWA-06 | Notification payload and click handling issues | Low · CONFIRMED | PWA | `public/sw.js:128-171` |
| PWA-07 | Offline cold start depends on the HTTP cache; SW never serves app code | High · SUSPECTED | PWA | `public/sw.js:59-66`, `pwa-manager.tsx:28-65` |
| PWA-08 | Priming cache uses the old name, is never read, grows every deploy | Medium · CONFIRMED | PWA | `pwa-manager.tsx:31` vs `sw.js:2` |
| PWA-09 | RSC requests cache-first with `ignoreSearch`; unbounded | Medium · SUSPECTED | PWA | `public/sw.js:104-122` |
| PWA-10 | Update banner Reload does nothing in the common path; covers the FAB | Medium · CONFIRMED | PWA | `sw.js:14,43`, `pwa-manager.tsx:87-159` |
| PWA-11 | No persistent-storage request; unsynced offline entries can be evicted | Medium · CONFIRMED | PWA | `src/lib/db/index.ts` (no `storage.persist`) |
| PWA-12 | Logout one tap, ignores pending changes, leaves ledger and caches | Medium · CONFIRMED | PWA | `more/page.tsx:48-60,189-197`; `image5.png` |
| PWA-13 | Expired session shows "Synced"; hard 7-day session | Medium · CONFIRMED | PWA | `lib/sync/client.ts:41-43,73`; `image.png`, `image4.png` |
| PWA-14 | Sync polls every second while pending, even offline | Low · CONFIRMED | PWA | `sync-provider.tsx:186-190` |
| PWA-15 | Offline fallback page is a dead end | Low · CONFIRMED | PWA | `app/offline/page.tsx:16-33` |
| PWA-16 | Manifest missing installability and quality fields | Medium · CONFIRMED | PWA | `public/manifest.json` |
| PWA-17 | No Android install entry point; iOS hint hidden in Preferences | Medium · CONFIRMED | PWA | `pwa-manager.tsx:20-25`, `preferences/page.tsx:463-478` |
| PWA-18 | Icon weight, branding mismatch and leftovers | Low · CONFIRMED | PWA | `public/icon-*.png`, `public/*.svg`; `image-desktop.png` |
| PWA-19 | Status bar and `theme-color` follow the system, not the app theme | Medium · CONFIRMED | PWA | `layout.tsx:22-25,38`, `theme-provider.tsx` |
| PWA-20 | No root `color-scheme`: native controls render light in dark theme | Medium · CONFIRMED | PWA | `globals.css`, `accounts/page.tsx:317-323`; `image4.png` |
| PWA-21 | On-screen keyboard lifts nav/FAB on Android; covers sheets on iOS | Medium · SUSPECTED | PWA | `layout.tsx:21`, `bottom-nav.tsx:35`, `fab.tsx:36`; `image6.png` |
| PWA-22 | Fast keypad taps can double-tap-zoom; grey tap flash | Medium · SUSPECTED | PWA | `mobile-quick-add.tsx:601-760` |
| PWA-23 | Every bottom-nav tap adds a history entry | Medium · CONFIRMED | PWA | `tab-navigation-context.tsx:123-126` |
| PWA-24 | Some overlays miss history integration or bottom safe-area padding | Low · CONFIRMED | PWA | `household/page.tsx:523`, `calibration-modal.tsx:210`, `icon-picker.tsx:73,77` |
| PWA-25 | Amount fields open a full text keyboard; numeric fields use `type="number"` | High · CONFIRMED | PWA | 14 inputs, e.g. `accounts/page.tsx:1066`, `transaction-edit-modal.tsx:303` |
| PWA-26 | Quick Add has no in-flight guard; double tap creates two transactions | High · CONFIRMED | PWA | `quick-add-modal.tsx:197-279`, `mobile-quick-add.tsx:305-313` |
| PWA-27 | Mobile Quick Add ignores theme and colour swap; hard with a screen reader | Medium · CONFIRMED | PWA | `mobile-quick-add.tsx` |
| PWA-28 | `divide-hairline` isn't a real utility: white divider lines | Medium · CONFIRMED | PWA | 18 uses, `globals.css:136`; `image.png`, `image4.png`, `image5.png` |
| PWA-29 | FAB on every page covers the last row | Medium · CONFIRMED | PWA | `fab.tsx:16-18`, `globals.css:227-229`; `image5.png`, `image6.png` |
| PWA-30 | Many tap targets under 44 px / 48 dp | Medium · CONFIRMED | PWA | `month-switcher.tsx`, `accounts/page.tsx:1379-1407`; `image4.png`, `image6.png` |
| PWA-31 | Text too small for phone reading | Medium · CONFIRMED | PWA | `bottom-nav.tsx:65`, `summary-bar.tsx:33-58`; all mobile screenshots |
| PWA-32 | Dark-theme accent buttons fail AA contrast | Medium · CONFIRMED | PWA | `globals.css` `--accent`; `image6.png` |
| PWA-33 | Sheets and dialogs lack dialog semantics and focus management | Medium · CONFIRMED | PWA | 19 overlay roots |
| PWA-34 | Primary rows are `div onClick` | Medium · CONFIRMED | PWA | `budget-card.tsx:46-51`, `daily-view.tsx`; `image3.png`, `image.png` |
| PWA-35 | Budget card prints the icon's name as text | Low · CONFIRMED | PWA | `budget-card.tsx:55`; `image3.png` |
| PWA-36 | Tab headers inconsistent; sync status missing on three tabs | Low · CONFIRMED | PWA | `app-header.tsx` (unused), `sync-provider.tsx:306,318`; all mobile screenshots |
| PWA-37 | Amounts mix monospace and proportional fonts | Low · CONFIRMED | PWA | `image.png`, `image4.png` |
| PWA-38 | Transactions excluded from stats aren't explained | Low · CONFIRMED | PWA | `daily-view.tsx:69-72,215`; `image.png` |
| PWA-39 | More tab clean-up | Low · CONFIRMED | PWA | `more/page.tsx:183,252-256`; `image5.png` |
| PWA-40 | Every route downloads ~1.08 MB JS (317 KB gzip) | High · CONFIRMED | PWA | `navigation/native-tab-container.tsx`, `layout.tsx` |
| PWA-41 | Live queries load whole tables on every change | Medium · CONFIRMED | PWA | `sync-provider.tsx:227-289` |
| PWA-42 | No automated coverage of PWA behaviour | Medium · CONFIRMED | PWA | `playwright.config.ts:15,44`, `tests/e2e/s20-pwa.spec.ts` |

#### Backend, API and security (35)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| SEC-001 | Loan schedule entries and payments in sync push have no authorization | Critical · CONFIRMED | SEC | `api/sync/push/route.ts:1241-1310` |
| SEC-002 | CREATE upserts let any user overwrite other users' rows | Critical · CONFIRMED | SEC | `api/sync/push/route.ts` (upsert `update` branches) |
| SEC-003 | Sync push lets non-members edit and delete household transactions | High · CONFIRMED | SEC | `api/sync/push/route.ts:558-701` |
| SEC-004 | CONTRIBUTOR_ADD_ONLY can read and write shared loans and FDs via REST | High · CONFIRMED | SEC | `src/lib/authorization.ts` |
| SEC-005 | SMS webhook writes raw bank SMS bodies and emails to production logs | High · CONFIRMED | SEC | `api/v1/webhooks/sms-ingress/route.ts:34-39,56,86-95,128,172` |
| SEC-006 | Gemini provider keeps every raw, unmasked SMS in memory | High · CONFIRMED | SEC | `lib/sms/gemini-provider.ts:21-22,52-58` |
| SEC-007 | Web push mocked in production | High · CONFIRMED | SEC | `more/preferences/page.tsx:139-145`, `lib/push/outbox.ts` |
| SEC-008 | `GET /api/test/*` unauthenticated when `E2E_MODE=1`; dumps all data | High · CONFIRMED | SEC | `api/test/[...slug]/route.ts:565-649`, `middleware.ts:16,30` |
| SEC-009 | Household and attribution injection through sync push | Medium · CONFIRMED | SEC | `api/sync/push/route.ts` |
| SEC-010 | Open redirect after login (tab/newline bypass) | Medium · CONFIRMED | SEC | `middleware.ts:68-71`, `login/page.tsx:13,24` |
| SEC-011 | Unbounded `tenureMonths` creates millions of rows | Medium · CONFIRMED | SEC | `api/loans/route.ts`, sync push loan handlers |
| SEC-012 | REST money routes accept unvalidated types and values | Medium · CONFIRMED | SEC | `api/loans/**`, `api/fixed-deposits/**`, `api/sms/inbox/[id]/post` |
| SEC-013 | Double-submit and race conditions on money-moving endpoints | Medium · CONFIRMED | SEC | `pay-emi/route.ts`, FD `close`/`deposit-proceeds`, SMS post, register |
| SEC-014 | No security headers | Medium · CONFIRMED | SEC | `next.config.ts`, `middleware.ts` |
| SEC-015 | In-memory rate limiter spoofable, per instance, unbounded, victim lockout | Medium · CONFIRMED | SEC | `lib/rate-limit.ts:1-12` |
| SEC-016 | VAPID key baked in at build time; fallback key invalid (64 bytes) | Medium · CONFIRMED | SEC | `api/push/vapid-public-key/route.ts:3-9` |
| SEC-017 | Key rotation broken: ciphertext has no key ID | Medium · CONFIRMED | SEC | `lib/encryption.ts:23,32,48-52` |
| SEC-018 | Session lifecycle doesn't fit an offline-first PWA | Medium · CONFIRMED | SEC | `lib/auth.ts:45`, `lib/sync/client.ts:41-44,73` |
| SEC-019 | Sync cursor can skip rows (serverSeq before commit) | Medium · CONFIRMED (design) | SEC | `lib/server-seq.ts:10`, `api/sync/pull/route.ts:174-216` |
| SEC-020 | Unbounded sync push/pull and SMS lists; crash-prone parsing | Medium · CONFIRMED | SEC | `api/sync/pull/route.ts:13,45-172`, `api/sms/activity/route.ts` |
| SEC-021 | Internal errors and full financial payloads leak to clients and logs | Medium · CONFIRMED | SEC | `api/sync/push/route.ts:1327-1333` |
| SEC-022 | Compose publishes Postgres with default credentials; Dockerfile missing | Medium · CONFIRMED | SEC | `docker-compose.yml:7-11,21-37` |
| SEC-023 | Any user can test whether an email is registered | Medium · CONFIRMED | SEC | `api/users/search/route.ts:18-35` |
| SEC-024 | Household membership edge cases | Medium · CONFIRMED | SEC | `api/households/[id]/members/**`, `api/transactions/[id]` |
| SEC-025 | Push subscriptions rebindable across users and not validated | Medium · CONFIRMED | SEC | `api/push/subscribe/route.ts:6-51`, `sw.js:155-170` |
| SEC-026 | SMS webhook hardening gaps | Low · CONFIRMED | SEC | `sms-ingress/route.ts:46-72,118-145`, `schema.prisma:19` |
| SEC-027 | Cron endpoint edge cases | Low · CONFIRMED | SEC | `api/v1/cron/tick/route.ts:14-15`, `cron-runner.ts:52-90,513-548` |
| SEC-028 | `middleware.ts` deprecated; Edge gate skips revocation | Low · CONFIRMED | SEC | `src/middleware.ts` |
| SEC-029 | CSRF relies on `SameSite=Lax`; JSON parsed regardless of Content-Type | Low · SUSPECTED | SEC | mutating routes, `api/auth/login/route.ts:72-79` |
| SEC-030 | Settings endpoints accept invalid values | Low · CONFIRMED | SEC | `api/user/settings`, `api/user/gemini-settings`, `api/push/settings` |
| SEC-031 | Global idempotency keys; fixture code in sync push | Low · CONFIRMED | SEC | `api/sync/push/route.ts:97-104,763-869,1313-1323` |
| SEC-032 | Inconsistent household access across REST routes | Low · CONFIRMED | SEC | `api/loans/route.ts:17-18`, `api/fixed-deposits/[id]/route.ts:14` |
| SEC-033 | Health endpoint checks nothing; exposes test clock | Low · CONFIRMED | SEC | `api/health/route.ts:4-11` |
| SEC-034 | Logout leaves ledger and cached pages on the device | Low (Medium shared devices) · CONFIRMED | SEC | `more/page.tsx:48-55`, `lib/db/dexie.ts:148-175`, `sw.js:75-85` |
| SEC-035 | Lint fails; nothing tests the authorization layer | Low · CONFIRMED | SEC | `eslint` output, `tests/unit` |

#### Domain and financial correctness (40)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| FIN-01 | Money columns are int4; overflow above LKR 21,474,836.47 | Critical · CONFIRMED | FIN | `prisma/schema.prisma`, `migrations/*_init/migration.sql:130` |
| FIN-02 | Sync push `loanScheduleEntry`/`loanPayment` have no authorization | Critical · CONFIRMED | FIN | `api/sync/push/route.ts:1241-1310` |
| FIN-03 | Sync push CREATE is a blind upsert overwriting any row by ID | Critical · CONFIRMED | FIN | `api/sync/push/route.ts` |
| FIN-04 | Editing a loan re-opens EMIs paid through pay-emi | High · CONFIRMED | FIN | `api/loans/[id]/route.ts:58-101`, `loan-detail-modal.tsx:126-145` |
| FIN-05 | Loan due dates one day late in Sri Lanka; FD month-end maturities shift | High · CONFIRMED (probe) | FIN | `finance-core/dates.ts`, `loan-modal.tsx`, `sync/client.ts` |
| FIN-06 | Existing loans: already-paid installments never applied on UI create | High · CONFIRMED | FIN | `loan-modal.tsx:87-107`, `sync/client.ts:930-958` |
| FIN-07 | Existing FDs: cron back-posts every elapsed monthly payout | High · CONFIRMED | FIN | `fixed-deposit-modal.tsx:146-148`, `cron-runner.ts:386-468` |
| FIN-08 | pay-emi not race-safe or idempotent | High · CONFIRMED (race SUSPECTED) | FIN | `api/loans/[id]/pay-emi/route.ts:47-160` |
| FIN-09 | FD close / deposit-proceeds not atomic; lock-out and double credit | High · CONFIRMED | FIN | `api/fixed-deposits/[id]/close/route.ts`, `deposit-proceeds/route.ts` |
| FIN-10 | Schedule override re-opens PAID rows, leaves stale rows, unvalidated | High · CONFIRMED | FIN | `api/loans/[id]/schedule/[entryId]/route.ts:25-127` |
| FIN-11 | Deleting/editing EMI or system txs, or loans/FDs, leaves orphaned effects | High · CONFIRMED | FIN | `sync/client.ts`, `api/sync/push/route.ts` |
| FIN-12 | Cron poison pill: non-atomic FD payout, deterministic ID, no lock | High · CONFIRMED | FIN | `cron-runner.ts:300-345,401-468` |
| FIN-13 | Loan early payoff moves no money | High · CONFIRMED | FIN | `api/loans/[id]/close/route.ts:18-47` |
| FIN-14 | Lease residual has no payment path | High · CONFIRMED | FIN | `finance-core/loans.ts:104-108`, `pay-emi/route.ts:76-98,248` |
| FIN-15 | serverSeq before commit; pull can skip rows; fallback; not migrated | High · CONFIRMED (design) | FIN | `lib/server-seq.ts:6-45` |
| FIN-16 | Sync push accepts unvalidated money data | Medium · CONFIRMED | FIN | `api/sync/push/route.ts:224-266,478-560,974-1172` |
| FIN-17 | REST money routes still have validation gaps | Medium · CONFIRMED (probe) | FIN | `api/loans/route.ts`, FD PATCH/close, schedule override |
| FIN-18 | `/api/transactions` POST/PATCH return BigInt and 500 after commit | Medium · CONFIRMED | FIN | `api/transactions/route.ts:84`, `[id]/route.ts:67` |
| FIN-19 | Loan/FD terms editable via sync UPDATE; FD edit forces ACTIVE | Medium · CONFIRMED | FIN | `api/sync/push/route.ts:1043-1061,1195-1210`, `fixed-deposit-modal.tsx` |
| FIN-20 | Re-amortization defects (flat rate, 240-row cap, stale EMI) | Medium · CONFIRMED (probe) | FIN | `finance-core/loans.ts:181-257` |
| FIN-21 | FD auto-renew/compound gaps | Medium · CONFIRMED | FIN | `cron-runner.ts:386,470-511`, `deposit-proceeds/route.ts:69-115` |
| FIN-22 | Timezone hard-coded; `User.timezone` unused; timestamps for dates | Medium · CONFIRMED | FIN | `cron-runner.ts:16-23`, `credit-card.ts:57-88`, `budget.ts` |
| FIN-23 | Cross-currency gaps | Medium · CONFIRMED | FIN | `cron-runner.ts:222-231`, `credit-card.ts:219-228`, `use-account-portfolio.ts:200-225` |
| FIN-24 | Multi-write operations without a transaction | Medium · CONFIRMED | FIN | `api/sync/push/route.ts`, `lib/sms/ingestion.ts:311-560` |
| FIN-25 | SMS post and merge-transfer repeatable on a processed SMS | Medium · CONFIRMED | FIN | `api/sms/inbox/[id]/post/route.ts`, `merge-transfer/route.ts` |
| FIN-26 | Cron budget job cost and history rewrite | Medium · CONFIRMED | FIN | `cron-runner.ts:50-193` |
| FIN-27 | Schema integrity: enums, uniques, tombstones, cascades, indexes | Medium · CONFIRMED | FIN | `prisma/schema.prisma` |
| FIN-28 | Long interactive transactions can hit Prisma's 5 s timeout | Medium · SUSPECTED | FIN | `api/loans/route.ts:121-185`, `pay-emi/route.ts:112-258` |
| FIN-29 | EMI tx counts principal as expense; date "now"; no category | Medium · CONFIRMED | FIN | `pay-emi/route.ts:114-133` |
| FIN-30 | Balance-mismatch hint never synced; per user not per account | Low · CONFIRMED | FIN | `lib/sms/ingestion.ts:587-654` |
| FIN-31 | Float arithmetic and rounding semantics | Low · CONFIRMED (risk SUSPECTED) | FIN | `loans.ts`, `investments.ts`, `money.ts`, `template-parser.ts:76-83` |
| FIN-32 | `calculateFlatRateEmi` disagrees with the schedule | Low · CONFIRMED (probe) | FIN | `finance-core/loans.ts:51-71,129-169` |
| FIN-33 | Deterministic IDs aren't the PRD's UUIDv5 scheme | Low · CONFIRMED | FIN | `cron-runner.ts`, `finance-core/uuid.ts` |
| FIN-34 | "Investment Yield" lookup ignores tombstones and races | Low · CONFIRMED | FIN | FD `close`/`deposit-proceeds` routes, `cron-runner.ts:416-431` |
| FIN-35 | `(prisma as any)` across money routes; 56 lint errors in financial files | Low · CONFIRMED | FIN | `pay-emi`, FD routes, `cron-runner.ts`, `sync/push` |
| FIN-36 | Premature-closure penalty invisible; WHT not recorded | Low · CONFIRMED | FIN | `api/fixed-deposits/[id]/close/route.ts:47-49` |
| FIN-37 | Loan read models: household loans missing; progress counts wrong | Low · CONFIRMED | FIN | `api/loans/route.ts:17-66`, `api/loans/[id]/route.ts:27-33` |
| FIN-38 | Leftover test scaffolding in sync push | Low · CONFIRMED | FIN | `api/sync/push/route.ts:780-871` |
| FIN-39 | Self-transfers and destination-less transfers accepted | Low · CONFIRMED | FIN | `ledger.ts:56-59`, `api/transactions/route.ts:42-62` |
| FIN-40 | Installment cron numbers by count, not cycle; non-atomic | Low · SUSPECTED | FIN | `cron-runner.ts:285-371` |

#### Infra, tests, deployment (37)

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| INF-01 | `docker compose up` can't work | Critical · CONFIRMED | INF | `docker-compose.yml:20-40`, no `Dockerfile` |
| INF-02 | No scheduler: jobs never run by default | Critical · CONFIRMED | INF | `lib/jobs/cron-runner.ts:36` |
| INF-03 | Raw SMS bodies, key prefixes and emails in production logs | High · CONFIRMED | INF | `sms-ingress/route.ts:34-39,56,86-95,128` |
| INF-04 | Key rotation corrupts newly saved Gemini keys | High · CONFIRMED (node) | INF | `lib/encryption.ts:23,32,48-51` |
| INF-05 | Gemini: raw SMS in memory, key in URL, no schema or timeout | High · CONFIRMED | INF | `lib/sms/gemini-provider.ts`, `.env.example:13` |
| INF-06 | Push reminders fake | High · CONFIRMED | INF | `preferences/page.tsx:140-145`, `lib/push/outbox.ts` |
| INF-07 | Every money column is int4, not BIGINT | High · CONFIRMED | INF | `prisma/schema.prisma` (33 fields) |
| INF-08 | Sync sequencing and atomicity unsafe | High · CONFIRMED (missed rows SUSPECTED) | INF | `lib/server-seq.ts:9-45`, `api/sync/push/route.ts` |
| INF-09 | SMS processing not durable; stuck rows never retried | High · CONFIRMED | INF | `sms-ingress/route.ts:150-160`, `lib/sms/worker.ts` |
| INF-10 | Cron runner correctness and scale problems | High · CONFIRMED (crash loop SUSPECTED) | INF | `cron-runner.ts:61-90,253,317-336,414-466,541` |
| INF-11 | SW offline cold start, dead priming, unreachable update prompt | High · CONFIRMED (offline failure SUSPECTED) | INF | `public/sw.js:2,14,59-66`, `pwa-manager.tsx:31,80-100` |
| INF-12 | Apple Shortcut unsigned XML plist with placeholder URL | High · CONFIRMED (import SUSPECTED) | INF | `public/HardMoney_SMS_Ingress.shortcut`, `more/shortcuts/page.tsx` |
| INF-13 | Postgres published on all interfaces with default credentials | High · CONFIRMED | INF | `docker-compose.yml:7-11,15` |
| INF-14 | No README or self-hosting docs | High · CONFIRMED | INF | repo root |
| INF-15 | No CI pipeline | High · CONFIRMED | INF | no `.github/` |
| INF-16 | E2E on `next dev` with SWs blocked; PWA offline tests missing | High · CONFIRMED | INF | `playwright.config.ts:15,45-54` |
| INF-17 | Unit/integration coverage misses money-critical server code | High · CONFIRMED | INF | `tests/unit` |
| INF-18 | `pnpm build` needs `AUTH_SECRET` at build time | Medium · CONFIRMED | INF | `lib/auth.ts:6-10`, `middleware.ts:4-8` |
| INF-19 | VAPID route prerendered static with a sample key | Medium · CONFIRMED | INF | `api/push/vapid-public-key/route.ts:3-8` |
| INF-20 | Lint gate red: 142 errors, 2 React Compiler bail-outs | Medium · CONFIRMED | INF | `eslint` output |
| INF-21 | Health endpoint checks nothing | Medium · CONFIRMED | INF | `api/health/route.ts:4-11`, `docker-compose.yml` |
| INF-22 | No security headers; `sw.js` served without no-cache | Medium · CONFIRMED | INF | `next.config.ts` |
| INF-23 | No structured logging, error reporting or job history | Medium · CONFIRMED | INF | `lib/server-log.ts`, route handlers |
| INF-24 | `.env.example` and compose env don't match the code | Medium · CONFIRMED | INF | `.env.example`, `docker-compose.yml` |
| INF-25 | Migration history squashed; no DB scripts | Medium · CONFIRMED | INF | `prisma/migrations`, `package.json` |
| INF-26 | Rate limiters in-memory and spoofable; webhook key lookup unindexed | Medium · CONFIRMED | INF | `lib/rate-limit.ts:1-12` |
| INF-27 | Plain-HTTP self-hosting breaks login silently | Medium · SUSPECTED | INF | `api/auth/login/route.ts:80`, `docker-compose.yml:37` |
| INF-28 | Initial sync pull is unbounded | Medium · CONFIRMED (impact SUSPECTED) | INF | `api/sync/pull/route.ts` |
| INF-29 | Logout ignores the outbox; leaves local data and caches | Medium · CONFIRMED | INF | `more/page.tsx:47-59` |
| INF-30 | Playwright `fullyParallel` while every test truncates the DB | Medium · CONFIRMED (flakiness SUSPECTED) | INF | `playwright.config.ts:5-6`, `api/test/[...slug]/route.ts:54-56` |
| INF-31 | `middleware.ts` convention deprecated in Next 16 | Low · CONFIRMED | INF | `src/middleware.ts` |
| INF-32 | Multibyte cron secret causes an uncaught 500 | Low · CONFIRMED (node) | INF | `api/v1/cron/tick/route.ts:14-15` |
| INF-33 | Dead code and dead CSS | Low · CONFIRMED | INF | unused Dexie module, `animate-in` classes, `AppHeader` |
| INF-34 | Default push target `/transactions` isn't a route | Low · CONFIRMED | INF | `public/sw.js:130,146,157` |
| INF-35 | Dependency and engine hygiene | Low · CONFIRMED | INF | `package.json` |
| INF-36 | Reduced-motion support covers view transitions only | Low · CONFIRMED | INF | `globals.css:322-328`, `pwa-manager.tsx:156` |
| INF-37 | Webhook E2E tests always send the browser session cookie | Low · CONFIRMED | INF | `tests/e2e/s14-*.spec.ts` |

#### Aggregator backfill (4)

These close gaps where an earlier-run finding was not re-checked by any v2 report. Each was checked against the code at `0c401ec`.

| ID | Title | Severity | Area | File or screenshot |
|---|---|---|---|---|
| BF-01 | Contributor masking not applied to Accounts subtotals, net-worth header or account detail page | Low · CONFIRMED in code (impact SUSPECTED, server sanitizes) | BF (authz/UI) | `accounts/page.tsx:431,459,499`, `use-account-portfolio.ts:199-225`, `accounts/[id]/page.tsx` |
| BF-02 | "Show archived" toggle changes subtotals and net worth | Medium · CONFIRMED | BF (finance/UI) | `use-account-portfolio.ts:127-130,204`; `image4.png` |
| BF-03 | Refund clamping is row-order dependent; Daily/Calendar show refunds as income while totals subtract them | Medium · CONFIRMED | BF (finance/UI) | `app/page.tsx:183-185`, `stats/page.tsx:60-107`, `summary-view.tsx:30-47`, `daily-view.tsx:137` |
| BF-04 | Quick-add `initialType`/`initialAccountId` not reset on close (earlier FORM-07, noted as still present in `ui-visual-design.md` §5.2 without an ID) | Low · CONFIRMED (re-checked: `openQuickAdd` only sets values when options are passed, `closeQuickAdd` only sets `isOpen`, so opening from an account page leaves that account and type for the next FAB open) | BF (UI) | `src/components/transaction/quick-add-context.tsx:28-36` |

---

## 19. Comparison with the earlier run (`audit/2026-10-20/`)

The earlier run produced four reports (`backend-security.md`, `domain-financial.md`, `frontend-uiux.md`, `infra-prd.md`) and no merged report. It had no screenshots and no separate accessibility or PWA report; those topics lived inside `frontend-uiux.md`. Each v2 investigator audited the code first and compared afterwards.

### 19.1 Counts

| Area | Earlier run | This run | Notes |
|---|---|---|---|
| Backend / security | 59 (6 C, 15 H, 22 M, 16 L) | 35 (2 C, 6 H, 17 M, 10 L) | 16 earlier findings fixed; several merged |
| Domain / financial | 44 (5 C, 13 H, 16 M, 10 L) | 40 (3 C, 12 H, 14 M, 11 L) | 10 fixed, 9 partly fixed, 15 new |
| Frontend (UI, a11y, PWA) | 106 (5 C, 17 H, 51 M, 33 L) | UI 95 + A11Y 29 + PWA 42 = 166 | Split into three reports with screenshot evidence; ~11 UI items fixed or improved, 6 PWA/mobile items fixed |
| Infra / PRD | 37 | 37 (2 C, 15 H, 13 M, 7 L) | 6 fixed, 7 partly fixed or mitigated, 24 still present |
| Backfill | — | 4 | Earlier items nobody re-checked |
| **Total** | **246** | **282** | More findings mainly from the deeper UI/a11y/PWA focus and screenshots, not from regressions |

| Command | Earlier | Now |
|---|---|---|
| `pnpm lint` | FAIL, 163 errors / 24 warnings | FAIL, 142 errors / 15 warnings |
| `tsc --noEmit` | PASS | PASS |
| `vitest run` | 6 files, 44 tests | 8 files, 62 tests |
| `pnpm build` (no env) | PASS | FAIL (needs `AUTH_SECRET`); PASS with a placeholder |

### 19.2 Fixed since the earlier run
- **Security:** public `AUTH_SECRET` fallback removed (fails closed); public encryption-key fallback removed; `.env.example` no longer sets `E2E_MODE=1`, and test POST also needs non-production and a secret header; default cron secret removed, constant-time compare, no logging; SMS webhook no longer blocked by middleware; middleware no longer skips auth for any path with a "."; 30-day JWT replaced by 7 days + `sessionVersion` revocation; cross-user account writes blocked by a generic `assertCanWriteAccount` check in sync push and REST; category CREATE checks ownership; login and register rate-limited with a dummy-hash timing guard (earlier F-004, F-005, F-008…F-011, F-020…F-025, F-028, F-047, F-055; infra SEC-01, 02, 04, 05, 09, 11).
- **Money:** FD premature close no longer double-posts (DF-02); pay-emi rejects PAID entries and non-ACTIVE loans and requires the exact EMI (DF-07, DF-10); extra-principal duplication fixed (DF-11); deposit-proceeds has a maturity check and the client waits for success (DF-15); `setMonth` overflow replaced by clamped helpers (DF-16); start dates editable (DF-32); 0 % tiny-loan zero row fixed (DF-36).
- **Mobile shell:** safe-area insets (MOB-01); `100dvh` shell and `dvh` sheets (MOB-02); iOS input focus zoom; dedicated maskable icon; `useModalHistory` on 12 sheets (NAV-04, mostly); account delete/archive and installment cancel behind `ConfirmationModal` (FIN-05, FIN-10); calibration keypad Clear; icon picker and category edit; cached live queries reduce empty flashes (STATE-01); dead "Export & Import" row removed (the feature is still missing).

### 19.3 Still present
Most high-impact items carried over unchanged: sync push authorization holes (F-001…F-003 → SEC-001…003), int4 money (DF-01/CFG-09 → FIN-01/INF-07), serverSeq before commit (F-034/CFG-03 → SEC-019/FIN-15/INF-08), no scheduler and no Dockerfile (OPS-02/CFG-01 → INF-02/INF-01), SW never caches `/_next/` (PWA-01/02 → PWA-07/INF-11), fake push (PWA-01/OPS-04 → PWA-01), month pinned to October 2026 (DATE-01 → UI-24), one-tap household actions (DEST-01 → UI-79/UI-80), logout ignoring the outbox (DEST-02 → UI-19/PWA-12), no dialog semantics (A11Y-01 → A11Y-03), `div onClick` rows (A11Y-02 → A11Y-01), contrast (A11Y-05 → A11Y-07), invisible Budget buttons (VIS-01 → UI-02/A11Y-08), split input (FORM-01 → UI-95), sample values in loan/FD forms (FIN-15 → UI-94), FAB overlap (MOB-03 → UI-16), no security headers, open Postgres, no README, no CI, E2E on `next dev`. Earlier CALC-01/02/03 and the contributor-masking leak (SEC-03) are still present (BF-01…03).

### 19.4 Got worse or regressed
- **Push:** the client now fabricates a mock FCM subscription and shows "Reminders active" (PWA-01, PWA-02, UI-83).
- **Privacy:** commit `da48e4f` added verbose SMS ingress logging that writes raw SMS bodies and emails in production and redacts only in E2E (SEC-005, INF-03).
- **Authorization:** the fix for shared loans/FDs (F-012) introduced helpers that let CONTRIBUTOR_ADD_ONLY write them (SEC-004).
- **Encryption:** the new keyring corrupts keys on rotation (SEC-017, INF-04).
- **Money:** the date-helper fix introduced a one-day-late due date (FIN-05); new loan PATCH re-opens paid EMIs (FIN-04); new FD/loan "already paid" fields are ignored downstream (FIN-06, FIN-07).
- **SW:** the cache name drifted (`v5` vs `v4`), so priming is now dead and grows (PWA-08).
- **Mobile:** `interactive-widget=resizes-content` (part of the dvh fix) lifts nav and FAB over the Android keyboard (PWA-21); the native tab stack pushes history per tab (PWA-23) and bundles every tab into every route (PWA-40).
- **Household:** transfer ownership is now an icon-only button next to Remove on mobile, so UI-79 was raised to Critical.
- **Build:** now requires `AUTH_SECRET` at build time (INF-18).

### 19.5 New in this run (missed before or introduced since)
- **UI/UX (about 35):** white dividers (UI-01), colour swap leaking into status colours (UI-04), component drift (UI-07…11), "Wallet Salary" (UI-43), income budgets (UI-44), invisible progress track (UI-45), dead Uncategorized drill-down (UI-39), excluded-row totals (UI-29), quick-add theme, draft loss and type flip (UI-70…73), shopping-list issues (UI-76…78), household feedback (UI-81/82), banner over FAB (UI-89), desktop parity (UI-22), onboarding (UI-23).
- **Accessibility (14):** full Quick Add AT failure (A11Y-02), portrait lock (A11Y-10), non-text contrast (A11Y-11), focus not obscured (A11Y-14), drag-only reorder (A11Y-16), page titles and announcer bypass (A11Y-17), headings and lists (A11Y-18), body clipping under text scaling (A11Y-20), icon names spoken (A11Y-21), missing `<main>`/skip link (A11Y-23), reduced motion and spinner (A11Y-25), theme options and forced colours (A11Y-26), budget `ring-primary`, reminders switch with an empty name.
- **PWA (17):** PWA-02, 04, 08, 10 (part), 11, 13 (part), 19, 20, 21, 22, 23, 27, 28, 35, 37, 38, 40.
- **Security (13):** SEC-004, 005, 007, 010 (bypass), 011, 015, 016 (invalid key), 017, 018, 024 (removed creator), 025 (`sw.js` URL), 002 (shopping items, currency reset), 034, 035.
- **Finance (15):** FIN-04, 05, 06, 07, 09 (aspects), 17 (aspects), 18, 19 (aspect), 20 (aspects), 23, 25, 28, 30, 39, 40.
- **Infra (15):** INF-03, 04, 06 (expanded), 10 (expanded), 11 (expanded), 18, 25, 27, 28, 29, 32, 33 (part), 34, 36, plus new PRD gap rows (FX divergence, shopping list, transfer merge, default start view).

### 19.6 Not checked in either run
`pnpm audit` (CVEs), the Playwright suite, the Docker image build, real-device AT testing.

---

## 20. Phased roadmap

### Phase 1: must fix before launch

**Security and data integrity (blockers)**
- Sync push authorization and server-derived ownership: SEC-001, SEC-002, SEC-003, SEC-009, FIN-02, FIN-03, FIN-19.
- REST role helpers: SEC-004, SEC-024.
- Test backdoor, raw SMS logging and memory: SEC-008, SEC-005, INF-03, SEC-006, INF-05.
- Open redirect: SEC-010.
- Money schema and correctness: FIN-01, INF-07 (with a BigInt transport fix for FIN-18), FIN-04, FIN-05, FIN-06, FIN-07, FIN-10, FIN-13, FIN-14.
- Atomic, idempotent money routes: FIN-08, FIN-09, FIN-12, SEC-013, FIN-25, SEC-011, SEC-012, FIN-16, FIN-17.
- Sync cursor safety: FIN-15, SEC-019, INF-08.

**Mobile UX and accessibility (blockers for the PWA audience)**
- Primitives (Sheet/Dialog, Field, IconButton, Switch/Tabs, live announcer, AppHeader): A11Y-03, UI-65, PWA-33, A11Y-04, A11Y-09, A11Y-05, A11Y-06, A11Y-12, UI-93.
- Quick Add rebuild: A11Y-02, PWA-26, PWA-27, UI-70, UI-71, UI-72, UI-74, PWA-25, UI-95.
- Row buttons: A11Y-01, UI-32, PWA-34.
- Visible bugs: UI-24, UI-01, PWA-28, UI-02, A11Y-08, UI-43, A11Y-21, UI-44, UI-39, UI-29, PWA-38.
- Destructive actions and feedback: UI-79, UI-80, UI-19, PWA-12, UI-85, UI-53, UI-57, UI-58, UI-94.
- Contrast, focus, targets, FAB: A11Y-07, PWA-32, A11Y-13, UI-14, A11Y-15, UI-15, UI-48, UI-16, PWA-29, A11Y-14, A11Y-10.
- Honest reminders (hide the feature or label it unavailable until real push ships): PWA-01, PWA-02, UI-83, SEC-007, INF-06.
- Session expiry visible and non-destructive: PWA-13, SEC-018.

**Deployability**
- INF-01, INF-02, INF-13, SEC-022, INF-14, INF-15, INF-24, INF-09.

### Phase 2: soon after launch

- **Offline and SW:** PWA-07, INF-11, PWA-08, PWA-09, PWA-10, UI-89, PWA-11, PWA-14, PWA-15, INF-22.
- **Real web push:** PWA-03, PWA-04, PWA-05, PWA-06, SEC-016, INF-19, SEC-025, INF-34.
- **Install and shell:** PWA-16, PWA-17, PWA-19, PWA-20, PWA-21, PWA-22, PWA-23, PWA-24, UI-90.
- **Performance:** PWA-40, PWA-41, SEC-020, INF-28, FIN-26, FIN-28.
- **Accessibility structure:** A11Y-11, A11Y-16, A11Y-17, A11Y-18, A11Y-19, A11Y-20, A11Y-22, UI-40.
- **UX consistency:** UI-04, UI-05, UI-06, UI-08, UI-09, UI-10, UI-11, UI-13, UI-17, UI-18, UI-23, UI-25, UI-26, UI-27, UI-28, UI-30, UI-31, UI-33, UI-36, UI-45, UI-46, UI-47, UI-50, UI-51, UI-52, UI-55, UI-56, UI-59, UI-60, UI-61, UI-62, UI-63, UI-66, UI-67, UI-68, UI-73, UI-76, UI-77, UI-81, UI-82, UI-84, UI-86, UI-87, UI-88, UI-91, UI-92, PWA-30, PWA-31, PWA-36, PWA-39, A11Y-24, BF-01, BF-02, BF-03.
- **Security hardening:** SEC-014, SEC-015, INF-26, SEC-017, INF-04, SEC-021, SEC-023, SEC-034, INF-29, SEC-028, INF-31, INF-27, INF-18.
- **Finance follow-ups:** FIN-11, FIN-20, FIN-21, FIN-22, FIN-23, FIN-24, FIN-27, FIN-29.
- **Operations and tests:** INF-10, INF-12, INF-16, PWA-42, INF-17, SEC-035, INF-20, FIN-35, INF-21, SEC-033, INF-23, INF-25, INF-30.

### Phase 3: nice to have

- **Polish:** UI-03, UI-07, UI-12, UI-20, UI-21, UI-22 (desktop dashboard), UI-34, UI-35, UI-37, UI-38, UI-41, UI-42, UI-49, UI-54, UI-64, UI-69, UI-75, UI-78, PWA-18, PWA-35, PWA-37, BF-04.
- **Accessibility low items:** A11Y-23, A11Y-25, INF-36, A11Y-26, A11Y-27, A11Y-28, A11Y-29.
- **Low backend and finance items:** SEC-026, SEC-027, INF-32, SEC-029, SEC-030, SEC-031, FIN-38, SEC-032, FIN-30, FIN-31, FIN-32, FIN-33, FIN-34, FIN-36, FIN-37, FIN-39, FIN-40.
- **Hygiene:** INF-33, INF-35, INF-37.
- **PRD scope still open (§17):** export/import, System health page, "Link to existing" in the inbox, desktop dashboard, trend periods, default start view, i18n, visual snapshot tests, PLAN Step 21.

---

## 21. Appendix: per-area reports

All under `/Users/viran.malaka/projects/temp/hard-money/audit/2026-10-20-v2/`.

| File | Scope | IDs | Findings (C / H / M / L) |
|---|---|---|---|
| `ui-visual-design.md` | Screenshot-driven UI, visual design and mobile UX across every screen | UI-01…UI-95 | 95 (3 / 24 / 51 / 17) |
| `accessibility.md` | WCAG 2.2 AA audit, mobile PWA focus, contrast script, AST scans, predicted screen-reader walkthroughs | A11Y-01…A11Y-29 | 29 (2 / 8 / 12 / 7) |
| `pwa-mobile.md` | Manifest, service worker, push, iOS/Android shell, mobile forms, bundle size | PWA-01…PWA-42 | 42 (1 / 6 / 24 / 11) |
| `backend-security.md` | 48 API routes, auth, authorization, sync, SMS, cron, push, route inventory | SEC-001…SEC-035 | 35 (2 / 6 / 17 / 10) |
| `domain-financial.md` | Schema, finance-core, loans, FDs, cron money paths, sync money data | FIN-01…FIN-40 | 40 (3 / 12 / 14 / 11) |
| `infra-prd.md` | Toolchain, build, Docker, jobs, logging, tests, CI, PRD/PLAN gap table | INF-01…INF-37 | 37 (2 / 15 / 13 / 7) |
| `REPORT.md` (this file) | Master report; backfill BF-01…BF-04 | BF-01…BF-04 | 4 (0 / 0 / 2 / 2) |

Earlier run, for comparison only: `/Users/viran.malaka/projects/temp/hard-money/audit/2026-10-20/` (`backend-security.md`, `domain-financial.md`, `frontend-uiux.md`, `infra-prd.md`).

Screenshots: `/Users/viran.malaka/projects/temp/hard-money/audit/image.png`, `image2.png`, `image3.png`, `image4.png`, `image5.png`, `image6.png`, `image-desktop.png`.


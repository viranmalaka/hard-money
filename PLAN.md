# Hard Money — Implementation & Test Plan

> Companion to [What is this.md](What%20is%20this.md) (the requirements spec). This plan breaks the build into **ordered, independently testable steps**. Every step ends with **Playwright tests that run on both the Web (desktop) and Mobile viewports**, so no feature needs manual verification. Anything Playwright cannot verify is listed in [Section C](#c-features-that-cannot-be-fully-verified-by-playwright).

**How to use this plan**: implement steps top to bottom. A step is _done_ only when its Playwright suite is green on **both** projects (`web` and `mobile`) **and** all earlier suites still pass (regression gate). Do not start the next step until then.

---

## A. Test Strategy & Conventions (applies to every step)

### A.1 Playwright projects (both viewports are mandatory)

| Project         | Device / viewport                                    | Purpose                                              |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `web`           | Desktop Chrome, 1440×900                             | Sidebar layout, multi-column dashboard, hover states |
| `mobile`        | Pixel 7 emulation (`isMobile`, `hasTouch`, 412×915)  | Bottom nav, FAB, bottom sheets, touch input          |
| `mobile-safari` | iPhone 14 (WebKit) — **smoke tests only** (`@smoke`) | Catches WebKit/IndexedDB/PWA differences             |

- **Every test runs on `web` and `mobile` by default.** A test may be restricted to one viewport only if the feature itself is viewport-specific (marked `[W]` or `[M]` in the tables below).
- `timezoneId: "Asia/Colombo"`, `locale: "en-LK"` set globally in `playwright.config.ts`.
- The app is tested against a **production build** (`next build && next start`) because offline/PWA behavior needs the real service worker. `webServer` in the config starts web + worker + a throw-away Postgres (Docker or Testcontainers).
- Retries: 1 on CI, 0 locally. Trace/video on first retry.

### A.2 Shared test infrastructure (built in Step 0, reused everywhere)

| Helper                                     | Behavior                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test API** `/api/test/*`                 | Exists only when `E2E_MODE=1`. Endpoints: `reset` (truncate DB), `seed` (create users/accounts/transactions from a JSON fixture), `clock` (set server "now"), `tick` (run scheduler once), `gemini` (queue a mocked Gemini response), `snapshot` (dump derived balances for assertions). |
| **Nav helper** `app.go("accounts")`        | Resolves to the **bottom nav** on mobile and the **sidebar** on desktop, so one spec works for both viewports.                                                                                                                                                                           |
| **Quick-Add helper** `app.quickAdd({...})` | Opens the FAB sheet (mobile) / "Add" button or panel (desktop), fills fields using the on-screen keypad, saves.                                                                                                                                                                          |
| **Money assertions**                       | `expectMoney(locator, "LKR 1,780.00")`; `expectBalance(page, "Savings", 125000)` reads the visible balance and compares to the Test API snapshot.                                                                                                                                        |
| **Auth fixtures**                          | `userA`, `userB` (storage-state files) for multi-user and household tests; each user in a **separate browser context**.                                                                                                                                                                  |
| **Offline helper**                         | `context.setOffline(true/false)` plus `await app.waitForSyncIdle()` (waits on a `data-sync-state="idle"` attribute).                                                                                                                                                                     |
| **Clock control**                          | Client: `page.clock.install({ time })`. Server: Test API `clock`. Both set together by `app.setNow("2026-10-20T10:00:00+05:30")`.                                                                                                                                                        |
| **Webhook client**                         | `request.post("/api/v1/webhooks/sms-ingress", { headers: { "x-api-key": ... }, data })` using Playwright's `APIRequestContext` (no browser).                                                                                                                                             |
| **Gemini mock**                            | Server runs with `GEMINI_PROVIDER=mock`. Tests queue responses via the Test API. **No test ever calls the real Gemini.**                                                                                                                                                                 |
| **Visual snapshots** (sparingly)           | `toHaveScreenshot()` on a few stable screens (Trans. daily, Accounts, Quick-Add sheet) per viewport and theme, with `maxDiffPixelRatio: 0.01`, to protect the flat design.                                                                                                               |

### A.3 Conventions

- Every interactive element has a stable `data-testid` (kebab-case, e.g., `quick-add-fab`, `tx-row`, `settle-card-btn`). Tests never select by CSS class or text that may be localized.
- **Test data uses round numbers** (documented per step) so expected values can be asserted literally.
- **Each step's tests are tagged** (`@s05`) so a step can be run alone: `npx playwright test --grep @s05`. Smoke subsets are tagged `@smoke`.
- **Regression gate**: before closing step N, run `--grep "@s0|@s1|..."` for all previous steps, i.e., the full suite so far.
- **Unit/integration tests (Vitest)** for the `finance-core` math accompany each step; they are listed under _Scenarios_ and are written first (TDD for money math), but the **Playwright table is the acceptance gate**.
- Test IDs follow `S{step}-{nn}`; the viewport column says `W+M` (both), `W` (web only) or `M` (mobile only).

### A.4 Definition of Done (per step)

1. Feature implemented to the spec sections referenced.
2. Vitest unit/integration tests green.
3. Playwright specs for the step written and green on `web` and `mobile`.
4. Full earlier suite still green.
5. No `test.fixme`/skipped tests remain without an entry in Section C.

---

## B. Ordered Implementation Steps

### Progress tracker

| #   | Step                                                           | Spec refs               | Status |
| --- | -------------------------------------------------------------- | ----------------------- | ------ |
| 0   | Repo, tooling & test harness                                   | Sec 1, A (this doc)     | ☑      |
| 1   | App shell & flat design system                                 | Sec 5.0                 | ☑      |
| 2   | Auth & user settings                                           | Sec 1 (Auth), 3.A       | ☑      |
| 3   | Offline data layer & sync engine (with Accounts/Categories)    | Sec 2.6, 2.7, 3.B, 4.S6 | ☑      |
| 4   | Accounts & Categories management UI                            | Sec 3.B, 3.D            | ☑      |
| 5   | Quick-Add, keypad & ledger core (expense/income/transfer)      | Sec 2.1, 2.3, 4.S3      | ☑      |
| 6   | Trans. tab views (Daily / Calendar / Monthly / Summary)        | Sec 5.0                 | ☑      |
| 7   | Edit/delete, splits & bookmark templates                       | Sec 2.4, 2.5, 4.S3      | ☑      |
| 8   | Balance calibration                                            | Sec 4.S7                | ☑      |
| 9   | Stats tab                                                      | Sec 5.0                 | ☑      |
| 10  | Budgets & safe-to-spend                                        | Sec 4.S4, 3.F           | ☑      |
| 11  | Scheduler infrastructure & budget rollover                     | Sec 1 (Jobs), 2.7, 4.S4 | ☑      |
| 12  | Credit cards: cycles, available credit & settlement            | Sec 4.S2.1, 4.S2.3      | ☑      |
| 13  | 0% installment plans                                           | Sec 4.S2.2, 3.C         | ☑      |
| 14  | SMS ingress, archival & template parsing                       | Sec 4.S1 (steps 1-2a)   | ☑      |
| 15  | Gemini fallback, validation gate & review inbox                | Sec 4.S1 (step 2b-4)    | ☐      |
| 16  | Transaction ingestion service (dedupe, ATM, deposits, refunds) | Sec 4.S1 (step 3)       | ☐      |
| 17  | Fixed deposits                                                 | Sec 4.S5.1, 3.G         | ☐      |
| 18  | Loans & leases                                                 | Sec 4.S5.2, 3.H         | ☐      |
| 19  | Household collaboration & role enforcement                     | Sec 3.A, 4.S6           | ☐      |
| 20  | PWA, offline shell & push reminders                            | Sec 1 (PWA)             | ☐      |
| 21  | Export/import, system health & final hardening                 | Sec 6                   | ☐      |

---

### Step 0 — Repo, Tooling & Test Harness

**Goal**: an empty but fully wired project where tests can already run on both viewports.

**Build**

- Monorepo: `apps/web` (Next.js App Router, TS, Tailwind, shadcn/ui, tRPC, Prisma), `apps/worker`, `packages/finance-core`.
- Docker Compose: `web`, `worker`, `postgres`; `.env.example` with all required variables.
- Vitest setup; Playwright with the three projects, `webServer`, global setup/teardown.
- The Test API (`/api/test/*`, gated by `E2E_MODE`), Auth/Nav/Quick-Add/Money/Offline helpers (stubs where features don't exist yet).
- CI workflow: lint → typecheck → vitest → playwright (`web`, `mobile`) → upload traces.

**Scenarios**

- The app boots from `docker compose up` and the health endpoint returns OK.
- Test API refuses all calls when `E2E_MODE` is unset (security check).
- `reset` leaves an empty DB; `clock` changes the server time.

**Playwright (write & run)**

| ID     | Test                                                                                                                           | Viewport |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| S00-01 | Home page loads with HTTP 200, no console errors                                                                               | W+M      |
| S00-02 | Playwright config runs a trivial spec on both `web` and `mobile` projects (assert `isMobile` differs and viewport sizes match) | W+M      |
| S00-03 | `/api/test/reset` returns 200 when `E2E_MODE=1`; a second run of the server without it returns 404 (API-level test)            | W+M      |
| S00-04 | `/api/test/clock` sets "now"; `GET /api/health` reflects the overridden time                                                   | W+M      |

**Exit**: `npx playwright test --grep @s00` green on both projects in CI.

---

### Step 1 — App Shell & Flat Design System

**Goal**: the navigation frame and the visual language, so every later screen reuses them.

**Build** (Sec 5.0)

- Design tokens as CSS variables (light/dark, income/expense/transfer/warning), typography, spacing, radius.
- Mobile: sticky bottom nav `[Trans., Stats, Budget, Accounts, More]`, FAB placeholder, bottom-sheet component.
- Desktop: collapsible sidebar (same destinations + Dashboard), centered panel layout.
- Reusable components: summary bar (Income·Expense·Total), month switcher, list row, section header, segmented text tabs, progress bar, empty state.
- Theme: system default + manual light/dark toggle; income/expense color swap setting (stored locally for now).

**Scenarios**

- Navigation renders the correct layout per viewport (bottom nav vs sidebar).
- Every nav destination routes and shows its empty state.
- Dark/light theme tokens apply; contrast meets WCAG AA for text/background and income/expense colors.
- Color swap exchanges income and expense colors everywhere the tokens are used.
- Flat-design rules hold (no `box-shadow` on cards, hairline borders).

**Playwright (write & run)**

| ID     | Test                                                                                              | Viewport |
| ------ | ------------------------------------------------------------------------------------------------- | -------- |
| S01-01 | Bottom nav is visible with 5 tabs and sidebar is hidden                                           | M        |
| S01-02 | Sidebar is visible and collapsible; bottom nav is hidden; collapse state persists after reload    | W        |
| S01-03 | `app.go(tab)` reaches each of Trans., Stats, Budget, Accounts, More; active item is highlighted   | W+M      |
| S01-04 | Each page shows its empty state and has exactly one `<h1>`                                        | W+M      |
| S01-05 | Theme toggle switches light/dark; `--bg` computed value changes; preference persists after reload | W+M      |
| S01-06 | Income/expense color swap: the computed color of `[data-testid=income-amount]` swaps with expense | W+M      |
| S01-07 | Accessibility scan with `@axe-core/playwright` has no AA contrast violations in light and dark    | W+M      |
| S01-08 | Visual snapshots of the shell (light + dark) match baseline                                       | W+M      |
| S01-09 | No horizontal scroll at 320 px width and at 1440 px (`document.scrollWidth <= innerWidth`)        | W+M      |

**Exit**: `@s01` green on both projects.

---

### Step 2 — Authentication & User Settings

**Goal**: users can register, log in, and set their basics.

**Build** (Sec 1 Auth, 3.A `User`)

- Auth.js Credentials (Argon2id), `ALLOW_REGISTRATION` flag, session cookies, logout.
- Settings page (inside More): name, timezone, default currency, color preferences, theme.
- Route protection and redirect-after-login.
- Seeded system categories created on first user creation.

**Scenarios**

- Register → logged in → lands on Trans. tab.
- Wrong password shows an error and does not leak whether the email exists.
- Duplicate email is rejected.
- With `ALLOW_REGISTRATION=false`, the register page/API refuses sign-up.
- Unauthenticated access to any app route redirects to login; authenticated access to login redirects to the app.
- Timezone change persists and is returned by the API.
- Default categories (Groceries, Dining, …, Balance Calibration) exist for a new user.

**Playwright (write & run)**

| ID     | Test                                                                                                            | Viewport |
| ------ | --------------------------------------------------------------------------------------------------------------- | -------- |
| S02-01 | Register a new user, land on Trans. tab, user name visible in More                                              | W+M      |
| S02-02 | Log out, log in with the same credentials                                                                       | W+M      |
| S02-03 | Invalid password shows a generic error; no redirect                                                             | W+M      |
| S02-04 | Duplicate email registration shows an error                                                                     | W+M      |
| S02-05 | Server with `ALLOW_REGISTRATION=false`: register route shows "registration closed" (separate webServer project) | W+M      |
| S02-06 | Visiting `/accounts` unauthenticated redirects to login and back after login                                    | W+M      |
| S02-07 | Change timezone and currency in Settings; reload; values persisted                                              | W+M      |
| S02-08 | New user has the default category set (visible in the category picker later; here via API)                      | W+M      |
| S02-09 | Login form is usable by keyboard only (tab order, Enter submits)                                                | W        |
| S02-10 | Login form inputs are not obscured by the on-screen keyboard viewport (input scrolled into view after focus)    | M        |

**Exit**: `@s02` green; all earlier suites green.

---

### Step 3 — Offline Data Layer & Sync Engine (Accounts & Categories as first entities)

**Goal**: the offline-first backbone proven end-to-end before any complex feature depends on it.

**Build** (Sec 2.6, 2.7, 4.S6)

- Prisma models with `serverSeq`, `updatedAt`, `deletedAt`; a single sequence for `serverSeq`.
- Dexie stores, namespaced per user; versioned migration scaffold; `outbox` and `syncMeta`.
- tRPC `sync.push` (batched, idempotent by `mutationId`, per-mutation authorization hook) and `sync.pull` (cursor, tombstones).
- Sync scheduler on the client: on start, on reconnect, after each local write; `data-sync-state` attribute (`idle|syncing|offline|error`) and a small status indicator in the shell.
- First synced entities: `Account`, `Category`.

**Scenarios**

- Local write appears immediately without network; server receives it after sync.
- Retrying the same `mutationId` creates one row.
- Pull returns only rows with `serverSeq > cursor`, including tombstones; deleted rows disappear on the other device.
- Two devices editing the same record: last write arriving at the server wins; both converge.
- Rejected mutation (e.g., invalid payload) is reported and stays visible, other mutations in the batch succeed.
- Dexie DB is per-user (user B never sees user A's data on a shared browser).
- Dexie migration from v1 → v2 preserves data (migration test).

**Playwright (write & run)**

| ID     | Test                                                                                                                                          | Viewport |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S03-01 | Create an account while **offline** (`setOffline(true)`); it appears instantly; indicator shows "offline/pending"                             | W+M      |
| S03-02 | Go back online; `waitForSyncIdle`; the account exists on the server (Test API snapshot)                                                       | W+M      |
| S03-03 | Two contexts (device 1 / device 2, same user): create on device 1 → appears on device 2 after sync                                            | W+M      |
| S03-04 | Delete on device 1 → disappears from device 2 (tombstone propagated)                                                                          | W+M      |
| S03-05 | Edit the same account name on both devices offline, reconnect device 1 then device 2 → both converge to device 2's value                      | W+M      |
| S03-06 | Reload the page while offline → data still shown from IndexedDB (no network request needed)                                                   | W+M      |
| S03-07 | Force a failing mutation (invalid name length via Test API hook): error badge shown; valid sibling mutation still synced                      | W+M      |
| S03-08 | Replay-safety: intercept the push request, return a network error after the server has applied it; client retries; exactly one account exists | W+M      |
| S03-09 | Log in as user B in the same browser profile after user A: B sees none of A's accounts                                                        | W+M      |
| S03-10 | Sync indicator is visible in the mobile header and the desktop sidebar footer and reflects state changes                                      | W+M      |
| S03-11 | `@smoke` offline create + reconnect on WebKit                                                                                                 | iPhone   |

**Exit**: `@s03` green on both projects (+ smoke on WebKit).

---

### Step 4 — Accounts & Categories Management UI

**Goal**: users can model their money containers and categories.

**Build** (Sec 3.B, 3.D `Category`, Sec 5.0 Accounts tab)

- Accounts tab: grouped sections (Cash, Bank accounts, Credit Cards), group subtotals, net-worth header (assets/liabilities/total — initially from opening balances only).
- Create/edit/archive account: name, type, opening balance, last-4 digits, bank sender IDs, fee rules; credit card fields (limit, cutoff day, due day, linked settlement account).
- Account detail view shell (balance, empty history).
- Category management (More → Categories): create/edit/delete, icon + color picker (flat solid circle).

**Scenarios**

- Opening balance is stored in minor units (LKR 1,250.50 → 125050) and displayed back with two decimals.
- Credit card requires limit, cutoff day (1–31) and due day (1–31); validation messages shown otherwise.
- Group subtotals and the net-worth header equal the sum of accounts (credit-card debt counts as a liability).
- Archived accounts are hidden from pickers but kept in history.
- System categories cannot be deleted; user categories can be renamed; deleting a category in use asks for a replacement.
- Contributor-only fields (e.g., last-4, sender IDs) accept only valid formats.

**Playwright (write & run)**

| ID     | Test                                                                                                 | Viewport |
| ------ | ---------------------------------------------------------------------------------------------------- | -------- |
| S04-01 | Create Cash account (opening 5,000.00) → appears under Cash with correct balance and subtotal        | W+M      |
| S04-02 | Create Bank Savings (opening 100,000.00, last4 `1234`, sender `COMBANK`) → shown under Bank accounts | W+M      |
| S04-03 | Create Credit Card (limit 500,000, cutoff 20, due 10, settlement = Savings) → shown with limit       | W+M      |
| S04-04 | Credit card form validation: missing limit / cutoff 32 / due 0 → inline errors, nothing saved        | W+M      |
| S04-05 | Net-worth header: assets 105,000.00, liabilities 0, total 105,000.00                                 | W+M      |
| S04-06 | Edit account name and opening balance → list and header update                                       | W+M      |
| S04-07 | Archive an account → hidden from list and pickers; "Show archived" reveals it                        | W+M      |
| S04-08 | Create category (name, icon, color) → appears in More → Categories and in the picker                 | W+M      |
| S04-09 | Delete an unused category succeeds; deleting a system category is not offered                        | W+M      |
| S04-10 | Account creation uses a bottom sheet on mobile and a side panel/dialog on desktop                    | W+M      |
| S04-11 | Visual snapshot of Accounts tab with three account types                                             | W+M      |

**Exit**: `@s04` green; regression green.

---

### Step 5 — Quick-Add, Keypad & Ledger Core (Expense / Income / Transfer)

**Goal**: record transactions, with all balances derived from the ledger.

**Build** (Sec 2.1, 2.3, 4.S3)

- `Transaction` entity synced offline-first; `finance-core` ledger functions (`ledgerEffect`, `balance`), integer minor units, half-up rounding.
- Quick-Add: FAB → full-height bottom sheet (mobile) / dialog (desktop) with **Income | Expense | Transfer** switch, date, account, category grid, note.
- Embedded arithmetic keypad (`+ − × ÷ =`), safe parser (no `eval`), live formula preview, `inputmode="none"` on the amount field so the system keyboard never opens.
- "Save" and "Continue" (save and add another).
- Derived balances shown on Accounts and account detail; net-worth header now ledger-based.
- Transfer rows (`accountId` → `toAccountId`).

**Scenarios**

- `1250 + 450 + 80 =` → 1,780.00; `1000 ÷ 3` → 333.33 (half-up); operator precedence (`2 + 3 × 4 = 14`); division by zero rejected; leading-operator and double-operator edge cases.
- Expense reduces the account balance; income increases it; transfer moves money between accounts with total unchanged.
- Credit card expense makes the card balance negative; outstanding debt shows positive.
- Saving without account/category/amount is blocked.
- The ledger is the source of truth: reloading from IndexedDB gives identical balances; deleting `balanceCache` changes nothing.
- Transaction created offline syncs and the server-recomputed balance equals the client's.

**Playwright (write & run)**

| ID     | Test                                                                                                               | Viewport |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------- |
| S05-01 | FAB (mobile) / Add button (desktop) opens the Quick-Add sheet                                                      | W+M      |
| S05-02 | Keypad: type `1250+450+80` → live result `1,780.00` → `=` → amount shows `1,780.00`                                | W+M      |
| S05-03 | Keypad: `2+3×4` → `14.00`; `1000÷3` → `333.33`; `5÷0` shows an error and Save disabled                             | W+M      |
| S05-04 | Amount field does not open the OS keyboard (`inputmode=none`, no focus-induced viewport resize on mobile)          | M        |
| S05-05 | Physical keyboard input of digits/operators also works in the amount field                                         | W        |
| S05-06 | Save an expense 1,780 from Cash (5,000) → Cash balance 3,220.00; account detail lists the row with `-` in red      | W+M      |
| S05-07 | Save income 50,000 to Savings (100,000) → 150,000.00; row shows `+` in blue                                        | W+M      |
| S05-08 | Transfer 10,000 Savings → Cash: Savings -10,000, Cash +10,000, net worth unchanged, row neutral grey               | W+M      |
| S05-09 | Credit card expense 20,000 → card shows Outstanding 20,000; net-worth liabilities 20,000                           | W+M      |
| S05-10 | "Continue" saves and keeps the sheet open with cleared amount; "Save" closes the sheet                             | W+M      |
| S05-11 | Validation: no category / amount 0 → Save blocked with messages                                                    | W+M      |
| S05-12 | Offline: add an expense with network off; balance updates instantly; after reconnect server snapshot matches UI    | W+M      |
| S05-13 | Reload → balances identical (derived from IndexedDB ledger)                                                        | W+M      |
| S05-14 | Quick-Add is reachable from every tab (Trans., Stats, Budget, Accounts, More) on mobile; sidebar button on desktop | W+M      |
| S05-15 | Date defaults to today (Asia/Colombo) and can be changed with the picker                                           | W+M      |
| S05-16 | Visual snapshot of the Quick-Add sheet (Expense/Income/Transfer variants)                                          | W+M      |

**Exit**: `@s05` green; regression green.

---

### Step 6 — Trans. Tab Views (Daily / Calendar / Monthly / Summary)

**Goal**: browse and understand transactions with the Realbyte-inspired layouts.

**Build** (Sec 5.0)

- Period header with month switcher (buttons + swipe on mobile), summary bar (Income · Expense · Total).
- **Daily** view: grouped by date with day subtotals. **Calendar** view: month grid with per-day income/expense, tap a day to reveal that day's list beneath. **Monthly** and **Summary** views.
- Top-bar actions: Search (text), Filter (account/category/type), start-view setting.
- Row styling per type (income/expense/transfer, split tag, SMS glyph placeholder, calibration badge placeholder).

**Scenarios**

- Summary equals the sum of non-excluded rows for the month; transfers are not counted; excluded-from-stats rows are not counted.
- Month switching changes the data; today's date outlined; days with no data are blank.
- Search matches note, category and amount; filters combine with AND; clearing restores the list.
- Large data (e.g., 1,000 rows seeded) renders with list virtualization and scroll stays smooth (no layout break).
- Timezone edge: a transaction at 23:30 Colombo time on the 31st stays in that month.

**Playwright (write & run)**

| ID     | Test                                                                                        | Viewport |
| ------ | ------------------------------------------------------------------------------------------- | -------- |
| S06-01 | Seed 8 transactions across 3 days; Daily view groups by date with correct day subtotals     | W+M      |
| S06-02 | Summary bar: Income/Expense/Total match seeded values; transfers excluded                   | W+M      |
| S06-03 | Month switcher ‹ › changes the month and the data; header text updates                      | W+M      |
| S06-04 | Swipe left/right changes month (touch gesture)                                              | M        |
| S06-05 | Keyboard arrow buttons / click navigation on the month switcher                             | W        |
| S06-06 | Calendar view: cells show day income (blue) and expense (red); today is outlined            | W+M      |
| S06-07 | Tap a day in Calendar → that day's list appears beneath the grid (not a modal)              | W+M      |
| S06-08 | Calendar and detail list display side by side on desktop; stacked on mobile                 | W+M      |
| S06-09 | Monthly and Summary views show per-month totals consistent with Daily                       | W+M      |
| S06-10 | Search by note/category/amount narrows the list; clear restores                             | W+M      |
| S06-11 | Filter by account + category + type returns the intersection                                | W+M      |
| S06-12 | Seed 1,000 rows: initial render < 2 s; scroll to bottom renders last row; no console errors | W+M      |
| S06-13 | 23:30 transaction on the 31st counts for that month, not the next                           | W+M      |
| S06-14 | Default start view setting (Daily/Calendar) is honored after reload                         | W+M      |
| S06-15 | Visual snapshots: Daily and Calendar (light/dark)                                           | W+M      |

**Exit**: `@s06` green; regression green.

---

### Step 7 — Edit/Delete, Splits & Bookmark Templates

**Goal**: full transaction lifecycle plus speed features.

**Build** (Sec 2.4, 2.5, 4.S3)

- Open a transaction → edit all fields; delete (soft) with confirm; cascade rules (splits, fee child).
- Split transaction: sum of split items must equal total; parent category cleared; analytics use split items.
- Bookmarks (`TransactionTemplate`): create from a transaction or manually; chips at the top of Quick-Add pre-fill account/category/note/amount; manage in More.
- `excludeFromBudget` toggle in Quick-Add.
- Reversal link UI for refunds (`REFUND` type entry linked to an original).

**Scenarios**

- Editing amount/account/date recomputes balances and period totals immediately.
- Deleting restores the balance; undo (snackbar) re-creates it (same ID, tombstone cleared).
- Split 1,000 = 600 Groceries + 400 Dining: both categories show in analytics; mismatch (e.g., 600 + 300) blocks save and shows the remaining amount.
- Bookmark chip pre-fills the fields; editing after pre-fill does not change the template.
- A refund linked to an original reduces category spending in the refund's month.
- Delete original while a reversal exists is blocked with an explanation.

**Playwright (write & run)**

| ID     | Test                                                                                           | Viewport |
| ------ | ---------------------------------------------------------------------------------------------- | -------- |
| S07-01 | Tap a row → detail opens; edit amount 1,000 → 1,500 → balance and summary update               | W+M      |
| S07-02 | Move a transaction to another account → both balances correct                                  | W+M      |
| S07-03 | Delete with confirm → row gone, balance restored; "Undo" brings it back                        | W+M      |
| S07-04 | Delete syncs: delete on device 1, device 2 loses the row (two contexts)                        | W+M      |
| S07-05 | Split toggle: 600 Groceries + 400 Dining saves; list shows "Split" tag                         | W+M      |
| S07-06 | Split mismatch shows "LKR 100.00 remaining" and blocks Save                                    | W+M      |
| S07-07 | Split row appears in both categories in the category filter                                    | W+M      |
| S07-08 | Create a bookmark "Morning Milk" (Cash, Groceries, 250) → chip appears on top of Quick-Add     | W+M      |
| S07-09 | Tap the bookmark chip → fields pre-filled; Save creates the row; template unchanged after edit | W+M      |
| S07-10 | Manage bookmarks in More: rename, delete                                                       | W+M      |
| S07-11 | Refund linked to an original expense: category spending reduced in the refund month            | W+M      |
| S07-12 | Deleting an original with an existing reversal shows a blocking message                        | W+M      |
| S07-13 | "Exclude from budget" toggle persists on the row (badge visible)                               | W+M      |
| S07-14 | Bookmark chips scroll horizontally by touch on mobile; wrap or scroll with mouse on desktop    | W+M      |

**Exit**: `@s07` green; regression green.

---

### Step 8 — Balance Calibration

**Goal**: 1-tap alignment with real balances, with a clean audit trail.

**Build** (Sec 4.S7, 2.4)

- "Calibrate Balance" in Account Detail → reconciliation sheet: current computed balance, real balance input (embedded keypad), live delta with `+`/`-`, optional note.
- Creates an `ADJUSTMENT` / `BALANCE_CALIBRATION` transaction (`direction`, `excludeFromBudget`, `excludeFromStats`), category "Balance Calibration".
- Distinct row styling (scale icon, `+`/`-` badge); separate "Adjustments" line in cashflow summary.
- Credit-card calibration labeled for outstanding debt basis.

**Scenarios**

- App 5,000; real 5,250 → delta +250 (green/blue positive) → balance 5,250.
- App 5,000; real 4,800 → delta −200 → balance 4,800.
- Real equals app → "Nothing to adjust", no transaction created.
- Calibration does not change budget "spent" or income/expense totals; appears in Adjustments line.
- Net worth reflects the corrected balance.
- Credit card: app debt 20,000; real debt 18,500 → adjustment `IN` 1,500; available credit recomputed.

**Playwright (write & run)**

| ID     | Test                                                                                                     | Viewport |
| ------ | -------------------------------------------------------------------------------------------------------- | -------- |
| S08-01 | Open Calibrate from Account Detail; sheet shows the current computed balance                             | W+M      |
| S08-02 | Enter real 5,250 (app 5,000) → delta `+250.00` shown live; Save → balance 5,250.00                       | W+M      |
| S08-03 | Enter real 4,800 → delta `-200.00`; Save → 4,800.00                                                      | W+M      |
| S08-04 | Real equals app → message "Nothing to adjust"; no new row                                                | W+M      |
| S08-05 | Calibration row has the scale icon and `+`/`-` badge in the feed                                         | W+M      |
| S08-06 | Budget spent and Income/Expense summary unchanged after calibration; Adjustments line shows the delta    | W+M      |
| S08-07 | Net worth header reflects the new balance                                                                | W+M      |
| S08-08 | Credit card calibration: debt 20,000 → 18,500 yields +1,500 adjustment and updated available credit      | W+M      |
| S08-09 | Optional note saved and visible in the row detail                                                        | W+M      |
| S08-10 | Calibrate offline then reconnect; server balance equals UI                                               | W+M      |
| S08-11 | Reconciliation sheet is a bottom sheet on mobile, dialog on desktop; keypad has no OS keyboard on mobile | W+M      |

**Exit**: `@s08` green; regression green.

---

### Step 9 — Stats Tab

**Goal**: category analytics with flat charts.

**Build** (Sec 5.0)

- Period switcher; Expense/Income toggle; flat donut chart; ranked list (icon, name, % chip, amount); tap a category → its transactions; Trend view (weekly/monthly/yearly).
- Uses split items and honors `excludeFromStats`; transfers and calibration excluded.

**Scenarios**

- Percentages sum to 100% (largest-remainder rounding); donut segments equal list values.
- Split transactions distribute across categories.
- Excluded rows and transfers are not in totals.
- Income toggle shows income categories only.
- Empty period shows an empty state.

**Playwright (write & run)**

| ID     | Test                                                                                            | Viewport |
| ------ | ----------------------------------------------------------------------------------------------- | -------- |
| S09-01 | Seeded month: ranked list order and amounts match expected values                               | W+M      |
| S09-02 | Percentage chips sum to 100%                                                                    | W+M      |
| S09-03 | Donut chart segment values (via `aria-label`/data attributes) match the list                    | W+M      |
| S09-04 | Split transaction contributes to both categories                                                | W+M      |
| S09-05 | Excluded-from-stats row, transfer and calibration are not counted                               | W+M      |
| S09-06 | Expense/Income toggle switches data set                                                         | W+M      |
| S09-07 | Tap a category → filtered transaction list with matching total                                  | W+M      |
| S09-08 | Month switcher updates the chart; empty month shows empty state                                 | W+M      |
| S09-09 | Trend view shows 6 monthly bars with values matching seeded totals                              | W+M      |
| S09-10 | Chart and list are side by side on desktop, stacked on mobile; chart has no horizontal overflow | W+M      |
| S09-11 | Visual snapshot of Stats (light/dark)                                                           | W+M      |

**Exit**: `@s09` green; regression green.

---

### Step 10 — Budgets & Safe-to-Spend (without rollover)

**Goal**: monthly category budgets with live progress.

**Build** (Sec 4.S4, 3.F)

- `Budget` entity (personal scope); Budget tab: per-category flat progress bars (limit, spent, remaining), warning/over states, Safe-to-Spend daily figure, overall total.
- Spent = non-excluded expenses (split-aware) − refunds in month.
- Add/edit/delete budgets; `excludeFromBudget` honored.

**Scenarios**

- Limit 30,000; spent 12,000 → remaining 18,000; bar 40%.
- ≥ 80% shows warning color; > 100% shows over-budget state (no negative daily rate).
- Safe-to-spend = (limit − spent) / remaining days including today (e.g., 18,000 / 18 days = 1,000.00/day on a fixed date).
- Excluded and calibration rows do not count; refunds reduce spent.
- Budget for a category with split items counts only the split portion.

**Playwright (write & run)**

| ID     | Test                                                                                              | Viewport |
| ------ | ------------------------------------------------------------------------------------------------- | -------- |
| S10-01 | Create budget Groceries 30,000 → row with 0% bar                                                  | W+M      |
| S10-02 | Add 12,000 grocery expenses → spent 12,000, remaining 18,000, bar 40%                             | W+M      |
| S10-03 | Spend to 25,000 (≥ 80%) → bar turns warning color                                                 | W+M      |
| S10-04 | Spend to 32,000 → "over budget by 2,000"; daily safe-to-spend shows 0 / over state                | W+M      |
| S10-05 | With server/client clock fixed at the 13th of a 30-day month, safe-to-spend equals expected value | W+M      |
| S10-06 | Excluded-from-budget and calibration rows do not change spent                                     | W+M      |
| S10-07 | Refund reduces spent                                                                              | W+M      |
| S10-08 | Split transaction counts only the Groceries portion                                               | W+M      |
| S10-09 | Edit and delete a budget; totals update                                                           | W+M      |
| S10-10 | Budget works offline and syncs                                                                    | W+M      |
| S10-11 | Visual snapshot of Budget tab with ok/warning/over bars                                           | W+M      |

**Exit**: `@s10` green; regression green.

---

### Step 11 — Scheduler Infrastructure & Budget Rollover

**Goal**: the background-job backbone (reused by installments, statements, FD payouts) plus symmetric rollover.

**Build** (Sec 1 Jobs, 2.7, 4.S4)

- `apps/worker` with pg-boss; catch-up job framework; `POST /api/v1/cron/tick` (CRON_SECRET) running the same idempotent jobs; advisory-lock catch-up on sync.
- Test hooks: server clock override (Test API) and `tick`.
- `BudgetMonthSnapshot` month-close job with deterministic IDs; `enableRollover`, `rolloverStartMonth`; carried-in logic (surplus and deficit).
- Budget UI shows carried-over chip and "Available = limit + carried".

**Scenarios**

- Month 1: limit 30,000, spent 22,000 → month 2 carried +8,000 → available 38,000.
- Month 1: spent 35,000 → carried −5,000 → available 25,000 (deficit penalizes).
- Run `tick` twice → no duplicate snapshots (deterministic ID).
- Skipping 3 months then running `tick` once → all intermediate snapshots created (catch-up).
- Back-dated transaction in a closed month → affected snapshots recomputed.
- `tick` without/with a wrong `CRON_SECRET` is rejected (401).

**Playwright (write & run)**

| ID     | Test                                                                                                                    | Viewport |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| S11-01 | `tick` API: wrong/missing secret → 401; correct secret → 200 (API test)                                                 | W+M      |
| S11-02 | Rollover on: spend 22,000 of 30,000; advance clock to next month; `tick`; budget shows carried +8,000, available 38,000 | W+M      |
| S11-03 | Deficit: spend 35,000; next month shows carried −5,000, available 25,000                                                | W+M      |
| S11-04 | Run `tick` twice; snapshot count unchanged (Test API snapshot)                                                          | W+M      |
| S11-05 | Jump the clock 3 months, single `tick`; all months' snapshots exist; chain values correct                               | W+M      |
| S11-06 | Add a back-dated expense to a closed month; carried-in of later months recalculates                                     | W+M      |
| S11-07 | Rollover disabled budget shows no carried chip                                                                          | W+M      |
| S11-08 | Month-close handled in the user's timezone: transaction at 23:59 Colombo on the last day belongs to the closing month   | W+M      |
| S11-09 | The UI picks up server-generated snapshots after sync without a reload                                                  | W+M      |

**Exit**: `@s11` green; regression green.

---

### Step 12 — Credit Cards: Cycles, Available Credit & 1-Tap Settlement

**Goal**: correct billed/unbilled math and settlements.

**Build** (Sec 4.S2.1, 4.S2.3, 2.2)

- `finance-core`: cycle boundaries with short-month clamping and timezone; `DebtAtCutoff`, `PaymentsSinceCutoff`, `BilledDue` (FIFO), `Unbilled`, `AvailableCredit` (no installments yet).
- `CreditCardStatement` snapshot job (deterministic ID) on the scheduler.
- Accounts tab credit-card card: Billed Due, due-date countdown, Available Credit, "Settle" button; card detail with statements.
- Settle modal: chips (Full Billed Due, Total Outstanding, Custom), source account, creates `TRANSFER`/`CC_SETTLEMENT`.

**Scenarios** (cutoff 20, due 10, limit 500,000)

- Spends before cutoff 20 Oct: 30,000 → on 21 Oct: Billed Due 30,000; new spend 5,000 → Unbilled 5,000; Outstanding 35,000; Available 465,000.
- Settle Full Due 30,000 from Savings → Billed 0, Savings −30,000, card balance −5,000, expenses unchanged (transfer).
- Settle Total (35,000) → Outstanding 0.
- Custom 10,000 partial → Billed 20,000 (FIFO).
- Overpayment 40,000 on Outstanding 35,000 → card credit +5,000, no negative unbilled.
- Cutoff day 31 in February clamps to 28/29.
- A transaction exactly at cutoff day end belongs to the closing cycle.
- Due-date countdown correct in Asia/Colombo.

**Playwright (write & run)**

| ID     | Test                                                                                                                 | Viewport |
| ------ | -------------------------------------------------------------------------------------------------------------------- | -------- |
| S12-01 | Seed spends and clock at 21 Oct: card shows Billed 30,000, Unbilled 5,000, Available 465,000                         | W+M      |
| S12-02 | Due-date countdown shows "X days" matching the clock (1 Nov → due 10 Nov = 9 days)                                   | W+M      |
| S12-03 | Settle → "Full Billed Due" chip is default; confirm → Savings −30,000, Billed 0                                      | W+M      |
| S12-04 | Settle "Total Outstanding" → Outstanding 0                                                                           | W+M      |
| S12-05 | Settle Custom 10,000 → Billed 20,000 remaining                                                                       | W+M      |
| S12-06 | Overpay → card shows credit balance, available credit above limit not clamped incorrectly                            | W+M      |
| S12-07 | Settlement is not counted in expense stats (Stats and summary unchanged)                                             | W+M      |
| S12-08 | Cutoff day 31 in a February clock → cycle ends on 28th/29th                                                          | W+M      |
| S12-09 | Transaction at 23:59 on cutoff day is in the closing cycle; 00:01 next day is in the next                            | W+M      |
| S12-10 | `tick` creates a statement snapshot once (rerun is a no-op); history list shows it                                   | W+M      |
| S12-11 | Settle modal is a bottom sheet (mobile) / dialog (desktop); chips are tappable; default source is the linked account | W+M      |
| S12-12 | Net-worth header counts card debt as a liability                                                                     | W+M      |

**Exit**: `@s12` green; regression green.

---

### Step 13 — 0% Installment Plans

**Goal**: installment onboarding, conversion, automatic billing and payoff.

**Build** (Sec 4.S2.2, 3.C, 2.4)

- `CreditCardInstallmentPlan` with derived progress; modes: brand new, ongoing onboarding, conversion from swipe (`excludeFromBalance` + `excludeFromStats`).
- Scheduler job: deterministic installment transactions per cutoff (catch-up), final-installment remainder, plan completion.
- Blocked Principal and Available Credit formula; Installment Plans section with progress rows; "Convert to 0% Installment" on card transactions.
- Processing fee, early payoff (`CC_INSTALLMENT_PAYOFF`), cancel with restore.

**Scenarios**

- New plan 120,000 / 12 → 10,000 monthly; blocked 120,000; available credit reduced by 120,000.
- Plan 100,000 / 3 → 33,333, 33,333, 33,334 (remainder in the last).
- Ongoing onboarding: 12 months, 5 paid, 10,000/mo → remaining 7 installments, blocked 70,000, progress "5 of 12".
- Conversion: swipe 60,000 → original no longer in balance or stats; blocked 60,000; no double deduction of credit limit.
- `tick` at each cutoff creates exactly one installment; `tick` repeated or catch-up after 3 missed months creates the right count with unique IDs.
- Installment is a normal budget/stats expense in the plan's category each month.
- Processing fee 2,500 posted once as a FEE.
- Early payoff posts remaining principal, plan COMPLETED, blocked 0.
- Cancel conversion restores the original swipe.
- Manually deleting a system installment is blocked.

**Playwright (write & run)**

| ID     | Test                                                                                                     | Viewport |
| ------ | -------------------------------------------------------------------------------------------------------- | -------- |
| S13-01 | Create a new plan 120,000 / 12: card shows Blocked 120,000; Available reduced by 120,000                 | W+M      |
| S13-02 | Plan 100,000 / 3: after three ticks, installments are 33,333 / 33,333 / 33,334 and plan is COMPLETED     | W+M      |
| S13-03 | Ongoing onboarding (12 months, 5 paid, 10,000): row shows "5 of 12", Remaining 70,000                    | W+M      |
| S13-04 | Convert a 60,000 swipe: original row marked "converted", removed from balance/stats; Blocked 60,000      | W+M      |
| S13-05 | Available credit after conversion = limit − outstanding − blocked (no double deduction)                  | W+M      |
| S13-06 | `tick` at cutoff adds one installment row with note "Merchant (Installment n of N)"; progress increments | W+M      |
| S13-07 | Run `tick` twice; installment count unchanged (idempotent)                                               | W+M      |
| S13-08 | Skip 3 months then `tick`; 3 installments exist with distinct dates                                      | W+M      |
| S13-09 | Installment appears in Stats and Budget for its category each month                                      | W+M      |
| S13-10 | Processing fee 2,500 posted once as a Bank Fees expense                                                  | W+M      |
| S13-11 | Early Payoff: confirm sheet shows remaining principal; confirm → payoff row, plan COMPLETED, Blocked 0   | W+M      |
| S13-12 | Cancel a converted plan → original swipe restored in balance/stats                                       | W+M      |
| S13-13 | Deleting a system installment row is not offered / shows a blocking message                              | W+M      |
| S13-14 | Plan cards show progress bar, monthly amount and remaining amount; layout correct in both viewports      | W+M      |
| S13-15 | Visual snapshot of Installment Plans section                                                             | W+M      |

**Exit**: `@s13` green; regression green.

---

### Step 14 — SMS Ingress, Archival & Template Parsing

**Goal**: secure webhook, idempotent archival, deterministic parsing for known banks.

**Build** (Sec 4.S1 steps 1–2a, 1 Auth)

- Settings: webhook API key generator (shown once, hash stored), regenerate, setup guide.
- `POST /api/v1/webhooks/sms-ingress`: `x-api-key` auth, rate limit, Zod validation, `dedupeKey`, archive `PENDING`, enqueue, `202`.
- Worker parser: template registry (starting with 2–3 banks with fixtures), validation gate, `IGNORED_NON_TX` for OTP/promos.
- Bank SMS Activity drawer/log (More): raw message, status, parse method.
- Account `bankSenderIds` + `accountNumberLast4` resolution.

**Scenarios**

- Missing/invalid API key → 401; regenerated key invalidates the old one; key shown once and never again.
- Valid SMS → 202 and a `PENDING` row, then `PROCESSED`/`IGNORED_NON_TX` after the worker runs.
- Duplicate POST (same sender/time/body) → `DUPLICATE`, one row.
- OTP and promo messages → `IGNORED_NON_TX`, no transaction.
- Known-bank POS message → `parseMethod = TEMPLATE`, correct amount in minor units.
- Rate limit returns 429 after the threshold.
- Raw SMS never appears in server logs (checked via log capture in the test API).

**Playwright (write & run)**

| ID     | Test                                                                                                      | Viewport |
| ------ | --------------------------------------------------------------------------------------------------------- | -------- |
| S14-01 | Settings → generate webhook key: shown once with a copy button; after reload only the prefix is shown     | W+M      |
| S14-02 | Webhook with a missing/invalid key → 401; with the valid key → 202 (API test)                             | W+M      |
| S14-03 | Regenerate key: old key → 401, new key → 202                                                              | W+M      |
| S14-04 | POST a COMBANK POS SMS fixture → Activity log shows PROCESSED, method TEMPLATE, amount correct            | W+M      |
| S14-05 | POST the same payload twice → exactly one log row                                                         | W+M      |
| S14-06 | POST an OTP SMS → status IGNORED_NON_TX and no transaction created                                        | W+M      |
| S14-07 | POST a malformed payload → 400 with validation message; nothing stored                                    | W+M      |
| S14-08 | Burst of requests above the limit → 429                                                                   | W+M      |
| S14-09 | Activity log: raw SMS viewer, parsed JSON inspect, status filters work                                    | W+M      |
| S14-10 | Account matching by sender + last4: two accounts with the same last4 at different banks resolve correctly | W+M      |
| S14-11 | Webhook response returns immediately (< 500 ms) even when the worker is paused (queue persists)           | W+M      |
| S14-12 | Raw SMS text is absent from captured server logs (Test API log capture)                                   | W+M      |
| S14-13 | Apple Shortcuts setup guide page renders and the download link returns a file                             | W+M      |

**Exit**: `@s14` green; regression green.

---

### Step 15 — Gemini Fallback, Validation Gate & Review Inbox

**Goal**: unknown formats handled safely; nothing wrong auto-posts.

**Build** (Sec 4.S1 steps 2b–4, 1 AI)

- Settings: Gemini API key (AES-GCM encrypted, write-only display), model override, SMS auto-post mode, privacy disclosure.
- Gemini provider with the mock implementation for tests (`GEMINI_PROVIDER=mock`), schema validation, amount text → minor units, masking of long numbers before sending.
- Validation gate (positive amount, currency, timestamp sanity, account resolution, confidence).
- Posting policy; `NEEDS_REVIEW` reasons; SMS **Review Inbox** (More, with badge): editable fields, Post, Link to existing, Ignore.

**Scenarios**

- No template match + no key → `NEEDS_REVIEW / NO_GEMINI_KEY`.
- No template match + key + mock returns valid HIGH → posted automatically (mode `AUTO_VALIDATED`).
- Mock returns LOW confidence or malformed JSON → inbox, nothing posted.
- Mode `ALWAYS_REVIEW_GEMINI` → inbox even if valid.
- Account unmatched → `ACCOUNT_UNMATCHED`; user links an account in the inbox and posts.
- Future timestamp or amount ≤ 0 → `VALIDATION_FAILED`.
- Prompt-injection text inside an SMS ("ignore previous instructions…") yields only schema-shaped output; no side effects.
- Key saved is never returned to the browser in plaintext; masked display.

**Playwright (write & run)**

| ID     | Test                                                                                                                               | Viewport |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S15-01 | Save Gemini key in Settings → masked `••••abcd`; reload shows masked; API never returns plaintext                                  | W+M      |
| S15-02 | Unknown-format SMS without a key → Review Inbox item with reason "No Gemini key"; badge count = 1                                  | W+M      |
| S15-03 | With key + mocked HIGH-confidence response → transaction auto-posted; log shows method GEMINI                                      | W+M      |
| S15-04 | Mocked LOW confidence → inbox, no transaction                                                                                      | W+M      |
| S15-05 | Mocked invalid JSON → inbox with `FAILED/VALIDATION_FAILED` info; retry button works                                               | W+M      |
| S15-06 | Mode "Always review Gemini" → even valid parse waits in inbox                                                                      | W+M      |
| S15-07 | Inbox: edit amount/category, tap Post → transaction created; item leaves inbox                                                     | W+M      |
| S15-08 | Unmatched account: pick account in inbox then Post → posted on that account                                                        | W+M      |
| S15-09 | Inbox "Ignore" removes the item without a transaction                                                                              | W+M      |
| S15-10 | Future-dated or zero-amount parse → `VALIDATION_FAILED` in inbox                                                                   | W+M      |
| S15-11 | Injection-text SMS: result is a normal parse/ignore; no extra transactions or setting changes                                      | W+M      |
| S15-12 | Privacy disclosure text visible next to the key input; Gemini request payload (captured by mock) has card numbers masked to last 4 | W+M      |
| S15-13 | Inbox list is a full-screen list with swipe/tap actions on mobile and a table/side panel on desktop                                | W+M      |

**Exit**: `@s15` green; regression green.

---

### Step 16 — Transaction Ingestion Service

**Goal**: SMS → correct ledger entries, with de-duplication both ways.

**Build** (Sec 4.S1 step 3, 2.4)

- Routing table (POS/online/bill → expense; ATM → transfer to Cash + optional fee child; bank charge; deposits; refunds; card payment → settlement transfer).
- Two-way de-duplication (±2 h, one-to-one): SMS after manual (link + enrich note); manual after SMS (`possibleDuplicateOfTransactionId` + "Possible duplicate — merge?" prompt + merge action).
- Fee-SMS dedupe against auto-created fee child.
- `balanceAfter` mismatch hint (no auto-adjust; ignore out-of-order SMS).
- SMS glyph on rows; link from transaction to its SMS.

**Scenarios**

- POS 4,500 SMS → expense on the resolved account, correct category from mapping.
- ATM other-bank 10,000 with `otherAtmFee` 25 → transfer bank → Cash 10,000 plus fee 25 (net worth −25).
- Own-ATM with fee 5; own-ATM without fee config → no fee row.
- Salary credit → income `DEPOSIT`.
- Refund matching a recent debit → `REFUND` linked, balance restored.
- Manual entry 4,500 five minutes before the SMS → SMS linked, no duplicate, note enriched.
- SMS first, then manual entry later → possible-duplicate prompt; merge keeps SMS row and the user's category/note.
- Separate "bank charge" SMS after ATM fee child → links to existing fee, no second fee.
- `balanceAfter` differs from ledger → mismatch hint with a Calibrate shortcut; no adjustment auto-created.
- Older (out-of-order) SMS with `balanceAfter` does not raise a hint.
- Two identical-amount manual entries and one SMS → matched one-to-one.

**Playwright (write & run)**

| ID     | Test                                                                                                    | Viewport |
| ------ | ------------------------------------------------------------------------------------------------------- | -------- |
| S16-01 | POS SMS fixture → expense row with SMS glyph; balance reduced                                           | W+M      |
| S16-02 | ATM_OTHER 10,000 with fee 25: Cash +10,000, Savings −10,025 total, a Bank Fees row linked to the parent | W+M      |
| S16-03 | ATM_OWN with fee 5 and with no fee config                                                               | W+M      |
| S16-04 | Salary credit → income row `DEPOSIT`, balance up                                                        | W+M      |
| S16-05 | Refund SMS after a matching debit → refund row linked; balance restored                                 | W+M      |
| S16-06 | Manual 4,500 then matching SMS within 2 h → only one row; note enriched; SMS linked                     | W+M      |
| S16-07 | SMS then manual entry: "Possible duplicate" prompt appears; Merge → one row with user's category/note   | W+M      |
| S16-08 | Prompt "Not a duplicate" keeps both rows and dismisses the prompt                                       | W+M      |
| S16-09 | Follow-up BANK_CHARGE SMS (25) links to the existing fee child; no extra row                            | W+M      |
| S16-10 | `balanceAfter` mismatch shows a hint with "Calibrate" button; no adjustment row created                 | W+M      |
| S16-11 | Out-of-order older SMS does not trigger the hint                                                        | W+M      |
| S16-12 | Two identical manual entries + one SMS → exactly one is linked                                          | W+M      |
| S16-13 | Card-payment SMS with a resolvable card → settlement transfer; otherwise → inbox                        | W+M      |
| S16-14 | Tapping the SMS glyph on a row opens the original SMS; "link" navigates to the transaction from the log | W+M      |
| S16-15 | End-to-end: Webhook → worker → UI refresh without reload (sync pulls new row) on both viewports         | W+M      |

**Exit**: `@s16` green; regression green.

---

### Step 17 — Fixed Deposits

**Goal**: FD tracking with correct interest, payouts and withholding tax.

**Build** (Sec 4.S5.1, 3.G)

- `FixedDeposit`, `FixedDepositPayout`; Accounts tab "Fixed Deposits" section; create/edit/close flows.
- `finance-core`: compound interest by frequency, monthly payout math, WHT in both modes, accrued value.
- Scheduler job for monthly payouts (deterministic IDs) → `FD_INTEREST` income to the linked account.
- Placement from a funding account (`FD_PLACEMENT`, excluded from stats); maturity 1-tap action; premature closure; auto-renew.

**Scenarios** (golden vectors in `finance-core`)

- Monthly payout: 1,000,000 at 12% with WHT 5% → gross 10,000, tax 500, net 9,500 per month.
- Compound monthly 12 months: 1,000,000 → 1,126,825.03 gross; tax on interest at maturity.
- WHT default from the user setting; per-FD override; 0% allowed.
- Placement reduces the funding account but net worth is unchanged; placement is excluded from stats.
- Maturity (no auto-renew) shows a 1-tap deposit action → principal + net interest posted; status MATURED.
- Premature closure with actual proceeds.
- `tick` posts each missed monthly payout exactly once.

**Playwright (write & run)**

| ID     | Test                                                                                                         | Viewport |
| ------ | ------------------------------------------------------------------------------------------------------------ | -------- |
| S17-01 | Create FD (1,000,000, 12%, 12 months, monthly payout, WHT 5%, linked Savings): card shows monthly net 9,500  | W+M      |
| S17-02 | Funding from Savings: Savings −1,000,000, net worth unchanged, FD shown in assets                            | W+M      |
| S17-03 | Advance clock one month + `tick` → Savings +9,500; row "Investment Yield"; payout record shows gross/tax/net | W+M      |
| S17-04 | `tick` again → no duplicate payout; skip 3 months → 3 payouts                                                | W+M      |
| S17-05 | Compound FD shows projected maturity value and net-of-tax value                                              | W+M      |
| S17-06 | WHT override per FD (e.g., 0%) changes net payout; default taken from Settings                               | W+M      |
| S17-07 | FD placement and maturity principal are excluded from income/expense stats; interest is included             | W+M      |
| S17-08 | Maturity date reached: "Deposit proceeds" 1-tap action posts principal + net interest; status MATURED        | W+M      |
| S17-09 | Premature closure: enter actual proceeds; rows and status correct                                            | W+M      |
| S17-10 | Auto-renew FD creates a renewed term instead of the deposit action                                           | W+M      |
| S17-11 | Net-worth FD value = principal + accrued net interest                                                        | W+M      |
| S17-12 | FD form and detail layouts valid in both viewports; visual snapshot                                          | W+M      |

**Exit**: `@s17` green; regression green.

---

### Step 18 — Loans & Leases

**Goal**: amortization, auto-split EMI payments and extra principal.

**Build** (Sec 4.S5.2, 3.H)

- `Loan` (`LOAN`/`LEASE`), `LoanScheduleEntry`, `LoanPayment`; schedule generation (reducing balance, flat rate, lease residual) with remainder in the final payment; editable schedule rows (`OVERRIDDEN`).
- Loans & Leases section in Accounts; loan detail with the schedule table.
- "Log EMI" (pre-fills scheduled amount, auto-splits principal/interest, posts `EMI_PAYMENT`, default `excludeFromBudget`).
- Extra principal with schedule regeneration (shorter tenure or lower EMI).
- Disbursement transaction; "Interest paid" report; net-worth liability from derived remaining principal.

**Scenarios**

- Reducing: 1,200,000, 12%, 12 months → EMI ≈ 106,618.55 (assert against the golden vector); first interest 12,000; last payment clears exactly 0.
- Flat: 1,200,000, 12% flat, 12 months → interest 144,000, EMI 112,000.
- Lease with residual 200,000 → final balance equals the residual before the buy-out.
- Log EMI #1 → principal 94,618.55 / interest 12,000; remaining principal updated.
- Extra principal 100,000 → schedule regenerated; either tenure shortens or EMI drops.
- Override a row's interest → following rows recompute from the new balance.
- Disbursement creates stats-excluded income.
- Interest-paid report equals the sum of interest components.

**Playwright (write & run)**

| ID     | Test                                                                                                       | Viewport |
| ------ | ---------------------------------------------------------------------------------------------------------- | -------- |
| S18-01 | Create reducing-balance loan: EMI shown matches golden value; schedule table has 12 rows                   | W+M      |
| S18-02 | Schedule first row interest 12,000.00; last row closing balance 0.00                                       | W+M      |
| S18-03 | Flat-rate loan: EMI 112,000.00; equal principal/interest split per row                                     | W+M      |
| S18-04 | Lease with residual: closing balance equals the residual at the end of the term                            | W+M      |
| S18-05 | Log EMI #1: pre-filled amount; principal/interest split displayed; row posted; remaining principal updated | W+M      |
| S18-06 | EMI payment row does not count toward the budget by default; toggle available                              | W+M      |
| S18-07 | Extra principal 100,000 → schedule regenerated (choice of shorten tenure / lower EMI) and totals correct   | W+M      |
| S18-08 | Override a schedule row's interest → later rows recompute                                                  | W+M      |
| S18-09 | Disbursement to a linked account posted; not counted as income in stats                                    | W+M      |
| S18-10 | "Interest paid" report equals the sum of interest components                                               | W+M      |
| S18-11 | Net-worth liabilities include remaining principal                                                          | W+M      |
| S18-12 | Schedule table scrolls horizontally on mobile without breaking the page; full width on desktop             | W+M      |
| S18-13 | Loan works offline and syncs                                                                               | W+M      |

**Exit**: `@s18` green; regression green.

---

### Step 19 — Household Collaboration & Role Enforcement

**Goal**: shared finances with enforced privacy.

**Build** (Sec 3.A, 4.S6)

- `Household`, `HouseholdMember`; More → Household: create household, email search + direct role assignment, change role, remove, leave, ownership transfer; shared vs private accounts (`accessScope`), `householdId` on shared FD/Loan.
- Server authorization on **every** push mutation; pull sanitization per the capability matrix (contributors get no balances/opening balances/other users' transactions/FD/loans/budgets).
- `createdByUserId` shown on rows; revoked member's local shared data purged.

**Scenarios** (two users: Husband = OWNER, Wife)

- OWNER adds Wife as CO_OWNER → both see shared accounts/transactions in near real time after sync; private accounts stay private.
- VIEWER: sees shared data read-only; create/edit controls hidden and server rejects forged writes.
- CONTRIBUTOR_ADD_ONLY: can add transactions to shared accounts; sees account names but **no balances**; sees only own transactions; no FD/Loan/Budget/Stats of others; IndexedDB contains no balances (checked in-page).
- Forged mutation (CONTRIBUTOR edits another's row, VIEWER writes) → rejected server-side.
- Member leaves/removed → shared data purged locally after sync; mutations rejected.
- Owner cannot leave without transferring ownership.
- Role change takes effect on the next sync (e.g., contributor → viewer).

**Playwright (write & run)** (multi-context: `owner`, `wife` in separate browser contexts)

| ID     | Test                                                                                                         | Viewport |
| ------ | ------------------------------------------------------------------------------------------------------------ | -------- |
| S19-01 | Owner creates household, searches wife's email, assigns CO_OWNER → wife sees household in More               | W+M      |
| S19-02 | Shared account created by owner appears for wife; private account does not                                   | W+M      |
| S19-03 | CO_OWNER wife adds a transaction → owner sees it with "added by Wife" and updated balance                    | W+M      |
| S19-04 | Change role to VIEWER → wife's add/edit controls disappear; direct API write → 403                           | W+M      |
| S19-05 | Change role to CONTRIBUTOR_ADD_ONLY → wife sees shared account names but balances show "—"                   | W+M      |
| S19-06 | Contributor sees only her own transactions; owner's rows absent; Stats/Budget/Accounts show restricted state | W+M      |
| S19-07 | In-page IndexedDB inspection: contributor DB has no `openingBalanceMinor`/FD/Loan/foreign transactions       | W+M      |
| S19-08 | Contributor attempts to edit the owner's transaction through the tRPC API → rejected                         | W+M      |
| S19-09 | Contributor can add a transaction offline; after reconnect it syncs and owner sees it                        | W+M      |
| S19-10 | Remove member → wife's shared data disappears after sync; her pushes are rejected                            | W+M      |
| S19-11 | Wife leaves voluntarily; owner cannot leave without transferring ownership                                   | W+M      |
| S19-12 | Shared FD/Loan visible to CO_OWNER and VIEWER (read-only), never to contributor                              | W+M      |
| S19-13 | Household manager UI is a list with a bottom-sheet role picker on mobile and a table/dialog on desktop       | W+M      |

**Exit**: `@s19` green; regression green.

---

### Step 20 — PWA, Offline Shell & Push Reminders

**Goal**: installable, fully offline-capable app with daily reminders.

**Build** (Sec 1 PWA)

- Serwist service worker, precache app shell, runtime caching strategy, update flow ("New version available — reload").
- Web App Manifest (standalone, icons, theme color), offline fallback page.
- Web Push (VAPID): subscription management, daily reminder job at the user's chosen time, iOS install caveat in Settings.

**Scenarios**

- First visit online, then offline: shell loads, all previously synced data usable, create/edit works.
- Offline navigation to every tab succeeds.
- A new deployment shows the update prompt; accepting reloads onto the new version without losing the outbox.
- Manifest valid (name, icons, `display: standalone`).
- Reminder subscription stored; the reminder job enqueues a notification at the configured time (server-verified).

**Playwright (write & run)**

| ID     | Test                                                                                                             | Viewport |
| ------ | ---------------------------------------------------------------------------------------------------------------- | -------- |
| S20-01 | Visit online, wait for SW `activated`, go offline, reload → shell and data load                                  | W+M      |
| S20-02 | Offline: navigate to all five tabs and add a transaction; reconnect → synced                                     | W+M      |
| S20-03 | Manifest fetched: `display=standalone`, icons ≥192/512, `theme_color` set; `beforeinstallprompt` handler present | W+M      |
| S20-04 | Deploy a second build (version bump) → update banner shown; accept → new version active, outbox intact           | W+M      |
| S20-05 | Offline fallback page for an uncached route                                                                      | W+M      |
| S20-06 | Settings: enable reminders (Playwright grants `notifications` permission) → subscription stored (Test API)       | W+M      |
| S20-07 | Clock to reminder time + `tick` → push job enqueued with correct payload (Test API outbox, not real push)        | W+M      |
| S20-08 | iOS install note shown on WebKit/iPhone user agent only                                                          | iPhone   |
| S20-09 | Lighthouse-style checks (via `playwright-lighthouse` or CDP): installability and PWA audits pass                 | W+M      |
| S20-10 | `@smoke` offline reload on WebKit                                                                                | iPhone   |

**Exit**: `@s20` green; regression green.

---

### Step 21 — Export/Import, System Health & Final Hardening

**Goal**: data sovereignty, observability and release quality.

**Build** (Sec 6, 8)

- Settings → Export (full JSON, transactions CSV) and Import (JSON restore into an empty account with ID preservation and validation).
- System health page (last run per job, queue depth, last sync, DB/worker status).
- Accessibility pass, performance budget checks, security checks, README/self-hosting docs.
- Full regression across all steps; cross-feature end-to-end journeys.

**Scenarios**

- Export → reset → import yields identical balances, statements, schedules and counts.
- Import of an invalid/foreign-version file is rejected without partial writes.
- Health page reflects job success/failure.
- Net worth, budgets, statements and installments are identical before export and after import.
- Security regression: forged mutations, expired session, rate limits.

**Playwright (write & run)**

| ID     | Test                                                                                                             | Viewport |
| ------ | ---------------------------------------------------------------------------------------------------------------- | -------- |
| S21-01 | Export JSON downloads a file with the expected top-level entities and counts                                     | W+M      |
| S21-02 | Export CSV: header row and one row per transaction; amounts formatted correctly                                  | W+M      |
| S21-03 | Reset account data, import the JSON → balances, budgets, plans, FDs, loans match the pre-export snapshot         | W+M      |
| S21-04 | Importing a malformed/incompatible file shows an error; data unchanged                                           | W+M      |
| S21-05 | System health page shows green job statuses after `tick`; failing job (induced by Test API) shows red            | W+M      |
| S21-06 | Axe accessibility scan over every main screen in both themes: no serious/critical violations                     | W+M      |
| S21-07 | Performance: seeded 5,000 transactions, Trans. tab interactive < 3 s, quick-add save < 100 ms (measured in-page) | W+M      |
| S21-08 | Journey A: register → accounts → expense via keypad → budget → calibration → stats (assert final numbers)        | W+M      |
| S21-09 | Journey B: CC swipe → convert to installment → ticks over 3 cycles → settlement → payoff                         | W+M      |
| S21-10 | Journey C: SMS (template + Gemini mock + ATM + dedupe) → review inbox → balances correct                         | W+M      |
| S21-11 | Journey D: household with three roles across two contexts, offline add, reconnect                                | W+M      |
| S21-12 | Expired session while offline keeps local data; re-login resumes sync with outbox intact                         | W+M      |
| S21-13 | Full visual-regression pass over key screens (light/dark × web/mobile)                                           | W+M      |

**Exit**: complete suite (`@s00`…`@s21`) green on `web` and `mobile` (+ `@smoke` on WebKit); release checklist done.

---

## C. Features That Cannot Be Fully Verified by Playwright

These need a real device, real third-party service or human judgment. Playwright covers the logic around them (APIs, state, mocks) as noted.

| #   | Feature / risk                                                               | Why Playwright can't prove it                                                                                            | Verified instead by                                                                                              |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Apple Shortcuts automation delivering real SMS**                           | Requires an iPhone, the Messages app, and an iOS Shortcut; Playwright only simulates the webhook call (Steps 14–16).     | One-time manual setup with the shipped guide/template; keep a checklist; webhook contract is fully tested.       |
| 2   | **Real Gemini parsing accuracy**                                             | Tests use a mock to stay deterministic and free; they cannot measure model quality or prompt behavior on real SMS.       | An optional, manually-run script that replays the anonymized SMS corpus against a real key and reports accuracy. |
| 3   | **Real bank SMS formats**                                                    | The template corpus can only include samples you provide; new bank formats are discovered in real use.                   | Grow the fixture corpus from real messages; unknown formats fall back to Gemini/inbox (tested).                  |
| 4   | **Web Push delivery** (Android/desktop/iOS)                                  | Playwright cannot receive OS-level notifications or run push services; iOS requires an installed Home Screen PWA ≥ 16.4. | Playwright verifies subscription + job enqueue (S20-06/07); manually test on one Android and one iPhone.         |
| 5   | **PWA install prompt / Add to Home Screen UX**                               | Browser/OS install chrome is outside page content.                                                                       | Manifest + SW audits (S20-03/09); manual install test on iOS and Android.                                        |
| 6   | **Actual on-screen OS keyboard suppression & feel**                          | Emulation can check `inputmode="none"` and viewport behavior, not that a real iOS/Android keyboard stays hidden.         | Manual check on real devices (Step 5 keypad); consider a "numeric keypad" device test pass.                      |
| 7   | **Real touch gesture fidelity** (momentum scroll, swipe feel, haptics)       | Emulated touch events differ from physical touch; haptics don't exist in tests.                                          | Manual device pass; Playwright still tests swipe outcomes (S06-04).                                              |
| 8   | **iOS Safari IndexedDB eviction / storage pressure (ITP)**                   | Browser storage eviction after ~7 days of inactivity or low storage can't be reproduced reliably in tests.               | Document the risk; rely on server sync as source of truth; optional manual long-run test.                        |
| 9   | **Real multi-device sync over flaky mobile networks**                        | Playwright simulates offline/online and one forced failure, not real latency/packet loss across devices.                 | Soak test with two real devices; chaos tests (S03-08) cover logic.                                               |
| 10  | **Docker Compose first-run & upgrades on the user's host**                   | Tests run in CI containers, not every self-hosting environment (ARM, NAS, reverse proxies, HTTPS).                       | Documented smoke checklist in the README; publish and exercise sample compose files.                             |
| 11  | **Backup/restore with `pg_dump`/`pg_restore`**                               | Host-level DB tooling is outside the browser.                                                                            | A scripted restore drill in CI (non-Playwright) and a README procedure.                                          |
| 12  | **External cron services** (cron-job.org, GitHub Actions, Vercel Cron)       | Playwright can call `tick` but not prove a third-party scheduler fires reliably.                                         | Health page "last run" monitoring; manual verification after setup.                                              |
| 13  | **Real OAuth providers (e.g., Google sign-in)**                              | Needs real accounts/consent screens; not automatable reliably.                                                           | Mock OIDC server in tests (optional) + manual check once.                                                        |
| 14  | **Visual taste / "feels like Realbyte"**                                     | Screenshot tests catch regressions, not whether the design is good.                                                      | Human design review against reference screenshots at Step 1 and Step 21.                                         |
| 15  | **Low-end device performance & battery**                                     | Emulated CPU throttling approximates but doesn't equal real phones.                                                      | Manual pass on a low-end Android; Playwright measures budgets on throttled CPU as a proxy.                       |
| 16  | **Third-party/OS accessibility behavior** (VoiceOver/TalkBack)               | Axe checks static rules; screen-reader UX needs real assistive tech.                                                     | Manual VoiceOver/TalkBack pass on core flows.                                                                    |
| 17  | **Legal/tax correctness** (withholding tax rates, lender-specific day-count) | Tests verify the math you configure, not whether the rates/conventions match local law or a lender's statement.          | Review golden vectors with a finance professional; editable schedules cover lender differences.                  |

# Hard Money: UI, Visual Design & Mobile UX Audit (screenshot-driven)

- Audit date: 2026-10-20 (second run of the day)
- Scope: every screen and component under `src/app` and `src/components` that renders UI, checked against the 7 screenshots in `audit/` and against PRD §5.0/§5.1 (design tokens, layout patterns, screens).
- Mode: read-only. No source changes, no commits, no DB access, no dev server. Findings come from the screenshots plus reading the code. Line numbers refer to the current `main` (`0c401ec`).
- Priority lens: mobile PWA user (the main audience), then desktop.
- Next.js: 16.4.3. I checked the APIs used here (`Link transitionTypes`, `Viewport.interactiveWidget`, `appleWebApp`) against `node_modules/next/dist/docs/`. None are flagged as misuse below.

Status key: **CONFIRMED** means it's visible in a screenshot or unambiguous in code. **SUSPECTED** means the logic is clear but no screenshot shows that state. Effort key: **S** under half a day, **M** half a day to 2 days, **L** more than 2 days.

---

## 1. How the UI works today

### 1.1 Screenshot inventory

| File | Viewport | Screen | What it shows |
|---|---|---|---|
| `image.png` | Mobile, dark | Trans. tab, Daily view (`/`) | Header "Hard Money" with Synced pill, card icon (colour swap) and sun icon (theme); month switcher "October 2026"; summary bar Income LKR 0.00 / Expense LKR 10.00 / Total LKR -10.00; search + Filter; Daily/Calendar/Monthly/Summary underline tabs; two day groups (Tue Oct 27: SMS expense LKR 10.00; Fri Oct 23: "INCOME" LKR 9,800,000.00 loan disbursement with day total LKR 0.00); FAB; bottom nav. |
| `image2.png` | Mobile, dark | Stats tab (`/stats`) | Title only, no sync or theme controls; same summary bar; Expense/Income/Trend pill segmented control; grey single-slice donut "Uncategorized 100%"; hint "Tap a slice or category row to view transactions"; Top Categories (1). |
| `image3.png` | Mobile, dark | Budget tab (`/budget`) | Larger bold title + subtitle; "+ Add Budget" with no visible button fill; month switcher in a bordered panel; Month Overview (Safe-to-Spend LKR 7,500.00/day, Total Limit 30,000, Total Spent 0.00 in red, Remaining 30,000 in blue); one budget card reading "Wallet **Salary**" with no visible progress bar. |
| `image4.png` | Mobile, dark | Accounts tab (`/accounts`) | Title + Synced pill on the left; "Show archived" checkbox; white "+ Add Account"; Assets/Liabilities/Net Worth header with bright vertical dividers; Cash & Bank / Liabilities / Investments pill tabs; two bank rows showing last-4 digits, SMS sender IDs ("BOCONLINE", "sampathtxn"), blue balances, and three tiny edit/archive/delete icons. |
| `image5.png` | Mobile, dark | More tab (`/more`) | "Settings & More"; profile card with red "Log Out"; grouped rows with bright white dividers; "SMS Review Inbox" under "Developer & Automation"; FAB covering the last row's chevron; an empty card cut off at the bottom. |
| `image6.png` | Mobile, dark | Shopping List (`/more/shopping-list`) | Back arrow + title; Item / Quantity ("2 kg" placeholder) / red "+ Add"; one item "Suger (2kg)" with drag handle, small checkbox, pencil; FAB still present. |
| `image-desktop.png` | Desktop, dark | Trans. tab | Collapsible sidebar (H logo, nav, "New Transaction", Synced, Light Mode, Swap In/Out Colors); page title "Hard Money" again; the same Daily list stretched to `max-w-4xl`; floating "Add Transaction" pill; large empty area. |

All screenshots are dark theme and show the app inside a browser or device frame. Light theme, standalone safe areas, the Liabilities/Investments tabs, modals and the quick-add sheet are not shown. Findings about those are code-based.

### 1.2 Shell and navigation

- `src/app/layout.tsx` renders a fixed full-viewport shell: `Sidebar` (desktop ≥768 px, `desktop-only`), a `ScrollContainer` (`pb-nav-safe` = 4 rem + bottom inset), the global `Fab`, `BottomNav` (mobile), the global `QuickAddModal`, and `PwaManager`. Safe-area utilities live in `globals.css` (`pt-shell-safe`, `bottom-nav-safe`, `bottom-mobile-offset`, `pb-sheet-safe`).
- The 5 main tabs (Trans., Stats, Budget, Accounts, More) are rendered by `NativeTabContainer`. Every visited tab stays mounted and is hidden with `hidden` + `inert`. `TabNavigationProvider.switchToTab` calls `history.pushState` and dispatches `popstate` for an instant switch. Sub-routes (`/accounts/[id]`, `/more/*`, `/login`, `/register`, `/offline`) render normal Next children with view-transition slide animations (`globals.css` "Page transitions", with reduced motion respected).
- There's no shared page header. Each page hand-builds its own (`page.tsx`, `stats/page.tsx`, `budget/page.tsx`, `accounts/page.tsx`, `more/page.tsx`). `components/navigation/app-header.tsx` exists but nothing imports it.

### 1.3 Screens and flows

| Area | Route / component | Main flows |
|---|---|---|
| Transactions | `/` → `DailyView`, `CalendarView`, `MonthlyView`, `SummaryView`, `TransFilterBar`, `TransactionEditModal` | Browse a month, search/filter, tap a row to edit or delete (inline confirm + 6 s undo toast), merge/dismiss duplicates, view the raw SMS. |
| Quick add | `QuickAddModal` → `MobileQuickAdd` (<768 px full screen) or the desktop centered dialog | FAB → type switch → guided fields (amount keypad → category → account → note) → Save. Desktop adds "Continue". |
| Stats | `/stats` + `stats-sections.tsx` | Expense/Income donut + ranked list, drill into a category, 6-month expense trend. |
| Budget | `/budget` + `BudgetOverview`, `BudgetCard` | Overview, per-category cards, add/edit/delete modal with rollover. |
| Accounts | `/accounts` (1,642 lines) | Net-worth header; Cash & Bank / Liabilities / Investments tabs; account CRUD (bottom sheet), archive/delete (ConfirmationModal); credit-card settle; 0% installment plans; loans (`LoanModal`, `LoanDetailModal` with EMI schedule, Log EMI, Early Payoff, override, edit, delete); fixed deposits (`FixedDepositModal`, `FdCloseModal`, "Deposit proceeds"). |
| Account detail | `/accounts/[id]` | Balance, Calibrate, Settle (cards), full transaction history, statements, card installment plans. |
| More | `/more` + sub-pages `household`, `shopping-list`, `preferences`, `categories`, `bookmarks`, `developer`, `inbox`, `sms-activity`, `shortcuts` | Profile + logout; household create/invite/role/transfer/remove/leave; shopping list; theme/colour/currency/WHT/reminders; categories with icon picker; templates; webhook key and Gemini; SMS review inbox; SMS log; iOS Shortcut guide. |
| Auth | `/login`, `/register` | Email + password. Registration can be closed by env. No onboarding afterwards. |
| PWA | `PwaManager`, `/offline`, `public/manifest.json`, `public/sw.js` | SW registration, update banner, offline fallback page. |

### 1.4 Component and design-token structure

- Tokens: `globals.css` defines `--bg --surface --border --text --text-muted --accent --income --expense --transfer --warning`, with light, dark and `data-color-swap` variants. `@theme` maps only `--color-income/expense/transfer/warning/surface/border/app`. There's **no** `--color-accent`, `--color-hairline`, `--primary`, `--surface-hover` or `--muted`. Several findings below come from this gap.
- Shared UI primitives: `EmptyState`, `SegmentedTabs`, `MonthSwitcher`, `SummaryBar`, `Fab`, `ConfirmationModal` (new since the earlier run), `NumberKeypadPopup`, `IconPicker`, `CategoryIcon`. Every other control (dialogs, sheets, toggles, buttons, inputs, chips) is hand-rolled per file with Tailwind classes, which is where most of the inconsistency comes from.
- Measured in code: `text-[10px]` used 93 times, `text-[11px]` 189 times, `text-[9px]` 4 times, `font-mono` 130 times, `focus:outline-none` 108 times, `focus-visible` 0 times, `role="dialog"`/`aria-modal` 0 times, `aria-live` 0 times.

---

## 2. Severity summary

| Severity | Count | Main themes |
|---|---|---|
| Critical | 3 | Month pinned to October 2026; one-tap irreversible household ownership transfer; push reminders report success with a fake subscription. |
| High | 24 | Broken dividers and invisible Budget buttons; income/expense colour swap leaking into success/danger colours; FAB overlapping content; no focus states or dialog semantics; mouse-only rows; small tap targets on destructive icons; "Wallet Salary" icon-name bug; income categories budgetable; Uncategorized drill-down dead; loan actions failing silently; quick-add ignores theme and loses entered data; split amounts untypeable; no onboarding; misleading totals for the loan disbursement. |
| Medium | 51 | Component and header inconsistency, formats, dates, currency, empty/loading/error states, modal patterns, sample values in loan/FD forms, PRD gaps. |
| Low | 17 | Copy, polish, minor parity items. |
| **Total** | **95** | |

---

## 3. Findings

### A. Global visual system and tokens

#### UI-01 Hairline dividers render as bright, text-coloured lines
- Severity: **High** · Status: **CONFIRMED** (`image5.png`, `image.png`, `image4.png`, `image-desktop.png`) · Effort: **S**
- Where: 18 files use `divide-y divide-hairline` / `divide-x divide-hairline`, e.g. `src/components/ui/summary-bar.tsx:30`, `src/app/accounts/page.tsx:342`, `src/app/more/page.tsx:205`, `daily-view.tsx`, `calendar-view.tsx`, `monthly-view.tsx`, `stats-sections.tsx`, `loan-detail-modal.tsx`, household, inbox, shopping list, categories, bookmarks, preferences.
- Evidence: `hairline` isn't a Tailwind colour. Only the custom class `.border-hairline` exists (`globals.css:136`), and no `--color-hairline` is defined in `@theme`. `divide-hairline` therefore generates nothing, and Tailwind v4's default border colour is `currentColor`. In `image5.png`, every row separator on More is a near-white line. In `image.png`, `image4.png` and `image-desktop.png`, the Income | Expense | Total and Assets | Liabilities | Net Worth separators are bright white bars. Card outlines that use `border-hairline` are correctly subtle, so the two kinds of line visibly disagree.
- Mobile impact: the dark theme looks unfinished, and the high-contrast dividers pull attention away from the amounts. It's the most visible visual defect in the screenshots.
- Fix: add `--color-hairline: var(--border);` to `@theme` (one line), or replace the class with `divide-[var(--border)]`. Add a lint/grep check in CI for unknown colour utilities.

#### UI-02 Budget "Add Budget" and "Save Budget" buttons have no background
- Severity: **High** · Status: **CONFIRMED** (`image3.png`, code) · Effort: **S**
- Where: `src/app/budget/page.tsx:271` (header button) and `:550` (modal submit); also `focus:ring-primary` / `text-primary` in the modal.
- Evidence: `bg-[var(--primary)] text-white`, but `--primary` is never defined. `image3.png` shows "+ Add Budget" as plain white text with no fill, unlike "+ Add Account" in `image4.png`. In light theme the text is white on white, so both the main Budget CTA and the modal's Save are invisible.
- Mobile impact: light-theme users can't find how to add or save a budget.
- Fix: use `bg-[var(--accent)]`, or define a `--primary` token in both themes. Remove `ring-primary` / `text-primary`.

#### UI-03 Other undefined tokens fail silently
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `var(--surface-hover)` is used 30 times (More row hover, Accounts scope buttons, FD-close summary panel, household avatar/role buttons, inbox master header, shopping-list drop target, categories hover). `var(--muted)` is used in `SyncIndicator` (`sync-provider.tsx`, "Synced"/"Offline" text). Tailwind `bg-accent` / `text-accent` / `border-accent` appear in `trans-filter-bar.tsx:93` and `calendar-view.tsx:143,150`, and there's no `--color-accent`.
- Evidence: none of these variables or theme colours exist in `globals.css`.
- Mobile impact: there's no press/hover feedback on More rows and settings lists. The shopping-list drag target is never highlighted. The active-filter dot on the Filter button is invisible, so users can't tell a filter is on. The calendar's "today" ring falls back to `currentColor` and looks the same as the selected-day style (see UI-33).
- Fix: define `--surface-hover` and `--muted` (or replace them with `--border` / `--text-muted`), and add `--color-accent: var(--accent)` to `@theme`.

#### UI-04 The income/expense colour swap leaks into success, danger and status colours
- Severity: **High** · Status: **CONFIRMED** (code; default colours seen in all screenshots) · Effort: **M**
- Where: `globals.css` swaps `--income` ↔ `--expense` when `data-color-swap="true"`. These variables are also used for non-cashflow meanings:
  - success: "Synced" check icon (`sync-provider.tsx` `text-[var(--income)]`), "Settings saved successfully" and reminder status (`preferences/page.tsx:316`), household success banner (`household/page.tsx`), shopping-list save tick;
  - danger: "Log Out" (`more/page.tsx:191` `text-[var(--expense)]`), household error banner, Leave/Remove buttons, FD "Premature Close" link and "Confirm Premature Close" button (`fd-close-modal.tsx`), shopping "Clear completed", inbox error banner;
  - neutral facts: positive account balances (`image4.png`, blue), budget "Remaining" (`budget-overview.tsx`), FD "Monthly Net", loan "Principal"/"Interest" labels, FD "Deposit proceeds" button background (`accounts/page.tsx:922`).
- Evidence: with the swap on, "Synced" and "Settings saved" turn red (they read as errors), Log Out and destructive confirms turn blue (they read as safe), and bank balances turn red (they read as debt).
- Mobile impact: the swap exists for users who read red as income. For them, every status signal in the app inverts its meaning. A destructive confirm that looks "safe" is a real risk.
- Fix: add semantic tokens that never swap: `--success`, `--danger`, `--info`, `--neutral-amount`. Keep `--income`/`--expense` for cashflow amounts only, then replace usages.

#### UI-05 Hard-coded Tailwind palette colours bypass the token system
- Severity: **Medium** · Status: **CONFIRMED** (`image.png` SMS chip) · Effort: **M**
- Where: `bg-blue-500/10 text-blue-500` SMS chip (`daily-view.tsx:183`), `bg-blue-500` budget/installment/FD progress fills, `red-500/600` errors and deletes (`ConfirmationModal`, edit modal, accounts), amber chips, purple/emerald badges, the `zinc` reminders switch, plus the entire mobile quick-add palette (UI-70).
- Evidence: in `image.png` the "SMS" chip is the same blue as income amounts, so it reads as money-in.
- Mobile impact: inconsistent meaning of colour, and dark/light contrast varies per chip (see UI-13).
- Fix: map chips to semantic tokens (`--info`, `--warning`, `--danger`, `--success`) defined for both themes.

#### UI-06 Type scale is below the PRD and mixes monospace with sans in the same row
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`, `image2.png`, `image-desktop.png`) · Effort: **M**
- Where: 93× `text-[10px]`, 189× `text-[11px]`, 4× `text-[9px]` (calendar amounts, split tag), 130× `font-mono`. PRD §5.0 says sizes 12/14/16/20/28 and one system sans with tabular numerals.
- Evidence: in `image.png` the transaction title is 12 px, the account/note line 11 px, "added by Viran" 10 px, and the chips 10 px. Day headers and row amounts are monospace ("– LKR 10.00"), while summary-bar amounts on the same screen are sans ("LKR 10.00"). The Stats donut center and category amount are mono (`image2.png`), while the budget amounts are sans (`image3.png`).
- Mobile impact: small text on a phone is hard to read, especially for older household members. Mixed typefaces make the same number look different across screens.
- Fix: adopt the PRD scale (12 minimum for secondary text, 14 for row titles, 16 for key amounts). Drop `font-mono` and rely on `tabular-nums`, which `globals.css` already provides.

#### UI-07 Mobile inputs jump to 16 px while the UI around them is 12 px
- Severity: **Low** · Status: **CONFIRMED** (`image.png`) · Effort: **S**
- Where: `globals.css` "Prevent iOS Safari auto-zoom" forces `font-size: 16px !important` on inputs ≤768 px, while inputs are styled `text-xs`.
- Evidence: in `image.png` the search placeholder is visibly larger than the "Filter" button text and every other label on screen.
- Fix: keep the 16 px rule (it's correct for iOS) but design inputs at 16 px on purpose, with matching height (44 px) and neighbouring button text sizes.

#### UI-08 Three different segmented-control styles for the same pattern
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`, `image2.png`, `image4.png`) · Effort: **S**
- Where: underline tabs `SegmentedTabs` (Trans., `image.png`); pill on surface (Stats, `stats/page.tsx:201`, `image2.png`); pill on border colour (Accounts, `accounts/page.tsx:371`, `image4.png`); plus separate variants in quick-add (type switch), categories (type), and the account form (scope buttons).
- Mobile impact: users have to relearn what "selected" looks like on each tab. None of them expose `role="tablist"` / `aria-selected` either (UI-93).
- Fix: one `SegmentedControl` component (PRD: "segmented text tabs, no pill") with tab semantics, used everywhere.

#### UI-09 No consistent button hierarchy
- Severity: **Medium** · Status: **CONFIRMED** (`image3.png`, `image4.png`, `image5.png`, `image6.png`) · Effort: **S**
- Evidence: the primary "add" action looks different on every screen. Accounts uses white solid (`image4.png`); Budget is transparent (`image3.png`, UI-02); Categories is dark `bg-[var(--text)]`; the shopping list is accent red (`image6.png`); household/preferences are accent red; Liabilities and Investments use 11 px outlined chips (UI-52). The destructive "Log Out" is a red outline (`image5.png`), while destructive confirms are `bg-red-600`. Button heights range from about 22 px (`py-0.5`) to 40 px.
- Fix: define Primary / Secondary / Ghost / Destructive button variants at 44 px minimum height on mobile and use them consistently.

#### UI-10 Page headers differ on every tab; sync status shows on only two tabs
- Severity: **Medium** · Status: **CONFIRMED** (all mobile screenshots) · Effort: **S**
- Evidence: Trans. shows the app name "Hard Money" (not the screen name) with sync, colour-swap and theme icons on the right (`image.png`, `page.tsx:217`). Stats shows "Statistics" only (`image2.png`). Budget uses a larger bold `text-xl` title + subtitle + action (`image3.png`, `budget/page.tsx:264`). Accounts shows the title with the Synced pill on the left and controls on the right (`image4.png`). More shows a title + subtitle (`image5.png`). `AppHeader` is unused.
- Mobile impact: there's no stable place to check sync state (it's absent on Stats/Budget/More). The Trans. tab never says "Transactions". Spacing above content differs per tab.
- Fix: one sticky `AppHeader` (screen title, optional subtitle, right-side action slot, sync status always in the same place). Move theme and colour swap to Preferences.

#### UI-11 Month switcher: inconsistent framing, small targets, no picker
- Severity: **Medium** · Status: **CONFIRMED** (`image3.png` vs `image.png`/`image2.png`) · Effort: **S**
- Where: `src/components/ui/month-switcher.tsx`; Budget wraps it in `flat-panel` (`budget/page.tsx:279`).
- Evidence: it's bordered on Budget and unbordered on Trans./Stats. The chevron buttons are `p-1` + 18 px icon ≈ 26 px. The month label isn't tappable, so reaching a month a year back takes 12 taps. The wrapper is `tabIndex={0}` with `focus:outline-none` and no role or name. Swipe only works on the thin strip.
- Fix: 44 px chevrons, tap the label to open a month/year picker, "Today" shortcut, consistent framing, remove the focusable wrapper (or give it a visible focus ring and `aria-label`).

#### UI-12 Header utility icons are cryptic and small
- Severity: **Low** · Status: **CONFIRMED** (`image.png`) · Effort: **S**
- Where: `src/app/page.tsx` mobile controls (duplicated in the unused `AppHeader`).
- Evidence: the colour-swap toggle is a credit-card icon, which has no relation to "swap income/expense colours". The theme toggle is a yellow sun. Both are `p-1.5` + 18 px ≈ 30 px. These rarely used settings take prime header space on the most-used screen.
- Fix: remove both from the header (they already exist in Preferences and on the desktop sidebar). If one must stay, give it a text label.

#### UI-13 Contrast failures (PRD requires WCAG AA in both themes)
- Severity: **Medium** · Status: **CONFIRMED** (computed) · Effort: **S**
- Evidence (computed ratios; AA normal text needs 4.5:1):
  - White on dark-theme accent `#E8505B` ≈ **3.7:1**. Used for the "+ Add" button text (`image6.png`), the "Log EMI", household and preferences save buttons, and the inbox count badge.
  - `--warning` `#D98E04` on white ≈ 2.7:1 (budget "near limit" text, light theme).
  - `text-amber-500` chips (inbox reason, split tag) ≈ 2.2:1 on white. White on `bg-amber-500` "Calibrate" ≈ 2.2:1.
  - `text-red-500` errors on white ≈ 3.8:1. `text-blue-500` SMS chip on white ≈ 3.7:1.
  - Text-muted pairs pass (`#9A9EA3` on `#1C1C1E` ≈ 6.3:1; `#6B7075` on `#F5F6F7` ≈ 4.6:1).
- Mobile impact: warnings and errors are the hardest text to read, outdoors and for low-vision users.
- Fix: darken light-theme warning/amber/red, and use dark text on the dark-theme accent or a deeper accent (≈ `#C83A45`). Extend the axe test to every screen and open modal.

#### UI-14 No visible keyboard/switch-control focus anywhere
- Severity: **High** · Status: **CONFIRMED** · Effort: **M**
- Evidence: `focus-visible` is used 0 times and `focus:outline-none` 108 times. Most buttons have no focus style at all. Inputs show only a 1 px ring. The custom switch in Preferences uses `peer-focus:outline-none` (`preferences/page.tsx:416`).
- Mobile impact: users with an external keyboard, Switch Control or Android TalkBack's focus highlight can't see where they are. This fails WCAG 2.4.7.
- Fix: a global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`, and remove the blanket `focus:outline-none`.

#### UI-15 Tap targets well below 44×44 px throughout
- Severity: **High** · Status: **CONFIRMED** (`image4.png`, `image6.png`, `image.png`) · Effort: **M**
- Evidence (approximate rendered size):
  - account edit/archive/delete ≈ 25 px with 4 px gaps (`accounts/page.tsx:1382-1405`);
  - month chevrons ≈ 26 px; header icons ≈ 30 px;
  - shopping checkbox 20 px, pencil ≈ 23 px, back arrow 18 px;
  - SMS chip ≈ 14 px tall;
  - duplicate Merge/Dismiss ≈ 18 px tall;
  - Liabilities/Investments add chips ≈ 20 px;
  - loan override/Edit/Early Payoff ≈ 22 px;
  - household Transfer/Remove 28 px icon-only;
  - search clear ≈ 17 px;
  - Segmented tabs ≈ 32 px; inputs 32 px (`h-8`) in most forms.
- Mobile impact: mis-taps, including next to destructive actions (UI-48, UI-79).
- Fix: 44 px minimum hit area (padding or `::after` hit-slop) and ≥8 px spacing between adjacent actions. Move rarely used row actions into an overflow menu or swipe actions.

### B. Navigation and information architecture

#### UI-16 FAB appears on every screen and covers content
- Severity: **High** · Status: **CONFIRMED** (`image5.png`, `image6.png`, `image2.png`, `image3.png`) · Effort: **S**
- Where: `src/components/ui/fab.tsx` (hidden only on `/login`, `/register`), `bottom-mobile-offset` = 5 rem + inset. Scroll padding `pb-nav-safe` = 4 rem + inset (`globals.css`), so nothing reserves space for the FAB.
- Evidence: in `image5.png` the FAB sits on top of the "Apple Shortcuts Guide" row's chevron. In `image6.png` the Shopping List has both a red "+ Add" and a red FAB that adds a *transaction*. The FAB also shows on Preferences, Developer, Household, Inbox, Account detail and the offline page.
- Mobile impact: the last row and its actions can be hidden. On non-transaction screens it's unclear what "+" adds.
- Fix: show the FAB only on Trans., Stats, Budget, Accounts and Account detail (with `openQuickAdd({ accountId })` preset there). Add `pb-[calc(9rem+env(safe-area-inset-bottom))]` to the scroll container when the FAB is visible.

#### UI-17 Bottom navigation: abbreviated label, weak active state, no re-tap behaviour
- Severity: **Medium** · Status: **CONFIRMED** (all mobile screenshots) · Effort: **S**
- Where: `src/components/navigation/bottom-nav.tsx`.
- Evidence: the label is "Trans.". The active state is only a slightly whiter 11 px label and a thicker stroke (compare "Stats" in `image2.png` with the others). There's no accent, pill or indicator. Tapping the active tab does nothing: no scroll-to-top, and no pop back to the tab root from a sub-page.
- Fix: label it "Transactions" (or "Activity"), add an accent-coloured active indicator, and make re-tap scroll to top or return to the tab root.

#### UI-18 More tab structure buries daily tasks under "Developer" and shows placeholder content
- Severity: **Medium** · Status: **CONFIRMED** (`image5.png`) · Effort: **S**
- Where: `src/app/more/page.tsx:114-160`, `:183`, `:251-256`.
- Evidence:
  - "SMS Review Inbox", the item a user acts on most (with a count badge), sits under "Developer & Automation" next to API keys.
  - Descriptions use internal jargon: "Manage dynamic categories & Lucide icons", "SMS Webhook ingress key", "Joint treasury, partner ledger sync & permissions", "Personal treasury preferences, integrations and automation".
  - An `EmptyState` titled "Settings & Tools" (code comment: "Empty State requirement") renders at the bottom of a full page. It's the cut-off empty card in `image5.png`.
  - The email falls back to the fake `treasury-admin@local`.
  - There's no Export/Import row even though PRD §5.0 item 7 and §5.1 list it.
- Fix: move SMS Review Inbox to the top ("Needs attention") or onto the Trans. tab as a banner when count > 0. Rename the groups (Household, Preferences, Automation, Advanced). Use plain-language descriptions. Remove the placeholder EmptyState and the fallback email.

#### UI-19 Log Out is one tap, prominent, and ignores unsynced changes
- Severity: **High** · Status: **CONFIRMED** (`image5.png`, code) · Effort: **S**
- Where: `src/app/more/page.tsx:48-60`, `:189-197`.
- Evidence: a red "Log Out" button sits at the top of the More tab, right where the thumb lands after the tab switch. It logs out immediately, with no confirmation and no check of `pendingMutations` (PRD §1 requires explicit confirmation when the outbox isn't empty).
- Mobile impact: an accidental tap signs the user out. Unsynced offline entries are stranded until they log in again on that device.
- Fix: move Log Out to the bottom of More. Confirm with the pending count ("3 changes not synced yet — Sync now / Log out anyway").

#### UI-20 The Trans. "Summary" view duplicates the Stats tab with different maths
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `summary-view.tsx` vs `stats/page.tsx`.
- Evidence: both show category breakdowns for the month. Summary rounds each percentage with `Math.round` (the total may not reach 100%) and ignores split items. Stats uses the largest-remainder method and is split-aware.
- Mobile impact: two places show different numbers for the same month.
- Fix: replace the Summary view with a link to Stats, or share one computed model.

#### UI-21 Back buttons are inconsistent and often unlabeled
- Severity: **Low** · Status: **CONFIRMED** (`image6.png`, code) · Effort: **S**
- Evidence:
  - Icon size 16 or 18 px; padding none (shopping list, about 18 px target), `p-1` or `p-1.5`.
  - `aria-label` is present only on the shopping list. Preferences, categories, developer, household and inbox back links have no accessible name. Account detail relies on `title`.
  - All back links are hard-coded `href="/more"` or `"/accounts"` rather than history back.
- Fix: a shared `BackButton` (44 px, `aria-label="Back to …"`, `router.back()` with a fallback href) inside the shared header (UI-10).

#### UI-22 Desktop is a stretched mobile layout and differs from the PRD's desktop design
- Severity: **Medium** · Status: **CONFIRMED** (`image-desktop.png`) · Effort: **L**
- Evidence:
  - The page title "Hard Money" repeats the sidebar brand right next to it.
  - There are two "add" CTAs on screen: sidebar "New Transaction" and the floating "Add Transaction" pill.
  - Content is a single centred column with a large empty area. PRD §5.0/§5.1 describes a desktop "multi-card analytical dashboard" (net-worth widget, safe-to-spend, CC alerts, calendar side by side) that doesn't exist.
  - The sidebar footer exposes "Swap In/Out Colors" as a primary-level control.
  - Theme only toggles between light and dark. There's no way back to "System" even though the provider supports it.
- Fix: page title = screen name. Hide the floating button when the sidebar is expanded. Use two-column layouts (calendar + day list; donut + ranked list; accounts groups in a grid), which are already partly coded with `md:` classes. Move the swap/theme controls into Preferences with a three-way Light/Dark/System choice.

#### UI-23 No first-run onboarding; empty states lead to dead ends
- Severity: **High** · Status: **CONFIRMED** (code) · Effort: **M**
- Where: `register-form.tsx` (`router.push("/")` after success), `mobile-quick-add.tsx` account panel (`cashAccounts/bankAccounts/cardAccounts` sections render nothing when empty), `page.tsx:286` empty state.
- Evidence: a new user lands on an empty Trans. tab ("No transactions yet — Tap the + button…"). Tapping + opens quick-add. After entering an amount and category, the account panel is blank, with no "Create an account" option, and Save reports "Please select an account". Nothing asks for currency, timezone or first account, and nothing explains SMS automation.
- Mobile impact: the very first transaction a new user tries to record fails.
- Fix: a three-step first-run flow (create first account with opening balance → confirm currency/timezone → optional household/SMS). Add an inline "Add account" tile in the quick-add account panel. Make empty states carry the right CTA.

### C. Formatting and data presentation

#### UI-24 Every month-based screen opens on October 2026
- Severity: **Critical** · Status: **CONFIRMED** (all screenshots show "October 2026"; code) · Effort: **S**
- Where: `src/app/page.tsx:23`, `src/app/stats/page.tsx:20`, `src/app/budget/page.tsx:39`, `src/components/ui/month-switcher.tsx:12`, all `new Date(2026, 9, 1)`.
- Mobile impact: from 1 November onward, the PWA opens on last month every time. New transactions seem to be missing, budgets show the wrong period, and safe-to-spend is wrong.
- Fix: default to the current month in the user's timezone. Inject a fixed clock only in E2E.

#### UI-25 Several money formats on the same screen
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`, `image3.png`) · Effort: **S**
- Evidence: in `image.png` the summary total reads "LKR -10.00" (`SummaryBar` has its own formatter, `summary-bar.tsx:18-25`), while the day header and row read "– LKR 10.00" (manual prefix + `formatMoney`). `formatMoney` itself emits "-LKR 10.00" for negatives (net worth, balances). Budget over-limit shows "Rs. 0.00 / day" (`budget/page.tsx:353`) while everything else says "LKR". The calendar shows "+9,800,000" with no currency or decimals (`calendar-view.tsx:163`). The trend strips "LKR " via string replace (`stats-sections.tsx:44`).
- Fix: one formatter on `Intl.NumberFormat` with `signDisplay`, a compact variant for tight spaces, and a true minus sign. Remove the custom formatters.

#### UI-26 The currency preference has no visible effect
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **M**
- Where: `formatMoney(…, currency = "LKR")` (`lib/finance-core/money.ts:24`), `SummaryBar currency="LKR"`, labels "Monthly Limit (LKR)", "Payment Amount (LKR)", "Amount (LKR) *", "Enter Amount (LKR)"; Preferences lets the user set "Default Currency" (`preferences/page.tsx`).
- Mobile impact: a user who picks USD still sees LKR everywhere, so the setting looks broken.
- Fix: a `useCurrency()` context from user settings feeding the shared formatter and labels. Or remove the setting until it's supported.

#### UI-27 Dates appear in at least five formats and ignore the timezone setting
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Evidence:
  - Daily view: "Tue, Oct 27".
  - Raw ISO `transactionDate` in account detail (`accounts/[id]/page.tsx`, "Transactions" list) and in the Stats drill-down (`stats-sections.tsx:130`).
  - Device-locale `toLocaleDateString()` for FD maturity (`accounts/page.tsx:914`) and the loan schedule and next-due date.
  - `toLocaleString()` in the SMS modal and inbox.
  - `.slice(0,10)` for statements.
  - Quick-add and calendar hard-code `Asia/Colombo` instead of the Preferences timezone.
- Fix: one `formatDate` helper (user locale + user timezone), with relative labels ("Today", "Yesterday") in lists.

#### UI-28 Raw enum values and internal jargon shown to users
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`, `image-desktop.png`, `image4.png`) · Effort: **S**
- Evidence:
  - Uncategorized rows are titled "EXPENSE" / "INCOME" (`daily-view.tsx:171`, `image.png`).
  - The edit modal header badge shows `transaction.type`.
  - Loan cards show "LOAN", "ACTIVE", "REDUCING BAL"; FD status is shown raw.
  - Household shows "My Role: OWNER", and member badges and the role sheet show "CO_OWNER" / "CONTRIBUTOR_ADD_ONLY" (`household/page.tsx:283`, `:557`).
  - FD-close and inbox account pickers show "(BANK_SAVINGS)" / "(BANK_SAVINGS, LKR)".
  - Account rows show SMS sender IDs (UI-49).
  - Copy like "Enable Symmetric Rollover", "safe-to-spend burn rate", "Opening Balance / Debt (≤ 0)", "Lucide icons", "ingress".
- Fix: a label map for every enum ("Co-owner", "Contributor (add only)", "Viewer"; "Uncategorized expense"), and a plain-language copy pass.

#### UI-29 Monthly totals contradict the visible rows for excluded transactions (loan disbursement)
- Severity: **High** · Status: **CONFIRMED** (`image.png`, `image-desktop.png`) · Effort: **S**
- Where: `page.tsx:162-196` and `daily-view.tsx:72` skip `excludeFromStats`; the row still renders as income (`daily-view.tsx` `isIncome`); `calendar-view.tsx:44-55` does **not** skip it.
- Evidence: in `image.png` the summary says **Income LKR 0.00**, while the list shows **"+ LKR 9,800,000.00 INCOME"** under Fri Oct 23, whose day header says **LKR 0.00**. The only hint is a "No budget" chip, which describes a different flag. The Calendar view counts the same row as +9,800,000 for that day, so the Calendar and the summary bar disagree.
- Mobile impact: users can't reconcile the numbers on one screen, which erodes trust in a finance app.
- Fix: render disbursements and other excluded rows as neutral (transfer style), with a clear label ("Loan disbursement · not counted in income") and an "Excluded from totals" chip. Apply the same exclusion rule in the Calendar, Monthly and Daily views.

### D. Transactions tab

#### UI-30 Transaction row hierarchy is weak and noisy
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`) · Effort: **S**
- Where: `src/components/transaction/daily-view.tsx:143-245`.
- Evidence:
  - PRD §5.0 asks for a category icon inside a solid colour circle. Rows show a 10 px dot, or a grey tag icon when uncategorized ("EXPENSE" in `image.png`).
  - The second line packs account + raw bank reference ("VSRPMT-000018664342") + "added by Viran" in 10 px accent red. That's the same hue as expense amounts, and it shows even for your own entry in a one-person household.
  - The day header shows only a net figure. PRD asks for income and expense subtotals.
- Fix: a 32 px category icon circle (`CategoryIcon` already exists). Title = category or merchant; subtitle = account · note. Show "by {name}" only when the household has more than one member, in muted colour. Show income/expense subtotals in the day header.

#### UI-31 The empty state ignores active search and filters
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/app/page.tsx:284-290`.
- Evidence: when a search or filter returns nothing, the screen says "No transactions yet — Tap the + button to record your first…". On desktop there's no "+ button" (it's "Add Transaction").
- Fix: a separate "No matches for '<query>'" state with a "Clear filters" action, and device-appropriate copy.

#### UI-32 Rows, cells and cards are clickable `<div>`s
- Severity: **High** · Status: **CONFIRMED** · Effort: **M**
- Where: transaction rows (`daily-view.tsx:143`, `calendar-view.tsx` detail rows, `accounts/[id]/page.tsx` history rows), calendar day cells (`calendar-view.tsx:135`), monthly rows (`monthly-view.tsx`), budget cards (`budget-card.tsx`), Stats category rows and donut slices (`stats-sections.tsx`, `stats/page.tsx`), inbox master rows, quick-add field rows (`mobile-quick-add.tsx`), `SyncIndicator`.
- Mobile impact: VoiceOver/TalkBack don't announce these as buttons, give no name ("Groceries, minus LKR 450, Oct 27"), and keyboard/Switch Control can't reach them. The SMS chip, a real `<button>`, is nested inside a clickable div.
- Fix: render each row as a `<button>` or `<a>` with an accessible name. Calendar days become buttons with `aria-pressed` / `aria-current="date"`.

#### UI-33 Calendar view: stale selection, broken "today" marker, unreadable amounts
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/components/transaction/calendar-view.tsx:60-68`, `:143`, `:150`, `:161-171`.
- Evidence:
  - `selectedDate` is set once with `useState`, so after changing month the detail panel still shows a date from the previous month and says "No transactions recorded on this date".
  - "Today" uses the undefined `border-accent` (UI-03), so the 2 px ring is `currentColor`: the same look as the selected day.
  - Amounts are 9 px mono, in full digits, and truncated ("+9,800,…") in ~45 px cells.
  - Excluded rows are counted (UI-29).
- Fix: key the view by month or reset the selection, use a real accent ring, compact amounts (9.8M / 450), and minimum 11–12 px.

#### UI-34 Monthly view overflows and lists empty future months
- Severity: **Low** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/components/transaction/monthly-view.tsx`.
- Evidence: all 12 months render, including future zero months. Each row puts "+ LKR 9,800,000.00  - LKR 10.00" side by side at 11 px mono, which won't fit at 360 px. Tapping a month silently switches to Daily.
- Fix: stack income and expense, hide future months, use compact numbers.

#### UI-35 The SMS chip and raw-SMS modal mislead and lack basics
- Severity: **Low** · Status: **CONFIRMED** (`image.png`, code) · Effort: **S**
- Where: `daily-view.tsx:30-52`, `:337-381`.
- Evidence: offline, the "raw SMS" modal shows the transaction note labelled as an SMS from sender "BANK" (made-up content). The close X has no label. There's no Escape key or back-gesture handling, and it's a centred modal rather than a sheet.
- Fix: say "Original SMS isn't available offline". Use the shared sheet (UI-65).

#### UI-36 Possible-duplicate prompt: tiny buttons, no confirmation, no feedback
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `daily-view.tsx:279-327`.
- Evidence: "Merge" (which soft-deletes a row) and "Dismiss" are 11 px, `py-0.5` buttons placed next to each other. There's no confirmation and no `res.ok` check. Offline they fail silently.
- Fix: 44 px buttons, a short confirm ("Keep SMS version, remove manual entry?"), success/error toasts, disabled offline.

#### UI-37 Undo is only available on the Trans. tab and isn't announced
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/app/page.tsx:340-357`; `accounts/[id]/page.tsx` passes no `onDeleted` to `TransactionEditModal`.
- Evidence: deleting from Account detail gives no undo. The toast lasts 6 s, has no `role="status"`, and its Undo button is about 20 px tall.
- Fix: a global toast system (live region, 44 px action, about 8 s) used by every destructive action.

#### UI-38 Filter UI gives weak feedback
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `trans-filter-bar.tsx`.
- Evidence: the panel opens inline and pushes the list down. The active-filter dot is invisible (UI-03). There are no chips summarising active filters. The search input has no label (placeholder only), and the clear X is about 17 px with no label.
- Fix: a filter bottom sheet, active-filter chips with an × each, and labelled search.

### E. Stats tab

#### UI-39 Tapping "Uncategorized" does nothing, despite the on-screen hint
- Severity: **High** · Status: **CONFIRMED** (`image2.png` + code) · Effort: **S**
- Where: `src/app/stats/page.tsx:145` (`t.categoryId === selectedCategoryId`) and `:422` (`selectedCategoryTransactions.length > 0`).
- Evidence: uncategorized rows are bucketed under the id `"uncategorized"`, but the drill-down compares `categoryId` (which is `null`) to `"uncategorized"`. It finds nothing and the panel stays hidden. In `image2.png` the only category is Uncategorized, and the screen says "Tap a slice or category row to view transactions".
- Mobile impact: the advertised interaction is dead in the most common early state (SMS-imported, uncategorized spend).
- Fix: map `"uncategorized"` to `!t.categoryId` in the filter. When a drill-down is empty, show an explicit empty panel instead of nothing.

#### UI-40 The donut reads as empty and isn't accessible
- Severity: **Medium** · Status: **CONFIRMED** (`image2.png`) · Effort: **S**
- Where: `stats/page.tsx:288-418`.
- Evidence: the Uncategorized colour `#64748b` is close to the ring track (`--border`), so a 100% slice looks like an empty or disabled chart. Callout labels are 9.5/8.5 px SVG text. The percentage appears twice (callout and chip). Slices are SVG `<circle>` elements with `aria-label` but they aren't focusable, and there's no text alternative or table.
- Fix: give Uncategorized a distinct neutral-but-visible colour with a "Categorize" CTA. Hide callouts when there are 2 or fewer slices. Make the ranked list the accessible source (buttons) and mark the SVG `aria-hidden`.

#### UI-41 Trend chart shows false bars and truncated labels
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `stats-sections.tsx:39-49`.
- Evidence: zero months render a 6% bar (`Math.max(6, heightPct)`). Amounts are 10 px full-precision mono in 6 narrow columns and get truncated. It covers expense only (PRD mentions weekly/monthly/yearly comparison).
- Fix: zero-height bars with a "–" label, compact amounts, an income/expense toggle.

#### UI-42 Category drill-down list is read-only and shows ISO dates
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `stats-sections.tsx:112-138`.
- Evidence: rows show `transactionDate` raw. They can't be tapped to edit, and the sign is derived from type only.
- Fix: reuse the Daily row component (with edit on tap).

### F. Budget tab

#### UI-43 Budget cards print the Lucide icon name as text ("Wallet Salary")
- Severity: **High** · Status: **CONFIRMED** (`image3.png`) · Effort: **S**
- Where: `src/app/budget/page.tsx:316` (`<span className="text-base">{item.categoryIcon}</span>`), `:480` (`{c.icon} {c.name}` in the select), `budget-card.tsx`, and the same pattern in the inbox category select (`inbox-items.tsx:107`).
- Evidence: categories store Lucide names (`categories-data.ts`: Salary → `"Wallet"`), and the code treats them as emoji. `image3.png` shows "Wallet" in large type before "**Salary**".
- Mobile impact: every budget title and category option reads like a typo.
- Fix: render `<CategoryIcon name={icon} />` inside the category-colour circle. Show only the name in `<option>` text.

#### UI-44 Income and system categories can be budgeted
- Severity: **High** · Status: **CONFIRMED** (`image3.png`) · Effort: **S**
- Where: `budget/page.tsx:61-69` (`availableCategories` filters only already-budgeted ids). The placeholder says "Select Expense Category".
- Evidence: the budget in `image3.png` is on **Salary**, an INCOME category, so it can never accumulate spend. "Balance Calibration" and "Loan Principal" are also offered.
- Fix: filter with `getCategoryType(c) === "EXPENSE"` and exclude system categories.

#### UI-45 Progress track is invisible, and "ok" uses the income colour
- Severity: **Medium** · Status: **CONFIRMED** (`image3.png`) · Effort: **S**
- Where: `budget/page.tsx:363` (`bg-surface` track inside a `flat-panel`, which is also surface), fill `bg-blue-500`.
- Evidence: at 0% spent, the card in `image3.png` has no bar at all, so users can't see how much budget is left at a glance. The healthy state is blue (the income colour; red under swap).
- Fix: `bg-[var(--border)]` track; neutral/success token for ok, `--warning`, then `--danger`.

#### UI-46 Overview colours and safe-to-spend send the wrong signals
- Severity: **Medium** · Status: **CONFIRMED** (`image3.png`) · Effort: **S**
- Where: `budget-overview.tsx`, `budget/page.tsx:107-111`.
- Evidence: "Total Spent LKR 0.00" is red even at zero. "Remaining" uses the income colour. Safe-to-spend per day is computed for past and future months too (dividing by the full month), and the label doesn't say which days it covers. Over budget shows "Rs. 0.00 / day".
- Fix: neutral colour until a threshold is reached; show safe-to-spend only for the current month as "LKR X/day for the next N days"; one currency format.

#### UI-47 Budget modal: centred dialog, unconfirmed delete, jargon
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `budget/page.tsx:446-560`.
- Evidence:
  - It's centred rather than a bottom sheet.
  - Labels aren't tied to inputs.
  - Both a "Close" text button and a "Cancel" button.
  - The category select is disabled in edit mode with no explanation.
  - "Enable Symmetric Rollover" uses a 16 px native checkbox.
  - Delete fires immediately with no confirm or undo.
  - Title "Set Category Budget" vs CTA "Add Budget".
  - The budget empty-state copy says "for this month", but budgets are global.
- Fix: the shared sheet (UI-65); "Carry unspent/overspent amount to next month" as a 44 px switch; confirm or undo on delete; consistent copy.

### G. Accounts

#### UI-48 Delete sits next to Archive and Edit as 25 px icons on every account row
- Severity: **High** · Status: **CONFIRMED** (`image4.png`) · Effort: **S**
- Where: `src/app/accounts/page.tsx:1380-1407` (cash/bank), `:1536-1563` (credit cards).
- Evidence: three 13 px icons with `p-1.5` and a 4 px gap, with the bin last (nearest the thumb). The ConfirmationModal added since the earlier run prevents one-tap loss, which is a good improvement. Still, every mistap opens a destructive dialog, and the icons rely on `title` for their names.
- Fix: move Edit/Archive/Delete into an overflow (⋯) menu or onto the detail page. Keep the row as one large tap target that opens detail.

#### UI-49 Account rows show internal SMS sender IDs
- Severity: **Low** · Status: **CONFIRMED** (`image4.png`) · Effort: **S**
- Where: `accounts/page.tsx:1340`.
- Evidence: "BOCONLINE" and "sampathtxn" appear as account subtitles.
- Fix: show the account type or bank name, and keep sender IDs on the edit form.

#### UI-50 Three-column money headers are tight on narrow phones
- Severity: **Medium** · Status: **SUSPECTED** (`image4.png` shows the values nearly filling their cells at about 400 px width) · Effort: **S**
- Where: `summary-bar.tsx:30`, `accounts/page.tsx:342`, `budget-overview.tsx`.
- Evidence: "LKR 9,833,703.16" at 12 px semibold fills most of a third of the width. At 320–360 px, or with larger iOS text, values will wrap mid-number or clip. There's no `min-w-0` / wrap strategy.
- Fix: compact display (LKR 9.83M) with the full value on tap, or a two-row layout under 380 px.

#### UI-51 Loan, FD and credit-card cards don't wrap on mobile
- Severity: **High** · Status: **CONFIRMED** (code) / overflow **SUSPECTED** (no Liabilities screenshot) · Effort: **S**
- Where: `accounts/page.tsx:720` (loan meta: Principal · APR · Tenure · Paid · Residual), `:855` (FD meta: 5 items), loan/FD badge rows (lender + 3 badges), `:1569` (credit card `grid-cols-4` with mono "LKR 1,234,567.00"); account-detail credit stats `grid-cols-2 sm:grid-cols-5`.
- Evidence: `flex items-center gap-3` with no `flex-wrap`, and long strings.
- Mobile impact: loan and FD details, which users open precisely to check figures, clip or force horizontal overflow at 360–390 px.
- Fix: `flex-wrap gap-x-3 gap-y-1` (or a 2×2 definition grid), compact amounts, and never truncate money.

#### UI-52 Liabilities/Investments: stacked empty messages and tiny entry points
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `accounts/page.tsx:483-488`, `:519-548`, `:655-681`, `:820-848`.
- Evidence: with no liabilities, the tab shows an `EmptyState` "No liabilities" **and** "No installment plans active." **and** "No loans or leases active.". The "Add Ongoing Plan", "Add Loan / Lease" and "Add Fixed Deposit" actions are 11 px outlined chips (about 20 px tall) crammed beside the subtotal. These are the only ways to start the "add a loan" and "add an FD" flows. "Add Account" is a white primary button that only creates cash, bank and card accounts.
- Fix: one empty state per tab with clear primary CTAs ("Add loan", "Add fixed deposit"). Use a section header action at 44 px, or an "Add" button with a type chooser in the header.

#### UI-53 FD "Deposit proceeds" is one tap, with no progress or feedback
- Severity: **High** · Status: **CONFIRMED** · Effort: **S**
- Where: `accounts/page.tsx:96-119`, button `:920-926`.
- Evidence: there's no confirmation of amount or target account. The target is auto-picked (linked → funding → first bank/cash). There's no disabled/loading state, and errors go only to `console.error`. The button background is `--income` (red under swap). A double tap fires twice.
- Mobile impact: money moves to an account the user never chose, and failures are invisible.
- Fix: confirmation sheet (amount, target account picker), submitting state, success toast, inline error.

#### UI-54 The "Show archived" checkbox is a tiny native control in the header
- Severity: **Low** · Status: **CONFIRMED** (`image4.png`) · Effort: **S**
- Where: `accounts/page.tsx:309-318`.
- Fix: move it into a filter/overflow menu, or make it a 44 px toggle row at the bottom of the list.

#### UI-55 Account detail lacks list structure and actions
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **M**
- Where: `src/app/accounts/[id]/page.tsx`.
- Evidence:
  - The history is one unpaginated list with raw ISO dates, no day grouping, no running balance and no month filter.
  - The header puts name, a large mono balance, "Settle Card" and "Calibrate Balance" on one row.
  - There's no Edit, Archive or "Add transaction to this account" action.
  - On a cold deep link the live cache can be empty, so "Account not found." may flash before data loads (SUSPECTED).
- Fix: reuse the Daily grouping, add a month switcher and running balance, stack the header on mobile, add an overflow menu, and show a loading skeleton.

#### UI-56 Settle modal truncates the amounts being paid
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/components/account/settle-modal.tsx:137-170` (`grid-cols-3`, `truncate` on amounts).
- Evidence: the billed/total/custom chips cut amounts at about 110 px.
- Mobile impact: the user can't read the exact amount they're about to pay.
- Fix: a vertical radio list with full amounts.

### H. Loans and fixed deposits

#### UI-57 Loan detail header: the close button sits between the title and "Delete loan"
- Severity: **High** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/components/account/loan-detail-modal.tsx:280-292`, `:186`, `:208`.
- Evidence: the header row renders `[title + badges + meta] [X] [Edit loan] [Delete loan]` with `justify-between`. On a phone the X ends up mid-row, and the right-most (thumb-side) control is the red "Delete loan". Delete and close-loan use the native `confirm()`, unlike the ConfirmationModal used on the Accounts list. The meta line ("Original … • APR … • 360 Months • Due day … • Reducing Balance") is one long run-on line.
- Mobile impact: a user reaching for "close" can hit Delete. The native confirm in a standalone PWA looks like a system alert and states no amounts.
- Fix: X at the top-right on its own. Edit and Delete in an overflow menu, with Delete using ConfirmationModal and naming the remaining principal. Show the meta as a definition list.

#### UI-58 Pay EMI, close, edit and override fail silently, with no success feedback
- Severity: **High** · Status: **CONFIRMED** · Effort: **S**
- Where: `loan-detail-modal.tsx:148` (`if (!response.ok) return;`), `:89`, `:203` (`// ignore`), pay-EMI `if (res.ok) {…}` with no else branch and `console.error`, override the same.
- Evidence: these actions are online-only (`fetch`), but nothing tells the user that. On failure the dialog just stops spinning or stays open. On success it closes with no confirmation of what was recorded.
- Mobile impact: on a flaky connection users can't tell whether the EMI was logged. They retry and may double-pay once connectivity returns.
- Fix: an inline `role="alert"` error with the server message, a success toast ("EMI #14 logged: principal X, interest Y"), and disabled buttons with an "Needs connection" note when offline.

#### UI-59 Loan "Early Payoff" only closes the loan
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **M**
- Where: `loan-detail-modal.tsx:185-205`, button "Early Payoff".
- Evidence: it asks "close this loan?" and calls `/close`. There's no payoff amount, no source account and no payment transaction.
- Fix: rename it to "Mark loan closed", or build a payoff sheet (amount, account, optional fee).

#### UI-60 EMI account picker shows the opening balance
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `loan-detail-modal.tsx:654` (`{a.name} ({formatMoney(a.openingBalanceMinor)})`).
- Evidence: the figure in parentheses is the account's opening balance, not its current balance.
- Fix: show the ledger balance, or no figure.

#### UI-61 The EMI dialog has no breakdown or mobile-friendly input
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `loan-detail-modal.tsx:620-725`.
- Evidence: the amount is a `type="text"` input with no `inputMode="decimal"`, so a full keyboard opens. The dialog doesn't show which installment is being paid, its principal/interest split, or the balance afterwards. All controls are 32 px.
- Fix: a summary block ("Installment #14 due 5 Nov · Principal X · Interest Y · Balance after Z"), a decimal keypad, 44 px controls, and a bottom sheet.

#### UI-62 The inline loan edit form is cramped and unvalidated
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `loan-detail-modal.tsx:295-306`.
- Evidence: a 2-column grid of `px-2 py-1 text-xs` inputs (about 26 px tall), with wrap-around labels. There's no inline validation, failures return silently, and it's crowded into the modal header area on phones.
- Fix: a separate edit sheet with one column on mobile, field validation, and the impact explained ("Changing tenure regenerates the remaining schedule").

#### UI-63 FD premature-close dialog
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/components/account/fd-close-modal.tsx:84-170`.
- Evidence:
  - The confirm button is `bg-[var(--expense)]` (blue under swap, UI-04).
  - The account options show "(BANK_SAVINGS)".
  - The placeholder "1,000,000.00" looks like a pre-filled value.
  - The summary panel background uses the undefined `--surface-hover`.
  - It's a centred dialog with 32 px controls and no `inputMode`.
  - There's no "penalty = principal − proceeds" preview before confirming.
- Fix: the danger token, friendly labels, an "e.g." placeholder, a computed shortfall line, and the bottom-sheet pattern.

#### UI-64 Loan schedule uses cashflow colours and raw values
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `loan-detail-modal.tsx` desktop table and mobile cards (`:555-560`).
- Evidence: principal is `text-income` and interest `text-expense` (they flip under swap). Status chips show raw "SCHEDULED/PAID/OVERRIDDEN". Dates use device locale. "Override" is an 11 px text button per row.
- Fix: neutral colours, label map, shared date format, and a row tap to edit.

### I. Modals, sheets and forms (global)

#### UI-65 No dialog semantics, focus management or consistent back/Escape handling
- Severity: **High** · Status: **CONFIRMED** · Effort: **M**
- Evidence: 0 `role="dialog"` and 0 `aria-modal` across the app. Only `ConfirmationModal` handles Escape. Focus isn't moved into dialogs, trapped, or restored. The background stays scrollable and readable by screen readers. `useModalHistory` (Android back / iOS swipe closes the modal) is used by most account modals but **not** by the household role sheet, the SMS modal, the calibration modal, the icon picker or the mobile quick-add body. For those, the back gesture navigates away from the page with the dialog still showing.
- Mobile impact: VoiceOver/TalkBack users aren't told a sheet opened and can swipe into content behind it. The Android back button behaves differently per dialog.
- Fix: one `Sheet`/`Dialog` primitive (native `<dialog>` + `showModal()`, or a headless library) with title labelling, focus trap and restore, Escape, an inert background and `useModalHistory` built in. Migrate all ~18 overlays.

#### UI-66 Overlay patterns and button order differ between flows
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **M**
- Evidence:
  - Bottom sheets: account form, transaction edit, confirmation, early payoff, calibration, settle.
  - Centred dialogs: budget, FD create/close, loan create/detail, EMI, SMS, icon picker.
  - Full screen: mobile quick-add.
  - Button order: ConfirmationModal is Cancel→Confirm (right); early payoff is Confirm (left)→Cancel; transaction edit is Delete (left)→Save.
  - Close affordance: X icon in most, "Close" text in budget and the household sheet.
- Fix: bottom sheet on mobile, centred dialog on desktop, everywhere. Primary action on the right (or full width at the bottom), destructive actions separated.

#### UI-67 Confirmation patterns mixed; ConfirmationModal hides failures
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: native `confirm()` in `loan-detail-modal.tsx:186,208` and `window.confirm` in `shopping-list/page.tsx:114`; `ConfirmationModal` in `confirmation-modal.tsx:47-56` catches errors and only logs them; confirm button is `bg-red-600` (not tokenised).
- Evidence: if the confirmed action throws, the modal stays open with "Processing…" reset and no message.
- Fix: one confirmation component everywhere, with an `error` slot shown inline.

#### UI-68 Amount fields open the wrong keyboard; labels aren't linked to inputs
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Evidence: `inputMode` appears only twice (calibration and desktop quick-add, both `"none"`). Every other money input is `type="text"` (full alphabetic keyboard) or `type="number"` (no thousands separators, some keyboards lack "."). Examples: account opening balance and credit limit, transaction edit amount, EMI amount, FD close proceeds, settle custom, inbox amount, loan/FD/installment forms, budget limit. Most `<label>` elements have no `htmlFor`/`id` (accounts form, budget, transaction edit, loan, FD, installment, inbox, categories). Login, register, household and preferences are the exceptions.
- Fix: `inputMode="decimal"` + `type="text"` + inline validation for money. A shared `Field` component that wires `id`/`htmlFor`/`aria-describedby`/`aria-invalid`.

#### UI-69 `select-none` on whole sheets blocks copying values
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: transaction edit, confirmation, early payoff, calibration, quick-add roots.
- Fix: apply `select-none` only to buttons and handles.

### J. Quick add (core mobile flow)

#### UI-70 Mobile quick-add ignores the light theme and the colour-swap preference
- Severity: **High** · Status: **CONFIRMED** (code) · Effort: **M**
- Where: `src/components/transaction/mobile-quick-add.tsx:118-155`, `:267`, `:345`, and all the hard-coded hex/slate classes in the file.
- Evidence: the full-screen sheet is always `bg-[#12161A] text-white` with `slate-*` greys. Its type colours are `#EF4444` (expense) / `#3B82F6` (income), and its selected-state ring is always blue. None of it reads `--bg`, `--text`, `--income` or `--expense`.
- Mobile impact: light-theme users get a jarring black screen for the most frequent action. Colour-swap users see expense in red here and in blue everywhere else.
- Fix: rebuild the sheet on theme tokens (`--surface`, `--text`, `--income`, `--expense`, `--accent`).

#### UI-71 "Add New" category throws away the half-entered transaction
- Severity: **High** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `mobile-quick-add.tsx:811-822` (`closeQuickAdd(); router.push("/more/categories")`); back button `:274-282` (`closeQuickAdd` directly).
- Evidence: tapping "Add New" in the category grid closes the sheet and navigates away, discarding the amount, account, date and note. The back chevron also discards without asking.
- Mobile impact: a common flow ("I need a new category for this") loses the user's input.
- Fix: create the category inline in a nested sheet and return to the draft. Confirm discard when the draft isn't empty.

#### UI-72 Picking a category from the other group silently flips Expense ↔ Income
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `mobile-quick-add.tsx:228-238`, category grid shows both groups (`:765-808`).
- Evidence: in Expense mode the grid also lists Income categories under a small "Income" heading. Tapping one (e.g. "Salary") switches the whole transaction to Income, with no toast or highlight.
- Mobile impact: a mis-tap records spending as income and inflates the month's totals.
- Fix: show only the current type's categories, or flash an explicit notice ("Switched to Income") with undo.

#### UI-73 Quick add lacks save feedback, "Continue" and Split
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Evidence: after Save the sheet closes with no toast, so the only confirmation is spotting the row in the list. Mobile has no "Continue" (save and add another), though desktop does (`quick-add-modal.tsx:665-674`) and PRD §5.0 item 8 requires it. Neither variant has the PRD's "Split" toggle (Split exists only in the edit modal).
- Fix: success toast with Undo, a "Save & add another" secondary action on mobile, and a Split entry point.

#### UI-74 Quick-add fields and toggles aren't accessible
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: field rows are `div onClick` (`mobile-quick-add.tsx:397-561`); "Exclude from budget" is a bare `<button>` with no `role="switch"`, `aria-checked` or label (`:1101-1113`); keypad keys "⌫ × ÷ C" have no `aria-label`; the panel X (`:592-598`) has no label; the Templates star relies on `title`.
- Fix: buttons with names ("Category: Groceries, change"), switch semantics, labelled keypad keys.

#### UI-75 Mobile back label always reads "Trans."; no remembered account
- Severity: **Low** · Status: **CONFIRMED** · Effort: **S**
- Where: `mobile-quick-add.tsx:281`; `quick-add-modal.tsx` (`mobileAccountId` has no fallback, unlike desktop `accountId`).
- Evidence: the back button says "Trans." even when opened from Accounts or Budget. Mobile requires choosing the account on every entry, while desktop pre-selects one.
- Fix: label it "Cancel". Pre-select the last-used account per type, on both platforms.

### K. Shopping list

#### UI-76 Shopping list controls are too small
- Severity: **Medium** · Status: **CONFIRMED** (`image6.png`) · Effort: **S**
- Where: `src/app/more/shopping-list/page.tsx:154`, `:256`, `:278`, drag handle `:233-249`.
- Evidence: checkbox 20 px, pencil about 23 px, drag handle about 26 px, back arrow 18 px. In `image6.png` the row's only large target is the item text, which does nothing.
- Fix: make the whole row toggle the item (with check animation), move edit/delete to swipe or long-press, and use a 44 px drag handle.

#### UI-77 With no household, the list silently does nothing
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `shopping-list/page.tsx:71` (`if (!trimmedName || !householdId) return;`), `:219`.
- Evidence: users without a household can type an item and press Add. Nothing happens, and the page says "Your shopping list is empty." Toggle, edit, delete and reorder have no error handling.
- Fix: an explicit state ("Shopping lists are shared with your household — Create household") and error toasts.

#### UI-78 Shopping list polish
- Severity: **Low** · Status: **CONFIRMED** (`image6.png`, code) · Effort: **S**
- Evidence:
  - Delete is only reachable inside edit mode, with no undo.
  - Drag-reorder is pointer-only (no keyboard/a11y alternative).
  - The drop-target highlight uses the undefined `--surface-hover`, so it's invisible.
  - The quantity placeholder "2 kg" looks like an entered value.
  - The FAB and "+ Add" are both red adds (UI-16).
  - "Clear completed" uses `window.confirm`.
- Fix: "e.g. 2 kg" placeholder, undo toast, move up/down actions for accessibility, and remove the FAB here.

### L. Household

#### UI-79 Transfer ownership is one tap, with no confirmation
- Severity: **Critical** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/app/more/household/page.tsx:386-399` → `handleTransferOwnership` (`:178-189`).
- Evidence: the button calls the mutation directly. On phones it's icon-only (12 px ⇄ icon; the "Transfer" label is `hidden sm:inline`, `:397`), 28 px tall, placed right beside an icon-only red Remove button.
- Mobile impact: an accidental tap permanently hands household ownership to another member and the current owner loses owner rights. There's no undo.
- Fix: ConfirmationModal stating the consequence, with type-to-confirm (household name), a text label on mobile, and separation from Remove.

#### UI-80 Remove member and Leave household have no confirmation
- Severity: **High** · Status: **CONFIRMED** · Effort: **S**
- Where: `household/page.tsx:402-413` (Remove → `handleRemoveMember`), `:292-299` (Leave → `handleLeaveHousehold`).
- Evidence: both act immediately. Remove is an icon-only 28 px bin on mobile. Role changes from the desktop `<select>` also apply on change.
- Fix: confirmation naming the member and the effect ("They lose access to shared accounts"), and an explicit Save for role edits.

#### UI-81 Household feedback appears off-screen on phones
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `household/page.tsx:219-230` (banners at the top), invite form at the bottom (`:428-505`).
- Evidence: after "Add Member" (at the bottom of a long page), the success or error banner renders at the top, out of view. It isn't a live region. Success uses `--income` and error uses `--expense`, so they swap colours (UI-04).
- Fix: show feedback next to the form or as a toast (`role="status"` / `role="alert"`), using semantic colours.

#### UI-82 Household: raw roles, single household, unclear "invite"
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Evidence:
  - Roles appear as enums everywhere, including the mobile role sheet, which lists `CO_OWNER / CONTRIBUTOR_ADD_ONLY / VIEWER` with no descriptions (`:557`). The permissions card sits at the very bottom.
  - Only `households[0]` is shown (`:197`), while the Shopping List supports picking one of several.
  - "Add Member" adds an existing user immediately. The user isn't told the other person won't receive an invitation or need to accept.
- Fix: human role names with one-line descriptions inside the picker, a household switcher, and clear copy ("They'll see shared accounts right away").

### M. Preferences, Developer, Categories, Inbox

#### UI-83 Reminders report "Reminders active" while push uses a fake subscription
- Severity: **Critical** · Status: **CONFIRMED** · Effort: **M**
- Where: `src/app/more/preferences/page.tsx:139-151`.
- Evidence: after the permission prompt, the code builds a made-up `https://fcm.googleapis.com/fcm/send/test-…` endpoint with mock keys, saves it, and shows "Reminders active".
- Mobile impact: users rely on a daily reminder that can never arrive. This is a false success state for a PWA-specific feature.
- Fix: use `registration.pushManager.subscribe({ applicationServerKey })` with the VAPID key from `/api/push/vapid-public-key`. Show real errors. On iOS, explain that the app must be installed first (the note exists but only appears in Safari).

#### UI-84 Preferences: silent failures and ambiguous controls
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `preferences/page.tsx:117` (`// ignore`), `:316`, `:355`, `:416`.
- Evidence:
  - Save errors are swallowed, so the button just stops.
  - "Settings saved successfully" uses `--income`.
  - Two identical "Save Settings" buttons on one page.
  - The theme button shows the *current* state ("Dark Mode"), not the action, and has no "System" option.
  - The switch has no visible focus and no text inside its label.
  - Inputs are 32 px; timezone and currency are free-text inputs with datalists.
- Fix: inline error states; one autosave or one Save per section with distinct labels; a three-way theme segmented control; select pickers; 44 px rows.

#### UI-85 "Regenerate Key" silently breaks SMS ingest
- Severity: **High** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/app/more/developer/page.tsx:71-83`, `:212-219`.
- Evidence: one tap invalidates the key that the user's iOS Shortcut sends, with no confirmation. Errors are ignored (`// ignore`). Gemini save failures are also ignored.
- Fix: confirmation ("Your Apple Shortcut will stop working until you paste the new key"), error feedback, and a link to the Shortcuts guide.

#### UI-86 Category and bookmark deletes are instant; the icon field asks for a code name
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/app/more/categories/page.tsx:91-93`, `:285-306`; `bookmarks/page.tsx:100-106`, `:352`.
- Evidence: delete runs on tap, with no confirmation, no undo and no warning that transactions and budgets using it will show "Uncategorized". The icon field is a free-text input expecting a Lucide identifier ("e.g. ShoppingCart, Utensils"), next to the picker. Edit/delete icons are about 25 px.
- Fix: confirm with a usage count (or merge into another category), undo toast, drop the free-text icon field.

#### UI-87 SMS Review Inbox (mobile): dense forms, raw values, distant errors
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/components/inbox/inbox-items.tsx:70-110`, `:150-180`; `src/app/more/inbox/page.tsx:266-273`.
- Evidence:
  - The category options include Lucide names ("ShoppingCart Groceries", same bug as UI-43).
  - Account options show "(BANK_SAVINGS, LKR)".
  - "Amount (LKR) *" is marked required but is optional in code. Fields don't pre-fill from the parsed SMS.
  - Labels are 10 px and controls 32 px.
  - Post, Ignore and Retry sit side by side, and Ignore has no undo.
  - Errors appear at the top of the page, not on the card the user is editing.
- Fix: pre-fill from `parsedPayload`, show friendly labels, put errors on the card, add undo for Ignore, and use a one-column layout on phones.

### N. Authentication

#### UI-88 Login and registration basics are missing
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/app/login/page.tsx`, `src/app/register/register-form.tsx`, `src/app/register/page.tsx`.
- Evidence:
  - Positive `tabIndex` 1–4.
  - No show-password toggle and no "Forgot password".
  - Password minimum 6 characters, with the hint only in a placeholder.
  - `form action="javascript:void(0);"` (React 19 blocks `javascript:` URLs).
  - "registration closed" in lowercase.
  - After registering the user lands on an empty app (UI-23).
- Fix: remove the tabIndex values and `action`, add a password visibility toggle, a visible password rule and a recovery path, and fix the copy.

### O. PWA, status and states

#### UI-89 The update banner sits exactly on top of the FAB and its icon always spins
- Severity: **Medium** · Status: **CONFIRMED** (code) · Effort: **S**
- Where: `src/components/pwa-manager.tsx:144`, `:156`; `src/components/ui/fab.tsx:36`.
- Evidence: both use `fixed right-4 bottom-mobile-offset`. The banner (`z-50`) covers the FAB (`z-30`). The "Reload" icon has `animate-spin` before it's tapped. `animate-in fade-in slide-in-from-bottom-2` needs the tailwindcss-animate plugin, which isn't installed, so the entry animation never runs.
- Fix: a full-width banner above the bottom nav (or below the header), a static icon until tapped, and real keyframes.

#### UI-90 Install prompt never shown; splash and status bar don't follow the chosen theme
- Severity: **Low** · Status: **CONFIRMED** (code) / status-bar look **SUSPECTED** · Effort: **S**
- Where: `pwa-manager.tsx:19-25` (captures `beforeinstallprompt`, nothing listens), `public/manifest.json` (fixed dark `theme_color`/`background_color`, `orientation: portrait-primary`, no `id`, `shortcuts` or `screenshots`), `layout.tsx` (`themeColor` by media query only; `appleWebApp.statusBarStyle: "default"`).
- Mobile impact: Android users never see an "Install app" CTA. Light-theme users get a dark splash. Forcing light or dark inside the app leaves the status/address bar in the OS colour.
- Fix: an "Install app" row on More, update `<meta name="theme-color">` when the theme changes, a manifest `shortcuts` entry ("Add expense"), and `id`/`scope`.

#### UI-91 Sync status is hard to find, not operable, and not explained
- Severity: **Medium** · Status: **CONFIRMED** (`image.png`, `image4.png` vs `image2.png`, `image3.png`, `image5.png`) · Effort: **S**
- Where: `src/components/sync-provider.tsx:292-334`.
- Evidence: the indicator is a `div` with `onClick` (not focusable). It's shown only on Trans. and Accounts. "Synced" uses the income colour (UI-04). "Error (n)" gives no details and no way to resolve. Offline shows only a small pill. There's no app-wide offline banner explaining which actions need a connection (loan EMI, FD proceeds, household, inbox).
- Fix: a header-level status button on every screen that opens a sync sheet listing pending/failed changes (retry/discard), plus an offline banner.

#### UI-92 Loading and error states are thin
- Severity: **Medium** · Status: **CONFIRMED** (code); empty-flash **SUSPECTED** · Effort: **M**
- Evidence:
  - Dexie-backed screens have no skeletons. The live cache warms tabs, but a cold deep link can render "No transactions yet" or "Account not found." before data arrives.
  - Server-backed pages swallow errors: `sms-activity/page.tsx:43` (`// ignore` → "No bank SMS activity found"), developer settings, preferences.
  - Loading copy is plain text ("Loading household data...", "Loading schedule...").
- Fix: skeleton rows for lists, plus one `ErrorCard` with Retry that distinguishes offline from server error.

#### UI-93 Screen readers miss state changes, icon buttons and charts
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Evidence:
  - 0 `aria-live` regions: undo toast, saved notices, reminder status, sync state, PWA banner, household banners and inbox errors are all silent.
  - Icon-only buttons with no name: ConfirmationModal close, SMS modal close, transaction-edit close, loan-detail close, FD-close X, filter close, search clear, quick-add panel X.
  - Segmented controls have no `role="tablist"`/`aria-selected`.
  - The donut and trend have no text alternative.
- Fix: a live-region toast system, `aria-label` on every icon button, tab semantics in the shared control, and a chart alt text or table.

---

## 4. Suggested fix order (mobile impact first)

1. **Same-day fixes (S):** UI-24 current month; UI-01 `--color-hairline`; UI-02 Budget button token; UI-43 icon names; UI-44 expense-only budgets; UI-39 Uncategorized drill-down; UI-79/UI-80/UI-85/UI-19 confirmations; UI-16 FAB scope and padding; UI-89 banner position.
2. **Trust and feedback (S–M):** UI-29 excluded rows; UI-58/UI-53/UI-67 error and success feedback; UI-83 real push; UI-71/UI-72 quick-add data safety; UI-23 onboarding.
3. **Design-system pass (M):** UI-04/UI-05 semantic tokens; UI-06 type scale; UI-08/UI-09/UI-10 shared SegmentedControl, Button and AppHeader; UI-15 tap targets; UI-65/UI-66 a Sheet primitive; UI-70 a themed quick-add.
4. **Accessibility pass (M):** UI-14 focus-visible; UI-32 button rows; UI-68 fields; UI-93 live regions; UI-13 contrast.
5. **Layout and parity (M–L):** UI-51/UI-50/UI-56 wrapping and compact money; UI-55 account detail; UI-22 desktop dashboard.

### P. Additional form findings (adding a loan or FD; editing splits)

#### UI-94 Loan and FD create forms open pre-filled with sample money values
- Severity: **Medium** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/components/account/loan-modal.tsx:23-26` (`"1200000.00"`, APR `"12.0"`, tenure `"12"`); `src/components/account/fixed-deposit-modal.tsx:25-27` (`"1000000.00"`, `"12.0"`, `"12"`).
- Evidence: the fields hold real values, not placeholders. A user who only changes the lender name can save a 1.2M loan at 12% over 12 months.
- Mobile impact: on a small screen the user may not scroll to check every field before tapping Save.
- Fix: start the inputs empty with "e.g." placeholders and require the fields.

#### UI-95 Split amount fields reformat on every keystroke
- Severity: **High** · Status: **CONFIRMED** · Effort: **S**
- Where: `src/components/transaction/transaction-edit-modal.tsx:498-507`.
- Evidence: `value={(item.amountMinor / 100).toFixed(2)}` with `onChange` → `parseMoneyToMinor`. Each keystroke is parsed and re-rendered as a fixed two-decimal string. Typing into "0.00" produces "0.005" → "0.01", and the caret jumps to the end. The field is 11 px mono, about 28 px tall.
- Mobile impact: splitting a bill, a core PRD feature, is close to impossible on a phone keyboard.
- Fix: keep a string per split row, parse on blur or save, `inputMode="decimal"`, and 44 px fields.

---

## 5. Comparison with the earlier run (`audit/2026-10-20/frontend-uiux.md`)

I did the audit above from the code and screenshots first, then read the earlier report. The earlier run didn't use the screenshots and pre-dates a few commits (latest: `0c401ec` "add confirmation modal component and integrate into account actions", `abc5c54` "useModalHistory", `1e2ff37` native tab stack). Several file paths it cites have moved. Settings that lived in `more/page.tsx` are now in `more/preferences` and `more/developer`. Its IDs are kept below.

### 5.1 Fixed or improved since the earlier run

| Earlier ID | Earlier finding | Status now | Evidence |
|---|---|---|---|
| FIN-05 | Account delete one tap, no confirmation | **Partly fixed**: a ConfirmationModal now guards Delete and Archive. Still a hard delete (`lib/sync/client.ts` `db.accounts.delete`), and the bin is still a 25 px icon (UI-48). | `accounts/page.tsx` `handleDelete` → `setConfirmModal` |
| FIN-10 | Cancel installment plan one tap | **Fixed** (ConfirmationModal on the list and the detail page) | `accounts/page.tsx` `handleCancelPlan`; `accounts/[id]/page.tsx` `cancellingPlan` |
| FIN-14 | Loan/FD start date always "now" | **Fixed** (start-date field present) | `loan-modal.tsx:27`, `fixed-deposit-modal.tsx:28` |
| MOB-01 | Safe-area insets ignored | **Fixed** (`pt-shell-safe`, `bottom-nav-safe`, `bottom-mobile-offset`, `pb-sheet-safe`, `modal-sheet-dialog` in `globals.css`) | `globals.css` |
| MOB-02 | `h-screen` shell | **Fixed** (`fixed inset-0 h-[100dvh]`) | `layout.tsx` body |
| NAV-02 | Dead "Export & Import" row | **Row removed**, but the export/import feature is still missing (UI-18) | `more/page.tsx` sections |
| FORM-04 | Quick-add defaults to the first category; categories mixed | **Partly fixed**: grouped by type, and mobile now requires an explicit pick. Desktop still falls back to the first category of the type. Mixed groups in the mobile grid now flip the type silently (UI-72). Budget still lists all types (UI-44). | `quick-add-modal.tsx`, `mobile-quick-add.tsx:228-238` |
| FORM-05 | Calibration keypad has no Clear | **Partly fixed**: `NumberKeypadPopup` has Clear. The value is still pre-filled with the current balance. | `number-keypad-popup.tsx:65-68` |
| FORM-10 | Category icon is free text; no edit | **Mostly fixed**: icon picker and edit flow exist. The free-text field remains (UI-86). | `categories/page.tsx` |
| A11Y-01 | No dialog semantics / Escape | **Slightly improved**: ConfirmationModal handles Escape, and `useModalHistory` closes most account modals on back. Still no `role="dialog"` or focus trap (UI-65). | `confirmation-modal.tsx:36-44` |
| STATE-01 | Dexie loading looks empty | **Mitigated**: `useCachedLiveQuery` + `warmLiveCache` serve the last snapshot. Cold deep links can still flash (UI-92). | `sync-provider.tsx:37-67` |

### 5.2 Still present (re-confirmed in this run)

| Earlier ID | Now tracked as | Note |
|---|---|---|
| DATE-01 month pinned to Oct 2026 | UI-24 | Unchanged in 4 files; every screenshot shows October 2026. |
| DATE-02 calendar selection stale | UI-33 | Unchanged. |
| DATE-03 inconsistent dates | UI-27 | Unchanged. |
| DATE-04 safe-to-spend for other months | UI-46 | Unchanged. |
| DEST-01 household one-tap actions | UI-79, UI-80 | Unchanged. I raise transfer ownership to Critical because the mobile button is icon-only next to Remove. |
| DEST-02 logout without outbox check | UI-19 | Unchanged; prominent in `image5.png`. |
| DEST-03 regenerate webhook key | UI-85 | Moved to `more/developer/page.tsx`, still unconfirmed. |
| DEST-04 delete budget/bookmark/category/ignore | UI-47, UI-86, UI-87 | Unchanged. |
| FIN-02 deposit proceeds | UI-53 | Unchanged. |
| FIN-06 loan actions fail silently | UI-58 | Unchanged. |
| FIN-07 Early Payoff = close | UI-59 | Unchanged. |
| FIN-08 EMI picker shows opening balance | UI-60 | Unchanged (`loan-detail-modal.tsx:654`). |
| FIN-09 installment early payoff swallows errors | (covered by UI-67/UI-58 pattern) | `early-payoff-modal.tsx:60-62` still `console.error` only. |
| FIN-11 duplicate merge | UI-36 | Unchanged. |
| FIN-15 sample prefilled values | UI-94 | Unchanged. |
| FIN-16 money inputs lack `inputMode` | UI-68 | Unchanged. |
| FORM-01 split input untypeable | UI-95 | Unchanged. |
| FORM-02 / FORM-03 labels and errors not linked | UI-68 | Unchanged. |
| FORM-07 stale quick-add initial type | not re-listed | Still present: `quick-add-context.tsx` `closeQuickAdd` doesn't reset `initialType`/`initialAccountId`. |
| FORM-08 auth form issues | UI-88 | Unchanged. |
| STATE-02 empty state ignores filters | UI-31 | Unchanged. |
| STATE-03 swallowed fetch errors | UI-84, UI-85, UI-92 | Partly moved to React Query, but many `// ignore` remain. |
| STATE-05 no resolution UI for rejected mutations | UI-91 | Unchanged. |
| STATE-07 household banners not announced | UI-81 | Unchanged. |
| A11Y-02 mouse-only rows | UI-32 | Unchanged. |
| A11Y-03 icon buttons without names | UI-93 | Unchanged. |
| A11Y-04 tabs/toggles expose no state | UI-08, UI-74, UI-93 | Unchanged. |
| A11Y-05 contrast | UI-13 | Unchanged. |
| A11Y-06 search unlabeled | UI-38 | Unchanged. |
| A11Y-07 charts lack text alternative | UI-40, UI-93 | Unchanged. |
| A11Y-08 no live regions | UI-93 | Unchanged. |
| A11Y-09 tap targets | UI-15 | Unchanged; now screenshot-confirmed (`image4.png`, `image6.png`). |
| A11Y-10 font sizes below scale | UI-06 | Unchanged (93×10 px, 189×11 px). |
| A11Y-11 month switcher focusable div | UI-11 | Unchanged. |
| A11Y-12 `select-none` on sheets | UI-69 | Unchanged. |
| A11Y-13 raw enums/jargon | UI-28 | Unchanged. |
| FMT-01 currency hard-coded | UI-26 | Unchanged. |
| FMT-02 / FMT-03 formats and signs | UI-25 | Unchanged; three formats visible in `image.png`. |
| CALC-04 stats drill-down | UI-39, UI-42 | Still present, plus a new Uncategorized bug. |
| CALC-05 trend 6% bars | UI-41 | Unchanged. |
| CALC-06 summary rounding | UI-20 | Unchanged. |
| MOB-03 FAB overlap everywhere | UI-16 | Unchanged; now screenshot-confirmed (`image5.png`, `image6.png`). |
| MOB-04 dense rows overflow | UI-51, UI-56 | Unchanged. |
| MOB-05 header controls duplicated, AppHeader unused | UI-10, UI-12 | Unchanged. |
| NAV-03 placeholder EmptyState / fake email | UI-18 | Unchanged; visible at the bottom of `image5.png`. |
| NAV-04 back navigation inconsistent | UI-21 | Unchanged. |
| NAV-05 only `households[0]` | UI-82 | Unchanged. |
| PWA-01 fake push subscription | UI-83 | Moved to `more/preferences/page.tsx:139-151`; unchanged. |
| PWA-08 install prompt unused | UI-90 | Unchanged. |
| PWA-09 manifest polish | UI-90 | Unchanged. |
| VIS-01 invisible Budget buttons | UI-02 | Unchanged; `image3.png` shows the fill missing. |
| VIS-02 undefined tokens | UI-03 (+ new UI-01) | Unchanged, and the scope is wider than reported (see 5.3). |
| VIS-03 hard-coded palette | UI-05 | Unchanged. |
| VIS-06 misc copy | UI-28, UI-47, UI-88 | Unchanged. |

Not re-verified here because they're outside the visual/UX area (owned by the other v2 reports): FIN-01, FIN-03, FIN-04, FIN-12, FIN-13, CALC-01..03, SEC-01..05, STATE-04, STATE-06, PWA-02..07, PWA-10, PWA-11, PERF-01/02, PRV-01/02, DEAD-01/02, VIS-04/05, MOB-06, NAV-01, NAV-06, NAV-07, STATE-08.

### 5.3 Missed by the earlier run (new in this run)

These weren't reported before. Most were found by checking the screenshots against the code.

- **UI-01** `divide-hairline` doesn't exist, so every list and summary divider is `currentColor` (bright white in `image5.png`, `image.png`, `image4.png`). VIS-02 missed this token.
- **UI-04** The colour swap flips success, danger and status colours, not just cashflow (Synced, saved notices, Log Out, Premature Close, balances).
- **UI-07** Mobile input text is 16 px next to 12 px UI (`image.png`).
- **UI-08 / UI-09 / UI-10 / UI-11** Component inconsistency across tabs: three segmented styles, four primary-button styles, five header layouts, month switcher framing.
- **UI-17** Bottom nav active state and re-tap behaviour.
- **UI-18** SMS Review Inbox buried under "Developer"; jargon in the More descriptions.
- **UI-22** Desktop parity gaps in `image-desktop.png` (duplicate title, duplicate CTAs, missing dashboard).
- **UI-23** No onboarding; quick-add has no path to create the first account.
- **UI-29** Summary "Income LKR 0.00" next to a "+LKR 9,800,000.00 INCOME" row with a "LKR 0.00" day header (`image.png`). The Calendar counts the same row.
- **UI-30** Row hierarchy: enum titles, raw bank refs, "added by" in expense-red.
- **UI-33** Calendar "today" ring renders as `currentColor` (the same as selected), plus excluded rows counted.
- **UI-39** Tapping Uncategorized in Stats does nothing (`image2.png`).
- **UI-43** Budget/inbox print Lucide icon names as text ("Wallet Salary", `image3.png`).
- **UI-44** An income category (Salary) budgeted in `image3.png` (FORM-04 only noted that the picker mixes types).
- **UI-45** Budget progress track invisible (`image3.png`).
- **UI-48 / UI-49** Account-row action adjacency; SMS sender IDs shown as subtitles (`image4.png`).
- **UI-52** Triple empty state on Liabilities; tiny add chips for loans, FDs and plans.
- **UI-57** Loan-detail header puts X between the title and "Delete loan".
- **UI-61 / UI-62 / UI-63** EMI dialog lacks a breakdown; cramped loan edit form; FD-close details.
- **UI-70** Mobile quick-add hard-codes a dark palette and its own red/blue, ignoring theme and swap.
- **UI-71** "Add New" category discards the draft transaction.
- **UI-72** Silent Expense↔Income flip from the category grid.
- **UI-73** No save feedback or "Continue" on mobile; no Split in quick add.
- **UI-76 / UI-77 / UI-78** Shopping List (a feature added after the earlier run): tap targets, silent no-household state, polish (`image6.png`).
- **UI-81 / UI-82** Household feedback off-screen; role picker without descriptions.
- **UI-87** Inbox mobile cards (icon-name text, required-but-optional amount, distant errors).
- **UI-89** PWA update banner placed exactly over the FAB, with a permanently spinning icon.

### 5.4 Net change

Of the 106 earlier findings: 11 are fixed or improved (2 fully, 9 partly), about 50 UI/UX items are still present and re-confirmed above, and the rest weren't in this report's area. This run adds roughly 35 issues the earlier run didn't catch. The single biggest regression in risk is the household ownership transfer, which on mobile is now an unlabeled icon-only button next to Remove.

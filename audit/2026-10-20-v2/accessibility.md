# Hard Money: Accessibility Audit (WCAG 2.2 AA, mobile PWA focus)

**Date:** 2026-10-20 (second audit run of the day)
**Scope:** every page under `src/app` and every component under `src/components`, plus `public/manifest.json`. The 7 screenshots in `audit/` were captured from the current build.
**Method:** read-only. Source reading, two AST scans over all `.tsx` files (TypeScript compiler API: buttons/links without an accessible name, form controls without a programmatic label, `onClick` on non-interactive elements), `grep` for ARIA, focus and motion patterns, and a Node script that computes WCAG relative-luminance contrast from the real colour values in `src/app/globals.css` and the Tailwind palette classes used in the code. No code was changed, no dev server was run, and the database was not touched.

> **Limitation.** Contrast values below are computed from code tokens, and screen-reader behaviour is predicted from markup. Neither replaces testing with VoiceOver (iOS Safari, installed PWA), TalkBack (Android Chrome, installed PWA), an external keyboard, Switch Control, 200% text and 320 px viewports, followed by expert review. Treat this report as a prioritised defect list to fix and then validate manually. It is not a conformance claim.

### Screenshot index

The screenshot file names don't match screen order, so I mapped each file by its pixel size and content.

| File | Size (px) | Screen | Theme |
|---|---|---|---|
| `audit/image.png` | 653×1041 | Trans. tab, Daily view (mobile) | Dark |
| `audit/image2.png` | 651×1031 | Stats tab, Expense donut (mobile) | Dark |
| `audit/image3.png` | 659×1044 | Budget tab (mobile) | Dark |
| `audit/image4.png` | 643×1034 | Accounts tab, Cash & Bank (mobile) | Dark |
| `audit/image5.png` | 650×1042 | More / Settings (mobile) | Dark |
| `audit/image6.png` | 646×1028 | More → Shopping List (mobile) | Dark |
| `audit/image-desktop.png` | 1186×1047 | Trans. tab with sidebar (desktop) | Dark |

All screenshots are dark theme. Judging by the 11 px bottom-nav labels at roughly 1:1, the mobile captures appear to be a ~640 CSS px wide emulated viewport. They don't show light theme, 320–390 px phones, enlarged text or open dialogs. Findings for those cases come from code.

---

## 1. Current accessibility posture

### 1.1 Shell, landmarks and semantics
- `src/app/layout.tsx:49` sets `<html lang="en">` (passes 3.1.1). The viewport (`layout.tsx:17-26`) is `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`. It has **no** `maximum-scale` or `user-scalable=no`, so pinch-zoom is allowed (passes 1.4.4 at the viewport level). `globals.css:196-202` forces 16 px on mobile inputs so iOS doesn't auto-zoom. That's good, and it doesn't block zoom.
- The body is `fixed inset-0 … overflow-hidden` (`layout.tsx:57`, `globals.css:91-105`). All scrolling happens inside `ScrollContainer` (`navigation/scroll-container.tsx`). Content that overflows horizontally is clipped, not scrollable (see A11Y-20).
- Landmarks: each main tab page and each `/more/*` and `/accounts/[id]` page renders its own `<main>`. `NativeTabContainer` keeps visited tabs mounted and marks the inactive ones `hidden` and `inert` (`native-tab-container.tsx:29-31`), so only one `<main>` is exposed at a time. This is a good pattern. Mobile uses `<nav>` (`bottom-nav.tsx:32`) and desktop uses `<aside><nav>` (`sidebar.tsx:63,94`). CSS hides one of them, so neither needs a label today. `/login`, `/register` and `/offline` have **no** `<main>` (A11Y-23).
- Navigation: bottom-nav and sidebar items are real `Link`s with visible text and `aria-current="page"` (`bottom-nav.tsx:52`). Tab switches skip the Next router (`tab-navigation-context.tsx:124` `history.pushState`), so the Next route announcer isn't triggered. Every route has the same `document.title`, "Hard Money" (A11Y-17).
- Headings: every page has exactly one `<h1>` (19 total). Section headings are almost always styled `<span>`s, and the next real heading after the `<h1>` is often an `<h3>` (A11Y-18).
- Icons: `lucide-react` adds `aria-hidden` to icons without an accessible prop (`node_modules/lucide-react/dist/esm/Icon.mjs:43-52`). Decorative icons are therefore silent, but an icon-only button with no `aria-label` has an **empty** name.
- Interactive rows: transaction rows, budget cards, calendar days, stats category rows, donut slices, the inbox master list, SMS-activity rows and the sync chip are all `div onClick` (29 instances from the AST scan, A11Y-01). The mobile Quick Add form is built the same way (A11Y-02).
- Dialogs: there are 18 hand-rolled `fixed inset-0` overlays. None has `role="dialog"` or `aria-modal`, none traps focus or restores it on close, and only `ConfirmationModal` handles Escape (A11Y-03). Since the earlier run, `useModalHistory` (`hooks/use-modal-history.ts`) closes 12 of them on Android back and the iOS edge-swipe.

### 1.2 Where names and labels come from
- AST scan: **135 form controls, of which 45 have a programmatic label** (wrapping `<label>`, `htmlFor`/`id`, or `aria-label`). The other 90 have a visible `<label>` that isn't linked to its control, or only a placeholder (A11Y-04). The well-labelled screens are Login, Register, Preferences, Developer, Household (mostly), the Shopping List and the Inbox item form.
- ARIA in use: `aria-label` on some buttons, `aria-current` on nav, `role="alert"` only on the Login and Register errors. There are **zero** uses of `aria-live`, `role="status"`, `aria-invalid`, `aria-describedby`, `aria-expanded`, `aria-pressed`, `aria-selected`, `aria-checked`, `role="switch"`, `role="tab"` and `role="dialog"`.
- About 20 icon-only controls rely on `title` alone. iOS VoiceOver usually exposes `title` as the name, but sighted touch users never see it and the names lack context ("Edit", "Delete").

### 1.3 Where colour and contrast come from
Tokens are in `src/app/globals.css:13-89`: `:root` holds the light theme, `.dark`/`[data-theme=dark]` holds dark, and `prefers-color-scheme` acts as a fallback. An inline script in `layout.tsx:51-55` applies the saved theme before first paint. The "colour swap" option (`globals.css:26-30,45-51`) exchanges the income and expense colours.

Computed contrast for the core tokens (AA needs 4.5:1 for normal text, 3:1 for large text and UI components):

| Pair | Dark | Light |
|---|---|---|
| `--text` on `--bg` | 15.86 ✅ | ≈16 ✅ |
| `--text-muted` on `--bg` / `--surface` | 6.95 / 6.31 ✅ | 5.00 / 4.62 ✅ |
| `--text-muted` on `--border` (accounts tab bar track) | 5.17 ✅ | 4.00 ❌ |
| `--income` on `--bg` / `--surface` | 6.13 / 5.57 ✅ | 6.04 ✅ |
| `--expense` on `--bg` / `--surface` | 6.24 / 5.66 ✅ | 5.46 ✅ |
| `--accent` text on `--bg` / `--surface` | 5.11 / 4.64 ✅ | 5.46 / 5.05 ✅ |
| **White on `--accent`** (every primary button) | **3.67 ❌** | 5.46 ✅ |
| `--warning` text on `--bg` / `--surface` | 9.29 ✅ | **2.68 / 2.48 ❌** |
| `--border` vs `--bg` (input and card outlines) | **1.34 ❌** | **1.25 ❌** |
| `--surface` vs `--bg` (input fill vs card) | **1.10** | **1.08** |

Hard-coded Tailwind colours (`text-red-500`, `text-amber-500`, `text-blue-500`, `bg-amber-500`, `slate-*`, `#EF4444`, `#3B82F6`) bypass the tokens and cause most of the failures listed in A11Y-07.

Three referenced tokens are **undefined**: `--primary` (Budget buttons), `--surface-hover` (29 uses) and `--muted` (sync chip). Tailwind classes such as `border-accent`, `text-accent`, `bg-accent`, `ring-primary` and `divide-hairline` aren't generated because `@theme` (`globals.css:3-11`) defines no `--color-accent`, `--color-primary` or `--color-hairline` (A11Y-08, A11Y-27).

### 1.4 Focus, motion, theming
- Focus: there's no `:focus-visible` styling anywhere (0 uses). Buttons rely on the browser's default ring. 108 elements set `outline-none` and replace it with a 1 px ring (`focus:ring-1 focus:ring-[var(--text)]`, 45 uses) or a border-colour change (`focus:border-[var(--accent)]`, 55 uses). Some replacements are missing or invalid (A11Y-13).
- Motion: `globals.css:322-328` disables the view-transition page animations under `prefers-reduced-motion`. That's the only reduced-motion rule in the codebase. Spinners, `transition-all`, `active:scale-*` and the sidebar width animation aren't covered (A11Y-25).
- Dark mode is fully tokenised and follows the system theme by default (`theme-provider.tsx:20,27`). The full-screen mobile Quick Add is hard-coded dark (`#12161A`) in both themes (A11Y-26).
- PWA: `public/manifest.json` locks `"orientation": "portrait-primary"` (A11Y-10).

### 1.5 Existing safeguards
- `tests/e2e/s01-app-shell.spec.ts:151-175` runs `@axe-core/playwright` (wcag2a/aa) on `/` only, in light and dark, with no dialogs open. It can't catch any finding below that lives on another route or inside a dialog.
- `eslint.config.mjs` extends `eslint-config-next/core-web-vitals`, which includes a small `jsx-a11y` subset (per `node_modules/next/dist/docs/03-architecture/accessibility.md`). It doesn't enable `click-events-have-key-events`, `no-static-element-interactions`, `label-has-associated-control` or `control-has-associated-label`, which would flag most of A11Y-01, A11Y-04 and A11Y-05.
- PRD §5.0/§6 (`PRD.md:715-750,800`) requires WCAG AA contrast in both themes, a 12/14/16/20/28 type scale and a "keyboard-navigable desktop UI".

### 1.6 What already works
- Pinch-zoom is allowed, `lang` is set, and inputs don't trigger iOS auto-zoom.
- Safe-area insets are applied to the shell top, bottom nav, FAB and sheets (`globals.css:205-255`). This was fixed since the earlier run.
- Bottom-nav targets are about 75×64 px and the FAB is 52×52 px (`fab.tsx:36`, `w-13 h-13`). Both have names.
- Inactive tabs are `inert`, so they don't pollute the swipe order.
- The Shopping List names its icon buttons with the item: "Edit Suger", "Delete Suger", "Check Suger", "Drag to reorder Suger" (`shopping-list/page.tsx:236,255,265-267,277`). This is the pattern to copy elsewhere.
- Login and Register use `htmlFor`/`id`, `autoComplete` (passes 1.3.5 and 3.3.8) and `role="alert"` errors.
- Native `<select>`s are kept, so pickers use the platform's accessible wheel or list.
- The Android back gesture and iOS edge-swipe close 12 sheets (`useModalHistory`). `ConfirmationModal` handles Escape.
- The month switcher's swipe gesture has button alternatives (passes 2.5.1).

---

## 2. Severity summary

| Severity | Count | Meaning |
|---|---|---|
| Critical | 2 | Blocks a core mobile task (add or edit a transaction) for screen-reader, keyboard or switch users |
| High | 8 | Fails WCAG 2.2 AA on core screens, with a serious barrier |
| Medium | 12 | Fails AA in secondary places, or degrades AT use noticeably |
| Low | 7 | Best practice, AAA, or small-scope issues |
| **Total** | **29** | 25 CONFIRMED, 4 SUSPECTED |

---

## 3. Findings

Format: **ID · Severity · Status · Effort**, then WCAG 2.2 criteria. "Mobile/AT impact" describes the predicted experience for VoiceOver (iOS) and TalkBack (Android) users unless noted.

### A. Operability and semantics of core flows

**A11Y-01 · Critical · CONFIRMED · Effort M — Primary list rows and day cells are `div onClick`: not focusable, no role, no name**
- WCAG: 2.1.1 Keyboard (A), 4.1.2 Name, Role, Value (A), 1.3.1 Info and Relationships (A)
- Files: transaction rows `src/components/transaction/daily-view.tsx:140-145`, `calendar-view.tsx:229-234`, `src/app/accounts/[id]/page.tsx:354-358`; calendar day cells `calendar-view.tsx:135-146`; monthly rows `monthly-view.tsx:78-85`; budget cards `src/components/budget/budget-card.tsx:34-40,47-53`; stats category rows `src/components/stats/stats-sections.tsx:76-83`; donut slices and callouts `src/app/stats/page.tsx:331-345,354-359`; inbox master list `src/components/inbox/inbox-items.tsx:185`; SMS activity row header `src/app/more/sms-activity/page.tsx:139-141`; sync chip `src/components/sync-provider.tsx:296-301`.
- Screenshots: `image.png` and `image-desktop.png` (the two transaction rows are the only way to open the edit sheet), `image2.png` (the on-screen hint "Tap a slice or category row to view transactions" describes a pointer-only action), `image3.png` (tapping the "Wallet Salary" budget card is the only way to edit or delete a budget).
- Evidence: none of these elements has `role`, `tabIndex`, `onKeyDown` or an accessible name. The transaction row also contains a nested `<button>` (the SMS chip, `daily-view.tsx:176-188`).
- Mobile/AT impact: VoiceOver and TalkBack land on each text fragment separately ("Tue, Oct 27", "EXPENSE", "SMS, button", "Sampath LKR", "• VSRPMT-…", "added by Viran", "– LKR 10.00"). Nothing says the row is actionable. A double-tap on a fragment may bubble a click to the row and open the editor, but that's undiscoverable. External-keyboard and Switch Control users can't open, edit or delete a transaction, edit or delete a budget, pick a calendar day, drill into a stats category, or retry sync. Transaction editing is the app's second most frequent task.
- Fix: render each row as a single `<button type="button">` (or `<Link>`) with a composed name, e.g. `aria-label="Expense, Uncategorized, Sampath LKR, minus LKR 10.00, 27 October, added by Viran. Edit"`. Move the SMS chip out of the row button so interactive elements don't nest (a sibling button positioned over the row works). Calendar days become `<button aria-pressed={isSelected} aria-current={isToday ? "date" : undefined} aria-label="27 October: expense 10">`. Budget card becomes a button "Edit budget Salary". The sync chip becomes a `<button>`. Enable the `jsx-a11y/no-static-element-interactions` and `click-events-have-key-events` lint rules to stop regressions.

**A11Y-02 · Critical · CONFIRMED · Effort L — Mobile Quick Add (the FAB flow) can't be understood or completed with a screen reader**
- WCAG: 4.1.2 (A), 1.3.1 (A), 2.1.1 (A), 4.1.3 Status Messages (AA), 3.3.1 Error Identification (A), 3.3.2 Labels or Instructions (A)
- File: `src/components/transaction/mobile-quick-add.tsx` (1,132 lines; the only add-transaction UI below 768 px).
  - The Date, Amount, Category, Account, From, To and Note rows are `div onClick` (`:398,416,441,472,501,526,545`). The amount is a `<span>` (`:425-427`), not an input. The active field is shown only by a 2 px coloured underline (`:400-403`).
  - Keypad keys use bare glyphs as names: "+", "-", "×", "÷", "⌫", "C", "00", "OK" (`:610-760`). No `aria-label` is set.
  - The panel close "X" has no name (`:591-596`).
  - The "Exclude from budget" switch has no name, role or state (`:1099-1112`).
  - The type switcher (Income/Expense/Transfer) exposes no selected state (`:346-390`).
  - The inline error (`:563-568`) isn't a live region.
  - "Custom Date" and "Transaction Note" labels aren't linked to their controls (`:1033-1041`, `:1052-1059`).
  - The back button reads "Trans." (`:274-282`).
  - The sheet has no dialog semantics (`:265-268`, see A11Y-03).
- Mobile/AT impact: a VoiceOver user hears a sequence of plain text ("Date", "Oct 20, 2026", "Amount", "0") with no hint that the rows can be activated. Tapping keypad keys reads "7", then "hyphen" or nothing for "-", and "C" with no meaning. The running expression and the "≈ result" are never announced, so the user can't confirm what they typed. Save may fail validation silently because the error isn't announced. Users can't tell which type (Income or Expense) is selected. TalkBack is similar. External-keyboard users can't reach any field row. This blocks the app's core task.
- Fix:
  1. Make each field row a `<button aria-expanded={activeField===x} aria-controls="qa-panel">` named "Amount, 1,250.00" or "Category, not selected".
  2. Make the panel a labelled region (`role="region" aria-labelledby` the panel header).
  3. Put `aria-live="polite"` on the amount display, or announce on OK.
  4. Add keypad `aria-label`s ("plus", "minus", "multiply", "divide", "backspace", "clear", "double zero", "confirm amount").
  5. Make the type switcher a `role="radiogroup"` of `role="radio" aria-checked`.
  6. Give the toggle `role="switch" aria-checked aria-label="Exclude from budget"`.
  7. Add `role="alert"` on the error and move focus to the first missing field (already done visually by `submitOrFocusMissing`).
  8. Rename the back button to "Back to Transactions", or `aria-label` it.

**A11Y-03 · High · CONFIRMED · Effort M — 18 overlays without dialog semantics, initial focus, focus containment or focus restore**
- WCAG: 4.1.2 (A), 1.3.1 (A), 2.4.3 Focus Order (A), 2.4.11 Focus Not Obscured (Minimum) (AA)
- Files (all `fixed inset-0` divs): `transaction/quick-add-modal.tsx:322`, `transaction/mobile-quick-add.tsx:267`, `transaction/transaction-edit-modal.tsx:270`, `transaction/calibration-modal.tsx:210`, `transaction/daily-view.tsx:340` (raw-SMS), `ui/confirmation-modal.tsx:105`, `ui/icon-picker.tsx:73`, `app/accounts/page.tsx:958`, `app/budget/page.tsx:438`, `app/more/household/page.tsx:523`, `account/loan-detail-modal.tsx:245` and nested `:624`, `account/loan-modal.tsx:130`, `account/settle-modal.tsx:114`, `account/fixed-deposit-modal.tsx:205`, `account/fd-close-modal.tsx:85`, `account/installment-plan-modal.tsx:164`, `account/early-payoff-modal.tsx:70`.
- Evidence: 0 instances of `role="dialog"`/`alertdialog`/`aria-modal`/`<dialog>`. `inert` is used only for hidden tabs. Escape is handled only in `confirmation-modal.tsx:35-43`. `autoFocus` sets initial focus in 4 places only (quick-add amount, settle amount, category name, icon search). Several sheet titles are `<span>`s, not headings (`transaction-edit-modal.tsx:278`, `household/page.tsx:532`).
- Mobile/AT impact: after the FAB opens Quick Add, or a row opens the edit sheet, VoiceOver focus stays on the FAB or row underneath. Nothing announces that a sheet opened. Swiping moves through the page behind the sheet (it isn't inert) before reaching the sheet content, which is rendered later in the DOM. On close, focus is lost and VoiceOver restarts from the top of the page. The background `ScrollContainer` stays scrollable behind the sheet. The VoiceOver "escape" (two-finger scrub) doesn't fire `popstate`, so it doesn't close sheets (SUSPECTED; verify on device).
- Fix: build one `Sheet`/`Dialog` primitive and migrate all 18 overlays. A native `<dialog>` with `showModal()` gives you modality, inertness of the rest of the page, Escape and a top layer. Give it `aria-labelledby` pointing at a real `<h2>` title, move initial focus to the title or first field, return focus to the invoking control on close, and keep `useModalHistory`. Use `role="alertdialog"` with `aria-describedby` for `ConfirmationModal`.

### B. Names, labels and state

**A11Y-04 · High · CONFIRMED · Effort M — 90 of 135 form controls have no programmatic label**
- WCAG: 1.3.1 (A), 4.1.2 (A), 3.3.2 (A), 2.5.3 Label in Name (A)
- Files (line numbers are the unlabelled controls):
  - `app/accounts/page.tsx` 983, 1001, 1017, 1065, 1080, 1092, 1109, 1127, 1146, 1166
  - `app/budget/page.tsx` 468, 491, 514
  - `app/more/bookmarks/page.tsx` 167, 180, 195, 214, 233, 254, 267
  - `app/more/categories/page.tsx` 167, 187
  - `app/more/household/page.tsx` 357
  - `app/more/inbox/page.tsx` 408, 429, 447, 468
  - `app/more/shopping-list/page.tsx` 262, 263 (edit-mode inputs)
  - `account/fd-close-modal.tsx` 121, 138
  - `account/fixed-deposit-modal.tsx` 222, 236, 250, 262, 267, 284, 297, 324, 339, 360, 379
  - `account/installment-plan-modal.tsx` 183, 204, 222, 237, 252, 266, 279
  - `account/loan-detail-modal.tsx` 438, 450, 568, 575, 646, 665, 698
  - `account/loan-modal.tsx` 180, 194, 198, 209, 227, 244, 265, 282, 299, 318
  - `account/settle-modal.tsx` 192, 208
  - `transaction/calibration-modal.tsx` 281, 323
  - `transaction/mobile-quick-add.tsx` 1035, 1055
  - `transaction/quick-add-modal.tsx` 421, 434, 453, 624
  - `transaction/trans-filter-bar.tsx` 57 (search), 119, 137, 155
  - `transaction/transaction-edit-modal.tsx` 301, 313, 331, 389, 401, 415, 480, 499, 586
  - `ui/icon-picker.tsx` 109
- Typical pattern: a sibling `<label className=…>Account Name</label>` with no `htmlFor`, and an input with no `id` (e.g. `accounts/page.tsx:982-990`).
- Screenshot: `image.png` / `image-desktop.png` — the "Search note, category, amount…" box has only a placeholder (`trans-filter-bar.tsx:57-64`). The placeholder disappears as soon as the user types.
- Mobile/AT impact: VoiceOver reads "text field" or "pop-up button" with no purpose, or reads the placeholder ("e.g. 500000.00") as the name. Tapping a visible label doesn't focus its field, which matters on small targets. Voice Control users can't say "tap Account Name".
- Fix: a shared `<Field label hint error>` component that uses `useId()` to wire `htmlFor`/`id`, `aria-describedby` and `aria-invalid`. Add `aria-label="Search transactions"` to the search box. Add `jsx-a11y/label-has-associated-control`.

**A11Y-05 · High · CONFIRMED · Effort S — Icon-only buttons and links with no accessible name (or `title` only)**
- WCAG: 4.1.2 (A), 2.4.4 Link Purpose (A), 2.4.6 Headings and Labels (AA), 1.1.1 (A)
- No name at all (from the AST scan):
  - Back links: `more/categories/page.tsx:102`, `more/developer/page.tsx:176`, `more/household/page.tsx:202`, `more/inbox/page.tsx:238`, `more/preferences/page.tsx:164`, `more/shortcuts/page.tsx:11`, `more/sms-activity/page.tsx:71`.
  - Dialog close "X": `ui/confirmation-modal.tsx:116`, `account/early-payoff-modal.tsx:75`, `account/fd-close-modal.tsx:92`, `account/fixed-deposit-modal.tsx:209`, `account/installment-plan-modal.tsx:169`, `account/loan-detail-modal.tsx:280,631`, `account/loan-modal.tsx:135`, `account/settle-modal.tsx:124`, `transaction/calibration-modal.tsx:227`, `transaction/quick-add-modal.tsx:380`, `transaction/transaction-edit-modal.tsx:284`, `transaction/daily-view.tsx:354`, `ui/icon-picker.tsx:93`, `stats/stats-sections.tsx:121`, `transaction/trans-filter-bar.tsx:106`, `app/accounts/page.tsx:969`, `transaction/mobile-quick-add.tsx:591`.
  - Search clear: `trans-filter-bar.tsx:67`, `icon-picker.tsx:119`.
  - SMS-activity expand chevron: `sms-activity/page.tsx:211`.
  - Others: `more/bookmarks/page.tsx:153`; loan override edit/save `loan-detail-modal.tsx:480,490,582`; split-row remove `transaction-edit-modal.tsx:511`.
  - Colour swatches with colour only: `more/categories/page.tsx:209-217` (also fails 1.4.1).
- `title` only: account edit/archive/delete `app/accounts/page.tsx:1380,1389,1398,1536,1545,1554`; `accounts/[id]/page.tsx:187`; `more/bookmarks/page.tsx:113,341,350`; `more/categories/page.tsx:289,297`; sidebar collapse `navigation/sidebar.tsx:82`; collapsed-sidebar links `:104-125`; `mobile-quick-add.tsx:290,514`; calculator toggles `quick-add-modal.tsx:542`, `calibration-modal.tsx:292`; transaction delete `transaction-edit-modal.tsx:667`; SMS refresh `sms-activity/page.tsx:87`.
- Screenshot: `image4.png` shows three 13 px icons (pencil, archive, trash) per account row with no visible text. Their names, "Edit", "Archive" and "Delete", come from `title` and don't say *which* account. `image6.png` shows the Shopping List doing it right.
- Mobile/AT impact: VoiceOver reads "button" or "link" with no purpose on every sub-page back arrow and every sheet close button. A user can't safely tell "Delete" on BOC Current from "Delete" on Sampath LKR.
- Fix: add `aria-label` everywhere, including the object name (e.g. `aria-label={\`Delete ${account.name}\`}`), keep `title` only as a desktop tooltip, and name swatches ("Blue", "Teal"). Add `jsx-a11y/control-has-associated-label`.

**A11Y-06 · High · CONFIRMED · Effort S — Tabs, segmented controls, toggles and disclosures expose no state**
- WCAG: 4.1.2 (A), 1.3.1 (A), 1.4.1 Use of Color (A)
- Files and screenshots:
  - Daily/Calendar/Monthly/Summary tabs: `ui/segmented-tabs.tsx:18-39`, no `role="tablist"`/`tab` and no `aria-selected` (`image.png`, `image-desktop.png`).
  - Expense/Income/Trend: `app/stats/page.tsx:201-247` (`image2.png`).
  - Cash & Bank/Liabilities/Investments: `app/accounts/page.tsx:375-420` (`image4.png`).
  - Quick Add type switch: `mobile-quick-add.tsx:346-390`.
  - Switches with no role, name or state: `transaction-edit-modal.tsx:444-458` (split), `:542-556` and `quick-add-modal.tsx:637-650` (exclude from budget), `mobile-quick-add.tsx:1101-1112`.
  - Reminders switch: `more/preferences/page.tsx:404-417`. It's an `sr-only` checkbox inside a `<label>` with no text, so its name is empty.
  - Filter button has no `aria-expanded` (`trans-filter-bar.tsx:79-95`), and "active filters" is shown only by an inverted style and a dot that doesn't render (A11Y-27).
  - Also missing `aria-expanded`: sidebar collapse (`sidebar.tsx:82-90`), SMS activity row (`sms-activity/page.tsx:139,211`).
  - SMS status filter chips have no `aria-pressed` (`sms-activity/page.tsx:99-113`).
  - Header "Toggle Theme" and "Toggle Color Swap" (`app/page.tsx:224-248`, `navigation/app-header.tsx:28-52`) announce neither the current state nor the result.
- Mobile/AT impact: VoiceOver reads "Daily, button / Calendar, button …" with no "selected", so users can't tell which view or account group is showing. Switches read as an unnamed "button" with no on/off state.
- Fix: use the tabs pattern (`role="tablist"`, `role="tab" aria-selected aria-controls`, `role="tabpanel"`; arrow-key roving focus on desktop), `role="switch" aria-checked` plus a label for toggles, `aria-expanded` for disclosures, and `aria-pressed` for chips and the theme and colour-swap toggles. For the reminders switch, put the visible "Daily Spending Reminders" text inside the label or `aria-labelledby` it.

### C. Contrast and visibility

**A11Y-07 · High · CONFIRMED · Effort S — Text contrast below 4.5:1 on primary actions, chips, warnings and errors**
- WCAG: 1.4.3 Contrast (Minimum) (AA)
- Computed failures (all text is below 18.66 px bold, so 4.5:1 applies):

| Where | Code | Pair | Ratio |
|---|---|---|---|
| **Every primary button in dark theme** (Sign In, Save Settings, Post, Log EMI, Add, Merge as Transfer, Reload, Inbox/More badges at 10 px) | 39 `bg-[var(--accent)] text-white` usages, e.g. `login/page.tsx:124`, `shopping-list/page.tsx:202`, `more/page.tsx:234`, `inbox-items.tsx:156,166` | #FFF on #E8505B | **3.67** |
| Quick Add "OK" and "Save Transaction" (expense) | `mobile-quick-add.tsx` themeStyles `okBtnBg` (`bg-[#EF4444] text-white`) | #FFF on #EF4444 | **3.76** |
| "Merge" duplicate button and Calibrate buttons | `daily-view.tsx:304`, `accounts/page.tsx` amber CTAs | #FFF on #F59E0B | **2.15** |
| "SMS" chip on transaction rows | `daily-view.tsx:183` `text-blue-500 bg-blue-500/10` | dark 4.12 / light 3.04 | **❌ both** |
| "Split" chip, inbox review-reason chip | `daily-view.tsx:195`, `calendar-view.tsx:257`, `inbox-items.tsx:156,183` `text-amber-500` | light 1.85–1.99 | **❌ light** |
| Budget "warning" remaining text | `budget/page.tsx:420`, `budget-card.tsx:108` `text-[var(--warning)]` | #D98E04 on white | **2.68** |
| Field error text | `accounts/page.tsx:992,1118,1138,1157`, `loan-modal.tsx:145` `text-red-500 text-[11px]` | #EF4444 on white | **3.76** |
| "converted" chip | `daily-view.tsx:218` `text-purple-600` | dark 2.83 | **❌ dark** |
| Quick Add "Select category" / "Add note…" hints | `mobile-quick-add.tsx:464,494` (`slate-500`), `:556` (`slate-600`) | on #12161A | **3.82 / 2.40** |
| Quick Add selected type label | `mobile-quick-add.tsx:355,370` | #3B82F6 / #EF4444 on 20% tint | **3.73 / 3.56** |
| Rollover "Carried" chip (light) | `budget-card.tsx:66` `text-emerald-600 bg-emerald-500/15` | | **3.05** |
| Muted text on the light accounts tab track | `accounts/page.tsx:376` `bg-[var(--border)]` | #6B7075 on #E4E6E8 | **4.00** |

- Screenshots: `image6.png` (white "+ Add" on the coral button), `image.png` and `image-desktop.png` (blue "SMS" chip at 10 px on a navy tint), the FAB (`image.png`–`image6.png`; the glyph is a graphic, so it needs 3:1 and passes at 3.67).
- Mobile/AT impact: low-vision users outdoors on a phone, where glare cuts effective contrast, will struggle to read the primary action on nearly every form in dark theme. Light-theme warnings and errors, which matter most in a finance app, are hard to read.
- Fix: for dark theme, either darken the accent behind white text (≈#C83A45 gives ≥4.5) or use dark text (#121212 on #E8505B = 5.11). Light `--warning` → ≈#9A6200. Use `text-red-700`/`--expense` for errors, `text-blue-600` (light) / `blue-400` (dark) for the SMS chip, `amber-700` (light) for amber chips, `slate-400` minimum for hints in Quick Add, and `bg-amber-700` or dark text on amber buttons. Extend the axe test to every route and every open dialog in both themes.

**A11Y-08 · High · CONFIRMED · Effort S — Budget tab primary actions have no background (`--primary` undefined): invisible in light theme, and the focus ring is missing**
- WCAG: 1.4.3 (AA), 1.4.11 Non-text Contrast (AA), 2.4.7 Focus Visible (AA)
- Files: `src/app/budget/page.tsx:271` ("Add Budget"), `:550` ("Save Budget"): `bg-[var(--primary)] text-white`. `--primary` isn't defined (`globals.css:13-89`). Form inputs `:473,499` and checkbox `:519` use `focus:outline-none focus:ring-1 focus:ring-primary`, and `ring-primary` isn't a generated colour, so the outline is removed and nothing replaces it.
- Screenshot: `image3.png` — "+ Add Budget" renders as plain white text with no button shape. In dark theme it's readable but doesn't look like a button.
- Mobile/AT impact: in light theme, white text on white (≈1:1) makes the only way to create a budget, and the modal's submit button, invisible. Keyboard users get no focus indicator in the budget form.
- Fix: use `bg-[var(--accent)]`, or define `--primary` and `--color-primary` in `@theme`. Replace `ring-primary` with `ring-[var(--text)]`. Add a CI check that fails on `var(--x)` references to undefined custom properties.

**A11Y-11 · Medium · CONFIRMED · Effort S — Non-text contrast: input outlines, switch tracks and selected-segment fills under 3:1**
- WCAG: 1.4.11 Non-text Contrast (AA)
- Evidence: input borders `border-hairline` = `--border` #2C2C2E on #121212 (1.34) or #1C1C1E (1.22); light #E4E6E8 on white (1.25). Inputs use `bg-[var(--bg)]` inside `--surface` cards (fill difference 1.10). Off-state switch track `bg-[var(--border)]` on surface (1.22, `transaction-edit-modal.tsx:448`, `quick-add-modal.tsx:641`). Selected segment fill in Accounts and Stats tabs is surface on border (1.22, `accounts/page.tsx:385`, `stats/page.tsx:211`). The selected state is still distinguishable by text colour change, which passes. Quick Add category tiles: `border-slate-800` on #161B22 (1.18).
- Screenshots: `image6.png` (the "Add an item" and "2 kg" field edges are barely visible), `image.png` (search field outline), `image4.png` (selected "Cash & Bank" segment is only slightly darker).
- Impact: low-vision users can't find field boundaries or tell whether a switch is on.
- Fix: input/border token ≥3:1 against adjacent colours (dark ≈#6B6F75, light ≈#8A9096) for interactive outlines only (cards can keep the hairline). Off-state track ≥3:1 plus a visible knob border. Add `aria-checked` so state doesn't depend on colour.

**A11Y-13 · Medium · CONFIRMED · Effort S — Focus indicator missing or invisible in several places**
- WCAG: 2.4.7 Focus Visible (AA); 2.4.13 Focus Appearance (AAA, advisory)
- Files:
  - `ui/month-switcher.tsx:64-71`: a `tabIndex={0}` div with `focus:outline-none`, no role and no name. It's an invisible extra tab stop on Trans., Stats and Budget.
  - `quick-add-modal.tsx:540` and `calibration-modal.tsx:290`: amount inputs `focus:outline-none` with no replacement.
  - `budget/page.tsx:473,499,519` (see A11Y-08).
  - `preferences/page.tsx:414-416`: `sr-only` checkbox plus `peer-focus:outline-none`, so the switch never shows focus.
  - 55 inputs use only a 1 px border colour change (`focus:border-[var(--accent)]`, 3.80:1 against the old border in dark). That passes 2.4.7 but is thin on a phone.
  - No `:focus-visible` styles are defined anywhere.
- Mobile/AT impact: VoiceOver and TalkBack draw their own focus rectangle, so the impact falls on external-keyboard, Switch Control and Android "Switch Access" users, who are common among motor-impaired PWA users.
- Fix: a global `:focus-visible { outline: 2px solid var(--text); outline-offset: 2px }` and removal of the bare `outline-none`s. For the month switcher, remove `tabIndex`, or give it `role="group" aria-label="Month"` plus a ring.

### D. Forms, errors and status messages

**A11Y-09 · High · CONFIRMED · Effort M — Validation errors aren't announced or linked to their fields**
- WCAG: 3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA), 4.1.3 Status Messages (AA), 1.3.1 (A)
- Files: account form errors `app/accounts/page.tsx:991-995,1117-1160`; loan form `account/loan-modal.tsx:145,188,200,217…`; budget `app/budget/page.tsx:455-461`; shopping list `app/more/shopping-list/page.tsx:207-211`; Quick Add `mobile-quick-add.tsx:563-568`, and the equivalents in `quick-add-modal.tsx` and `transaction-edit-modal.tsx`. Repo-wide: 0 `aria-invalid`, 0 `aria-describedby`, and `role="alert"` only on `login/page.tsx:63` and `register/*`.
- Mobile/AT impact: when Save is rejected, nothing is spoken. The VoiceOver user doesn't know the form failed, or which field to fix, and may leave believing the transaction was saved.
- Fix: in the shared `Field`, add `aria-invalid` plus `aria-describedby={errorId}`. Add a form-level `role="alert"` summary and move focus to the first invalid field on submit.

**A11Y-12 · Medium · CONFIRMED · Effort S — Status changes are silent, and the delete-undo toast times out in 6 s**
- WCAG: 4.1.3 Status Messages (AA), 2.2.1 Timing Adjustable (A)
- Files:
  - Undo toast `src/app/page.tsx:340-356`, auto-dismissed after 6 s (`:52-58`), with no live region and no pause.
  - "Settings saved successfully" `more/preferences/page.tsx:311-317`; reminder status `:444`.
  - `SyncIndicator` `sync-provider.tsx:296-334` (Synced, Syncing, Offline, Error).
  - PWA update banner `pwa-manager.tsx:141-160` (no live region).
  - Month label `month-switcher.tsx:82-87`.
  - Developer "Copied" `more/developer/page.tsx:91`.
  - Filtered result count (none shown).
- Screenshots: the "Synced" chip in `image.png`, `image4.png` and `image-desktop.png`.
- Mobile/AT impact: deleting a transaction from the edit sheet closes the sheet. The "Transaction deleted · Undo" toast is never announced, and it disappears before a screen-reader user could find the Undo button by swiping. Going offline, or a failed sync, is never spoken. For a local-first app, unsynced data is invisible to blind users.
- Fix: one app-level `aria-live="polite"` announcer used by toasts, sync and save notices, with `role="alert"` for sync errors. Keep the undo toast open while it has focus or hover, extend it to ≥10 s (or until dismissed), and offer undo from a persistent place (e.g. a "Recently deleted" entry).

### E. Touch, pointer and obscured content

**A11Y-14 · Medium · CONFIRMED · Effort S — FAB and fixed overlays cover the last rows and can hide focused controls**
- WCAG: 2.4.11 Focus Not Obscured (Minimum) (AA, SUSPECTED fail for small controls), 1.4.10 Reflow (AA, related)
- Evidence: the scroll area reserves only `pb-nav-safe` = 4 rem + inset (`globals.css:227-229`). The FAB sits at `bottom: calc(5rem + inset)` and is 52 px tall (`fab.tsx:36`, `globals.css:217-219`), so the right-hand ~52 px of the last ~4 rem of content sits under the FAB when scrolled to the end. The undo toast and PWA update banner use the same offset (`page.tsx:344`, `pwa-manager.tsx:144`). The FAB appears on every route except login and register, including `/more/*` (`fab.tsx:16-18`).
- Screenshots: `image5.png` (the FAB covers the chevron of "Apple Shortcuts Guide" and the top of the empty-state card), `image4.png`/`image3.png`/`image6.png` (FAB over empty space at present, but any longer list puts the last row's amount or the 25 px delete icon under it).
- Mobile/AT impact: a 25 px "Delete" icon at the right edge of the last account row can be entirely hidden under the FAB, which fails 2.4.11 for keyboard and switch users. Sighted users can't tap the covered control.
- Fix: add bottom padding equal to FAB height plus margin on mobile (e.g. `calc(4rem + 52px + 1.5rem + inset)`), and hide the FAB on sub-pages where adding a transaction isn't the main action. Use `scroll-padding-bottom` on the scroll container so focused elements scroll clear of the FAB.

**A11Y-15 · Medium · CONFIRMED · Effort S — Touch targets below 24 px (fails) and widely below 44 px (recommended)**
- WCAG: 2.5.8 Target Size (Minimum) (AA); 2.5.5 Target Size (Enhanced) (AAA) recommends 44 px
- Below 24 px **without** a spacing exception (fails 2.5.8):
  - Search-clear "X", ≈17 px inside the input target (`trans-filter-bar.tsx:67-74`); icon-picker clear (`icon-picker.tsx:119`).
  - "SMS" chip, ≈16 px tall and nested inside the clickable row (`daily-view.tsx:176-188`, `image.png`).
- Below 24 px, probably passing only through the spacing exception (verify):
  - Shopping list check box 20×20 (`shopping-list/page.tsx:253-258`, `image6.png`) and back arrow 18×18 (`:154`).
  - Switches 36×20 (`transaction-edit-modal.tsx:444,542`, `quick-add-modal.tsx:637`).
  - Undo ≈18 px tall (`page.tsx:347-353`).
  - Duplicate Merge/Dismiss ≈18 px tall (`daily-view.tsx:291-324`).
  - Calendar amounts are not targets.
- 24–32 px, which is tight for thumbs:
  - Account edit/archive/delete 25×25 with 4 px gaps, with destructive Delete next to Archive (`accounts/page.tsx:1373-1404`, `image4.png`).
  - Month prev/next 26 px (`month-switcher.tsx:72-97`, `image.png`/`image2.png`/`image3.png`).
  - Header theme and colour-swap 30 px (`page.tsx:224-248`, `image.png`).
  - Confirmation Cancel ≈28 px (`confirmation-modal.tsx:133-141`).
  - Segmented tabs ≈32 px tall (`segmented-tabs.tsx:30`, `image.png`).
- Good: bottom nav (≈75×64), FAB 52 px, Quick Add keypad keys (grid cells), Shopping List "Add" (40 px, `image6.png`).
- Fix: minimum 44×44 hit area on mobile through padding or an `::after` hit-slop. Move the clear "X" outside the input or make it 32+ px with input `padding-right`. Put Delete behind a confirm or overflow menu so it isn't adjacent to Archive.

**A11Y-16 · Medium · CONFIRMED · Effort S — Shopping List reordering requires dragging**
- WCAG: 2.5.7 Dragging Movements (AA, new in 2.2), 2.1.1 (A)
- File: `src/app/more/shopping-list/page.tsx:228-251` (pointer-capture drag on the grip, drop on `pointerup`). There's no keyboard handler and no "Move up/down" alternative.
- Screenshot: `image6.png` (grip handle next to "Suger").
- Mobile/AT impact: VoiceOver and TalkBack users, users with tremor, and switch users can't reorder the list. The handle announces "Drag to reorder Suger, button", but activating it does nothing.
- Fix: add "Move up" and "Move down" buttons, or a reorder mode with arrow buttons, and announce the new position through the live announcer.

### F. Structure, navigation and orientation

**A11Y-10 · High · CONFIRMED · Effort S — Installed PWA is locked to portrait**
- WCAG: 1.3.4 Orientation (AA)
- File: `public/manifest.json` `"orientation": "portrait-primary"`.
- Mobile/AT impact: Android Chrome honours manifest orientation for installed apps. iOS currently ignores it. Users whose phone or tablet is mounted in landscape (wheelchair or bed mounts) can't use the installed app on Android. Portrait isn't essential for a ledger.
- Fix: remove the key or set `"any"`, then test the landscape layout. Mobile Quick Add in particular needs scrolling (see A11Y-20).

**A11Y-17 · Medium · CONFIRMED · Effort S — Every route is titled "Hard Money", tab switches aren't announced, and focus isn't managed on navigation**
- WCAG: 2.4.2 Page Titled (A), 2.4.6 (AA), 2.4.3 (A)
- Evidence:
  - `layout.tsx:28-30` sets a single title. Every page is a `"use client"` component without `metadata`.
  - Next's route announcer reads `document.title` first (`node_modules/next/dist/docs/03-architecture/accessibility.md`), so sub-page navigations announce "Hard Money".
  - Tab switches use `history.pushState` (`tab-navigation-context.tsx:122-125`) and bypass the announcer entirely.
  - The Transactions page `<h1>` is the brand name "Hard Money", not "Transactions" (`app/page.tsx:213-218`; `image.png`, `image-desktop.png`).
- Mobile/AT impact: the iOS app switcher, browser history and VoiceOver all say "Hard Money" everywhere. After tapping a More item, VoiceOver focus is left on a link that no longer exists and resets to the top with no announcement of the new screen.
- Fix: set `document.title` per tab and sub-page (e.g. "Transactions · October 2026 · Hard Money"). Per-route server `layout.tsx` files can export `metadata`; check the Next 16 metadata docs in `node_modules/next/dist/docs/01-app` first. On tab switch and sub-page navigation, move focus to the page `<h1 tabIndex={-1}>`, or announce "Transactions" through the live announcer. Rename the Transactions `<h1>` to "Transactions" and keep the brand in the header.

**A11Y-18 · Medium · CONFIRMED · Effort S — Section headings are styled spans, and lists aren't lists**
- WCAG: 1.3.1 (A), 2.4.6 (AA), 2.4.10 Section Headings (AAA)
- Files:
  - More section titles (`more/page.tsx:200-204`: "HOUSEHOLD & COLLABORATION", "GENERAL & CUSTOMIZATION", "DEVELOPER & AUTOMATION", `image5.png`).
  - Preferences group titles (`preferences/page.tsx:184,338,390`).
  - Account groups "Cash" and "Bank accounts" (`accounts/page.tsx:429,457`, `image4.png`).
  - Day group headers "Tue, Oct 27" / "Fri, Oct 23" (`daily-view.tsx:108-110`, `image.png`).
  - "Month Overview" (`budget-overview.tsx:24`, `image3.png`).
  - Edit sheet title (`transaction-edit-modal.tsx:278`).
  - Stats goes from `<h1>` straight to `<h3>` (`stats-sections.tsx:33,69`, `summary-view.tsx:79`).
  - Transaction, account, budget and settings lists are `div`s, not `ul`/`li`.
- Mobile/AT impact: the VoiceOver rotor "Headings" (and TalkBack "Headings" navigation) is the fastest way through long lists on a phone, but here it can't jump between days, account groups or settings sections. Users don't hear "list, 12 items".
- Fix: `<h2>` for sections and day headers, `<ul role="list">` (Safari drops list semantics when `list-style: none` unless `role="list"` is set) for rows, and `<h2>` as dialog titles.

**A11Y-23 · Low · CONFIRMED · Effort S — Auth and offline pages lack `<main>`, login uses positive `tabIndex`, no skip link on desktop**
- WCAG: 1.3.1 (A), 2.4.1 Bypass Blocks (A), 2.4.3 (A)
- Files: `login/page.tsx:144-151` (wrapper `div`), `register/page.tsx`, `offline/page.tsx:14`. `tabIndex={1|2|3}` at `login/page.tsx:87,110,122`. No skip link before the 9-control desktop sidebar (`sidebar.tsx`).
- Fix: wrap in `<main>`, remove positive `tabIndex`, and add a "Skip to content" link targeting `<main>`.

### G. Content, charts and data

**A11Y-19 · Medium · CONFIRMED · Effort M — Donut chart, trend bars, budget bars and calendar grid have no accessible structure**
- WCAG: 1.1.1 Non-text Content (A), 1.3.1 (A), 1.4.1 (A)
- Files:
  - Donut: the `<svg>` has no `role`, `<title>` or `<desc>` (`stats/page.tsx:270`). Slices carry `aria-label` on a `<circle>` with no role, which most screen readers ignore (`:331-345`). Slices and callout `<g>`s are clickable but not focusable (`:354-359`). Callout text is 9.5/8.5 user units (`:373,382`).
  - Trend bars: `stats-sections.tsx:38-53` truncates amounts with `truncate` in 6 narrow columns and has no axis semantics.
  - Budget progress bar: no `role="progressbar"` (`budget/page.tsx:360-377`).
  - Calendar: no `grid`/`table` semantics, weekday headers are plain spans, and day amounts are 9 px (`calendar-view.tsx:114-176`).
  - Loan schedule `<table>` is `hidden md:table` (`loan-detail-modal.tsx:400`); mobile gets a card list (check its semantics when fixing A11Y-18).
- Screenshot: `image2.png` — the centre "TOTAL EXPENSE LKR 10.00" is HTML, so it's readable. The "Uncategorized 100%" callout is SVG text, and the slice itself isn't exposed. The "Top Categories" list is the effective text alternative, but its rows are mouse-only (A11Y-01).
- Fix: `role="img"` plus `<title>` ("Expense by category, October 2026: Uncategorized 100%, LKR 10.00") on the SVG, `aria-hidden` on slices and callouts, and selection through the (fixed) category list buttons. Trend: a visually-hidden table (month, amount) or `role="list"` with full values. Budget: `role="progressbar" aria-valuenow aria-valuemin=0 aria-valuemax=100 aria-label="Salary budget used"`. Calendar: a `role="grid"` or `<table>` with `<th scope="col">`, and day buttons as in A11Y-01.

**A11Y-21 · Medium · CONFIRMED · Effort S — Category icon *names* are rendered as visible and spoken text ("Wallet Salary")**
- WCAG: 1.3.1 (A), 2.4.6 (AA)
- Files: `app/budget/page.tsx:147` (`categoryIcon: category?.icon || "📁"`), `:316` and `budget-card.tsx:56` render `{item.categoryIcon}` as text. Category icons are Lucide names (`lib/categories-data.ts:4-7`, e.g. "ShoppingCart"). Budget `<option>`s render `{c.icon} {c.name}` (`budget/page.tsx:480`), and so do inbox options (`inbox-items.tsx:105`).
- Screenshot: `image3.png` shows the budget card heading "Wallet **Salary**". "Wallet" is the icon identifier.
- Impact: VoiceOver reads "Wallet Salary", "ShoppingCart Groceries" in pickers. This is confusing for everyone and misleading in a finance app ("Wallet" is also an account name in the placeholder text).
- Fix: render `<CategoryIcon name={…} aria-hidden />` (`ui/category-icon.tsx`) and drop the icon from `<option>` text.

**A11Y-22 · Medium · SUSPECTED · Effort S — Signs on amounts may not be spoken, so income and expense can sound identical**
- WCAG: 1.3.1 (A); related to 1.4.1 for the visual channel
- Files: amounts are composed as `"- " + formatMoney(x)` and `"+ " + formatMoney(x)` with an ASCII hyphen-minus and a space (`daily-view.tsx:120-124,245,253`, `monthly-view.tsx:102-110`, `summary-view.tsx:86-104`, `stats-sections.tsx:133`, `calendar-view.tsx:163,171,203-206`). `formatMoney` emits "-LKR" for negatives in Accounts.
- Screenshots: `image.png` "– LKR 10.00" / "+ LKR 9,800,000.00"; `image4.png` "Net Worth LKR 33,703.16".
- Mobile/AT impact: at VoiceOver's default punctuation level, a lone "-" separated by a space is often not spoken. A user may then hear "LKR 10.00" for an expense and an income alike, with colour as the only remaining cue.
- Fix: add visually-hidden "expense" or "income" text per row (or put it in the row's `aria-label` from A11Y-01), use U+2212 "−" (spoken as "minus"), and use `Intl.NumberFormat` with `signDisplay: "exceptZero"`. Verify on device with default punctuation settings.

### H. Reflow, text size, motion and theme

**A11Y-20 · Medium · SUSPECTED · Effort M — Content may clip at 320 px width or 200% text because the body can't scroll horizontally and several rows don't wrap**
- WCAG: 1.4.10 Reflow (AA), 1.4.4 Resize Text (AA), 1.4.12 Text Spacing (AA)
- Evidence:
  - `body` is `fixed … overflow-hidden` (`layout.tsx:57`, `globals.css:91-105`), so any overflow is cut off.
  - The Accounts header row has `h1`, sync chip, "Show archived" and "Add Account" in one non-wrapping `justify-between` row (`accounts/page.tsx:307-336`), about 370 px of content at 320 px.
  - Account rows hold the balance plus three icons with `shrink-0` (`accounts/page.tsx:1350-1405`).
  - Summary bars use three columns for long LKR amounts (`summary-bar.tsx:30`, `accounts/page.tsx:340`).
  - Mobile Quick Add is `fixed inset-0 overflow-hidden` with a `shrink-0` top half (`mobile-quick-add.tsx:267,343`). With larger text or in landscape, the keypad panel can shrink to zero height with no scroll.
  - Calendar cells are fixed `h-16` (`calendar-view.tsx:128,139`).
  - About 286 font sizes are fixed in px (`text-[9px]`/`[10px]`/`[11px]`). They don't follow the browser's default-font-size setting.
  - iOS Dynamic Type isn't honoured. Web content needs `font: -apple-system-body` or a rem base tied to it.
- Screenshots: not demonstrable. All captures are about 640 px wide at default text size.
- Fix: allow `overflow-x: auto` inside the scroll container, `flex-wrap` on header and action rows, a 2×2 or stacked summary on <360 px, `min-h` instead of `h` for cells, rem-based font tokens, and a scrollable Quick Add top half. Test at 320×640, at 200% browser zoom, at Android font scale 1.3–2.0, and in landscape.

**A11Y-24 · Low · CONFIRMED · Effort S — Very small text throughout (9–11 px), below the PRD's 12 px minimum**
- WCAG: none directly (supports 1.4.4 and 1.4.12); PRD §5.0
- Evidence: `text-[9px]` ×4, `text-[10px]` ×93, `text-[11px]` ×189. Examples: bottom-nav labels 11 px (`bottom-nav.tsx:65`), "added by Viran" 10 px in accent red (`daily-view.tsx:231`), chips at 10 px, More descriptions 11 px, calendar amounts 9 px.
- Screenshots: `image.png` ("added by Viran", "SMS", "No budget"), `image5.png` (item descriptions), `image2.png` (donut callout).
- Fix: enforce the 12/14/16/20/28 scale through theme tokens. Abbreviate values (e.g. "12.5k") instead of shrinking type.

**A11Y-25 · Low · CONFIRMED · Effort S — Reduced-motion covers only page transitions; the update banner's icon spins indefinitely**
- WCAG: 2.2.2 Pause, Stop, Hide (A, SUSPECTED for the banner), 2.3.3 Animation from Interactions (AAA)
- Files: the only rule is `globals.css:322-328`. `pwa-manager.tsx:156` puts an `animate-spin` RefreshCw on the "Reload" button for as long as the banner is shown. Other unguarded motion: `transition-all`/`active:scale-*` (dozens of uses), sidebar width (`sidebar.tsx:66`), donut `transition-all duration-300` (`stats/page.tsx:343`).
- Fix: use a static icon on Reload, add `motion-reduce:animate-none` and `motion-reduce:transition-none` to animated utilities, or set a global `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: .01ms !important; transition-duration: .01ms !important } }`.

**A11Y-26 · Low · CONFIRMED · Effort S — Theme handling: Quick Add ignores the light theme, the theme control is ambiguous, and forced-colours mode isn't handled**
- WCAG: none directly (1.4.3/1.4.11 when forced colours apply); user-preference best practice
- Evidence:
  - Mobile Quick Add hard-codes `bg-[#12161A] text-white` (`mobile-quick-add.tsx:267`), so users who need light mode get a dark full-screen sheet.
  - `toggleTheme` (`theme-provider.tsx:88-95`) flips between dark and light and offers no path back to "System". `setTheme("system")` exists but isn't exposed in the UI.
  - The Preferences theme button's label is the *current* state ("Dark Mode", `preferences/page.tsx:350-356`) while the sidebar's label is the *target* ("Light Mode", `image-desktop.png`).
  - Custom switches and progress bars are drawn only with backgrounds, so they disappear in Windows/Chromium forced-colours mode (desktop).
- Fix: a three-way "System / Light / Dark" radio group in Preferences. Tokenise Quick Add colours. Add `@media (forced-colors: active)` borders on switches and bars.

### I. Visual-token defects that remove cues

**A11Y-27 · Low · CONFIRMED · Effort S — Undefined Tailwind colours remove the "today", active-filter and drop-target cues**
- WCAG: 1.4.1 (A) / 1.3.3 (A), advisory
- Files:
  - `calendar-view.tsx:143,150` (`border-accent`, `text-accent`): the today marker doesn't render, so today can't be found in the calendar.
  - `trans-filter-bar.tsx:93` (`bg-accent` dot): not rendered.
  - `shopping-list/page.tsx:229` (`bg-[var(--surface-hover)]`): no drop-target highlight while dragging.
  - `divide-hairline` (18 uses): not generated. Dividers fall back to `currentColor` (near-white in dark).
- Screenshots: `image5.png` and `image.png` (bright white dividers between More rows and between the Income/Expense/Total cells). That's a visual inconsistency rather than an a11y failure, since it raises contrast.
- Fix: define `--color-accent`, `--color-hairline` and `--surface-hover` in `globals.css`/`@theme`, or replace the usages.

**A11Y-28 · Low · CONFIRMED · Effort S — `select-none` on whole sheets and containers blocks copying amounts and SMS text**
- WCAG: advisory (supports 1.3.1 / user agency)
- Files: `quick-add-modal.tsx:322`, `transaction-edit-modal.tsx:270`, `calibration-modal.tsx:210`, `confirmation-modal.tsx:105`, `installment-plan-modal.tsx:164`, `early-payoff-modal.tsx:70`, `mobile-quick-add.tsx:267`, `summary-bar.tsx:30`, `daily-view.tsx:108`, `bottom-nav.tsx:35`.
- Impact: users can't select an amount to copy, look it up, or have it spoken through iOS "Speak Selection" (a common low-vision tool).
- Fix: restrict `select-none` to keypad keys and drag handles.

**A11Y-29 · Low · CONFIRMED · Effort S — Abbreviated and raw labels**
- WCAG: 2.4.6 (AA), 3.1.4 Abbreviations (AAA)
- Evidence:
  - "Trans." is the tab and back label (`bottom-nav.tsx:24`, `sidebar.tsx:55`, `mobile-quick-add.tsx:281`; all screenshots). Screen readers say "Trans".
  - The raw type "EXPENSE"/"INCOME" stands in for a missing category (`daily-view.tsx:171`, `image.png`).
  - Raw enums elsewhere: `CONTRIBUTOR_ADD_ONLY`, `NEEDS_REVIEW` (household, SMS activity).
  - Currency label "Rs." vs "LKR" (`budget/page.tsx:353`).
- Fix: "Transactions" as the accessible name (`aria-label` if the visual label must stay short), "Uncategorized expense", and a label map for enums.

---

## 4. Predicted screen-reader walkthroughs (SUSPECTED, verify on device)

| Task | VoiceOver (iOS PWA) | TalkBack (Android PWA) | Blocking findings |
|---|---|---|---|
| Hear this month's totals | Works: "Income, LKR 0.00, Expense, LKR 10.00, Total, LKR -10.00". The month label isn't announced on change. | Same | A11Y-12 |
| Add an expense via FAB | FAB "Quick Add Transaction, button" ✅. Sheet opens, focus stays behind, no announcement. Field rows read as text. Amount keys "7", "hyphen", "C". Expression never read back. Errors silent. | Same; focus may stay on FAB | A11Y-02, -03, -09 |
| Edit or delete a transaction | Row fragments read separately and aren't announced as actionable. Delete then undo is silent and times out in 6 s. | Same | A11Y-01, -03, -12 |
| Switch Daily → Calendar | "Calendar, button" with no selected state. Calendar days aren't reachable as controls. | Same | A11Y-06, -01, -19 |
| Inspect a stats category | Donut not exposed. Category rows aren't actionable. | Same | A11Y-19, -01 |
| Create a budget | "Add Budget, button" ✅ (name OK); in light theme it's invisible to sighted low-vision users. Fields unlabelled. Card "Wallet Salary" not actionable. | Same | A11Y-08, -04, -21, -01 |
| Delete an account | Three "button"s named from `title` ("Edit/Archive/Delete") with no account name; 25 px, adjacent. | Names may not be exposed from `title` in all cases | A11Y-05, -15 |
| Shopping list: add, check, reorder | Add ✅ (labels wrap inputs); Check ✅ (named, but no checked state); reorder ❌ | Same | A11Y-16, -06 |
| Open a More sub-page and go back | Item links ✅. Back arrow is "link" with no name (except Shopping List). New page announced as "Hard Money". | Same | A11Y-05, -17 |

---

## 5. Coverage matrix (pages and components → findings)

| Area | Files | Findings |
|---|---|---|
| Shell / nav | `layout.tsx`, `bottom-nav.tsx`, `sidebar.tsx`, `app-header.tsx`, `scroll-container.tsx`, `native-tab-container.tsx`, `tab-navigation-context.tsx`, `page-transition.tsx`, `template.tsx` ×3, `fab.tsx` | 05, 06, 10, 14, 17, 20, 23, 25, 29 |
| Trans. tab | `app/page.tsx`, `daily-view.tsx`, `calendar-view.tsx`, `monthly-view.tsx`, `summary-view.tsx`, `trans-filter-bar.tsx`, `summary-bar.tsx`, `month-switcher.tsx`, `segmented-tabs.tsx`, `empty-state.tsx` | 01, 04, 05, 06, 07, 12, 13, 15, 18, 19, 22, 24, 27 |
| Add / edit transaction | `mobile-quick-add.tsx`, `quick-add-modal.tsx`, `quick-add-context.tsx`, `transaction-edit-modal.tsx`, `calibration-modal.tsx`, `number-keypad-popup.tsx` | 02, 03, 04, 05, 06, 07, 09, 13, 26, 28 |
| Stats | `app/stats/page.tsx`, `stats-sections.tsx` | 01, 05, 06, 18, 19 |
| Budget | `app/budget/page.tsx`, `budget-card.tsx`, `budget-overview.tsx` | 01, 03, 04, 07, 08, 09, 19, 21 |
| Accounts | `app/accounts/page.tsx`, `accounts/[id]/page.tsx`, all `components/account/*` modals | 01, 03, 04, 05, 06, 07, 09, 11, 15, 18, 20 |
| More hub and sub-pages | `more/page.tsx`, `preferences`, `household`, `shopping-list`, `categories`, `bookmarks`, `inbox` (+ `inbox-items.tsx`), `sms-activity`, `developer`, `shortcuts`, `icon-picker.tsx`, `category-icon.tsx` | 01, 04, 05, 06, 07, 12, 13, 14, 16, 18, 21, 26 |
| Auth / offline / PWA | `login`, `register`, `register-form.tsx`, `offline`, `pwa-manager.tsx`, `sync-provider.tsx`, `manifest.json` | 01, 07, 10, 12, 23, 25 |
| Shared dialogs | `confirmation-modal.tsx`, `use-modal-history.ts` | 03, 05, 15 |

`query-provider.tsx`, `theme-provider.tsx` (except A11Y-26) and `quick-add-context.tsx` render no UI.

---

## 6. Recommended fix order

1. **Primitives first (unblocks most findings):** `Dialog/Sheet` (A11Y-03), `Field` (04, 09), `IconButton` with a required `label` prop (05), `Switch`, `Tabs` and `SegmentedControl` with ARIA state (06), and a global live announcer (12). Add the `jsx-a11y` rules listed in §1.5.
2. **Core mobile flows:** rebuild the Quick Add field rows and keypad semantics (02) and make list rows real buttons (01). These are the two Critical items.
3. **Visual fixes:** contrast tokens (07, 11), the Budget `--primary` bug (08), global `:focus-visible` (13), FAB bottom padding (14), 44 px targets (15), and the `orientation` manifest key (10).
4. **Structure:** per-route titles and focus on navigation (17), headings and lists (18), chart alternatives (19), the category icon text (21), and amount signs (22).
5. **Hardening:** reflow and text-size tests (20), reduced motion (25), theme options (26), and the low items.
6. **Verification:** extend `tests/e2e/s01-app-shell.spec.ts`'s axe scan to every route and every open dialog in both themes and at 320 px. Then run a scripted manual pass with VoiceOver on iOS (installed PWA) and TalkBack on Android, external keyboard and Switch Control, 200% text, and landscape. Expert review should follow before any conformance claim.

---

## 7. Comparison with earlier run (`audit/2026-10-20/frontend-uiux.md`)

The earlier run had no separate accessibility report. Its a11y content was §3.6 (A11Y-01…13), plus FORM-02/03/06/08, FMT-03, MOB-01…04, VIS-01…03. The status below was re-checked against the current code.

| Earlier item | Topic | Status now | This report |
|---|---|---|---|
| A11Y-01 | Modals lack dialog semantics, focus, Escape | **Still present, partly improved.** `ConfirmationModal` now handles Escape. `useModalHistory` closes 12 sheets on back or swipe. Still no `role="dialog"`, focus trap or restore. Overlay count is now 18. | A11Y-03 |
| A11Y-02 | `div onClick` rows | **Still present.** All listed sites remain. Count confirmed by AST scan (29). | A11Y-01 |
| A11Y-03 | Icon-only controls unnamed | **Still present.** The new Shopping List page does it correctly. | A11Y-05 |
| A11Y-04 | Toggles, tabs and segments expose no state | **Still present** | A11Y-06 |
| A11Y-05 | Contrast failures | **Still present.** Same token values. This run adds the SMS chip in dark (4.12), the "converted" chip (2.83), Quick Add hints (2.40/3.82) and Quick Add OK on #EF4444 (3.76). | A11Y-07 |
| A11Y-06 | Search unlabelled, filter state silent | **Still present** | A11Y-04, -06 |
| A11Y-07 | Charts lack alternatives | **Still present** | A11Y-19 |
| A11Y-08 | Undo, sync and save not live; 6 s undo | **Still present** | A11Y-12 |
| A11Y-09 | Tap targets | **Still present.** New small targets in the Shopping List (20 px checkbox, 18 px back link). | A11Y-15 |
| A11Y-10 | 9–11 px text | **Still present** (286 occurrences) | A11Y-24 |
| A11Y-11 | MonthSwitcher focusable div | **Still present** | A11Y-13 |
| A11Y-12 | `select-none` on sheets | **Still present** | A11Y-28 |
| A11Y-13 | Raw enums / jargon | **Still present** | A11Y-29 |
| FORM-02 / FORM-03 | Labels not associated; errors not linked | **Still present.** Now quantified: 90/135 controls unlabelled. | A11Y-04, -09 |
| FORM-06 | Desktop Quick Add amount: read-only, no focus ring | **Partly fixed.** `autoFocus` was added (`quick-add-modal.tsx:538`). Still `readOnly` + `focus:outline-none`. | A11Y-13 |
| FORM-08 | Positive `tabIndex` on login | **Still present** | A11Y-23 |
| FMT-03 | Sign prefixes read as "dash" | **Still present** | A11Y-22 |
| MOB-01 | No safe-area insets | **Fixed** (`globals.css:205-255`, `statusBarStyle: "default"`) | — |
| MOB-02 | `h-screen` / 90vh sheets | **Fixed** (`h-[100dvh]`, `modal-sheet-dialog` uses `dvh`, `interactiveWidget: "resizes-content"`) | — |
| MOB-03 | FAB overlaps content | **Still present.** Confirmed in `image5.png`. | A11Y-14 |
| MOB-04 | Dense rows overflow at 320 px | **Still present (SUSPECTED)** | A11Y-20 |
| VIS-01 | Budget buttons invisible (`--primary`) | **Still present.** Confirmed in `image3.png` (no button background). | A11Y-08 |
| VIS-02 | Undefined tokens | **Still present** | A11Y-27 |
| VIS-03 | Hard-coded palette | **Still present** | A11Y-07 |

**Missed by the earlier run, new in this report:**
- A11Y-02: the full mobile Quick Add screen-reader failure. The earlier run noted only its type switch and toggle.
- A11Y-10: manifest portrait lock (1.3.4).
- A11Y-11: non-text contrast of inputs and switches (1.4.11).
- A11Y-14: 2.4.11 Focus Not Obscured framing.
- A11Y-16: drag-only reorder (2.5.7). The Shopping List is newer than the earlier run.
- A11Y-17: identical page titles, announcer bypass and focus on navigation (2.4.2).
- A11Y-18: heading and list structure.
- A11Y-20: body `overflow-hidden` clipping and the Quick Add `overflow-hidden` layout under text scaling or landscape.
- A11Y-21: icon names rendered as text ("Wallet Salary").
- A11Y-23: no `<main>` on auth and offline pages, and no skip link.
- A11Y-25: reduced-motion coverage and the infinite spinner.
- A11Y-26: theme options and forced colours.
- Budget form `ring-primary` removing focus (folded into A11Y-08).
- Reminders switch with an empty name and no focus indicator (in A11Y-06 and A11Y-13).

---

## 8. Not verified

- Actual VoiceOver and TalkBack output, including whether `title` is exposed as a name on each platform and how a lone "-" is spoken.
- Rendering at 320 px, 200% text, landscape, and in light theme. No screenshots exist for these.
- Contrast of user-chosen category colours (palette in `categories/page.tsx`) against white glyphs and against the surface.
- Push-notification content and Apple Shortcuts flows (outside the web UI).
- The inbox desktop master/detail layout and the developer page beyond label wiring.

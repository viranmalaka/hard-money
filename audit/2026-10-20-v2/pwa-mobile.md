# Hard Money: PWA and Mobile Audit (run 2)

- Audit date: 2026-10-20 (second run of the day)
- Repo HEAD: `0c401ec` ("feat: add confirmation modal component and integrate into account actions"). Working tree clean apart from the untracked screenshots in `audit/`.
- Mode: read-only. No source edits, no commits, no database access, no dev server.
- Priority: the app is used mainly as an installed PWA on phones, so mobile impact drives the severity ratings.

## 0. Method and limits

| Step | Result |
|---|---|
| Read `public/manifest.json`, `public/sw.js`, `src/components/pwa-manager.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/middleware.ts`, `next.config.ts`, the push API routes, `src/services/push-service.ts`, `src/lib/push/outbox.ts`, the cron reminder block, sync provider/client, navigation shell, quick-add sheets, every modal root, and all amount inputs | Done |
| Checked Next 16 docs in `node_modules/next/dist/docs/` (`generate-viewport.md`, `generate-metadata.md` `appleWebApp`, `progressive-web-apps.md`, `offline-support.md`, `proxy.md`) before judging any Next API use | Viewport and metadata usage is correct for this version. `middleware.ts` is deprecated in favour of `proxy.ts` (docs `proxy.md:11`, and the build prints the same warning). |
| `pnpm build` with no env | Fails: `AUTH_SECRET must be configured with at least 32 bytes in production` (`src/lib/auth.ts:9`) while collecting `/api/auth/session`. |
| `pnpm build` with a throwaway, non-secret `AUTH_SECRET` (no DB, no other env) | Passes. 46 pages. `/api/push/vapid-public-key` is prerendered static (○). Turbopack does not print per-route sizes, so I measured `.next/static/chunks` and the client reference manifests directly (see PWA-40). The build rewrote the git-ignored `.next/` folder and re-ran `prisma generate`. No tracked files changed (`git status` verified). |
| Screenshots `audit/image.png`, `image2.png` … `image6.png`, `image-desktop.png` | All reviewed. They look like a browser device frame on a desktop (window edges and other app content are visible at the right edge, and there is no real status bar or home indicator). That means safe-area insets, the iOS status bar and the on-screen keyboard can't be judged from them. Layout, colour, density and copy can be judged. |
| Real-device testing | Not possible here. Anything that depends on runtime browser behaviour is marked SUSPECTED. |

Severity scale: **Critical** = a core promised capability doesn't work, or there's a data-loss or privacy risk for most users. **High** = frequent, visible harm on mobile. **Medium** = noticeable friction or a correctness gap with a workaround. **Low** = polish.

### Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 6 |
| Medium | 24 |
| Low | 11 |
| **Total** | **42** |

The three problems that matter most on a phone today:
1. Push reminders can never be delivered (PWA-01), and the UI reports success anyway (PWA-02).
2. "Offline from cold start" depends on the browser's HTTP cache, because the service worker never serves app code (PWA-07). The update banner's Reload button does nothing in the common path and sits on top of the FAB (PWA-10).
3. Everyday entry is slower than it should be. Amount fields open a full QWERTY keyboard (PWA-25), double taps can create duplicate transactions (PWA-26), and every route, `/login` included, downloads about 317 KB of gzipped JS because the root layout bundles all five tabs (PWA-40).

---

## 1. How the PWA and mobile layer works today

### 1.1 Manifest (`public/manifest.json`)
- `name`/`short_name` "Hard Money", `start_url: "/"`, `display: "standalone"`, `orientation: "portrait-primary"`, `background_color` and `theme_color` both `#121212`, categories finance/productivity/utilities.
- Icons: `icon-192.png` (192², RGBA, `any`), `icon-512.png` (512², RGBA with transparent rounded corners, `any`, 242 KB), `icon-maskable-512.png` (512², full-bleed RGB, `maskable`, 232 KB). `apple-touch-icon.png` is 180² RGB.
- Missing: `id`, `scope`, `shortcuts`, `screenshots`, `lang`/`dir`, and a 192 maskable icon.
- Linked from `layout.tsx:31` via `metadata.manifest`. It's a static file in `public/`, not `app/manifest.ts`, which is fine.

### 1.2 Head, viewport and fonts (`src/app/layout.tsx`)
- `viewport` export (`:17-26`): `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`, plus `themeColor` keyed on `prefers-color-scheme` (#FFFFFF light, #121212 dark). The build emits exactly that meta. Zoom isn't disabled, which is good for accessibility.
- `metadata.appleWebApp` (`:36-40`): `capable: true`, `statusBarStyle: "default"`, title "Hard Money". Next 16 emits `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=default` and `apple-mobile-web-app-title` (verified in the build RSC payload). No `startupImage`.
- An inline script (`:51-55`) applies the stored theme and colour swap before paint.
- Fonts: system stack only (`globals.css:94`). No `next/font` and no webfont downloads. Amounts often use `font-mono` (130 usages), which resolves to the platform monospace font.
- The body is `fixed inset-0 h-[100dvh] overflow-hidden overscroll-none` (`:57`). `html, body` also get `overflow:hidden; overscroll-behavior:none` (`globals.css:91-105`). One inner `ScrollContainer` (`overscroll-behavior: contain`) scrolls all content. The result is no pull-to-refresh and no rubber-banding of the shell. The only manual refresh is tapping the sync pill, which is shown on two tabs only.
- Safe areas: `.pt-shell-safe` (`globals.css:205-210`: top inset + 5 px, plus left/right), `.bottom-nav-safe`, `.bottom-mobile-offset`, `.pb-nav-safe`, `.pb-sheet-safe` and `.modal-sheet-dialog` (`:212-255`). Inputs are forced to 16 px under 768 px (`:195-202`) to stop iOS focus zoom.

### 1.3 Shell and navigation
- Mobile has a fixed bottom nav (`bottom-nav.tsx`, five tabs, 64 px + bottom inset) and a fixed FAB at `right-4 bottom-mobile-offset` (`fab.tsx:36`). Desktop has a sidebar.
- `NativeTabContainer` (`native-tab-container.tsx`) statically imports all five tab pages and keeps visited tabs mounted (`hidden` + `inert`). Bottom-nav taps call `switchToTab`, which does `history.pushState` and dispatches a synthetic `popstate` (`tab-navigation-context.tsx:123-126`).
- Sub-pages use Next routing with React `<ViewTransition>` (`template.tsx`, `page-transition.tsx`) and iOS-style slide animations. `prefers-reduced-motion` is honoured (`globals.css:322-328`).
- Overlays are hand-rolled `fixed inset-0` divs (19 roots). Twelve use `useModalHistory` so that Android back and iOS edge-swipe close them.

### 1.4 Service worker (`public/sw.js`, registered by `src/components/pwa-manager.tsx`)
- It registers only when `NODE_ENV === "production"` (`pwa-manager.tsx:11`).
- Install (`sw.js:13-30`): `skipWaiting()` runs immediately, then `/offline`, the manifest and the icons are precached into `hardmoney-v5`.
- Activate (`:33-45`): deletes every cache except `hardmoney-v5`, then `clients.claim()`.
- Fetch (`:55-123`): it ignores `/api/*`, `/_next/*`, HMR and non-GET. HTML navigations are network-first: they cache every 200 response and fall back to the cached page, then `/offline`, then a text response. Every other GET (icons, manifest, and also RSC requests to page URLs) goes to a cache-first branch that matches with `ignoreSearch: true`.
- Push (`:126-152`) shows a notification with `icon` and `badge` set to `icon-192.png`. `notificationclick` (`:155-171`) focuses a matching window or opens one.
- `PwaManager` also captures `beforeinstallprompt` (nothing uses it), "primes" `/_next/` scripts and CSS into a cache named **`hardmoney-v4`** (`:31`), and shows a "New version available" banner (`:141-159`).

### 1.5 Push notifications
- The UI is Preferences → "Notifications & Reminders" (`src/app/more/preferences/page.tsx:387-460`): a toggle, a time input and a Save button. Permission is requested on Save, a user gesture, which is good timing. An iOS "Add to Home Screen" note appears only in iOS Safari when the app isn't installed (`:59-70`, `:463-478`).
- The client never calls `pushManager.subscribe`. It posts a hard-coded fake subscription (`:140-146`).
- Server: `/api/push/subscribe` upserts the subscription and auto-enables reminders. `/api/push/unsubscribe` with no endpoint deletes all of the user's subscriptions. `/api/push/settings` stores `pushRemindersEnabled` and `dailyReminderTime` per user. `/api/push/vapid-public-key` falls back to a hard-coded sample key.
- Delivery: the cron tick calls `enqueuePushNotification`, which appends to an in-memory array (`src/lib/push/outbox.ts`). No `web-push` dependency exists, so nothing is ever sent.

### 1.6 Local data and session
- Dexie database per user: `hardmoney_<userId>` (`src/lib/db/index.ts:416-424`). An outbox syncs every second while mutations are pending (`sync-provider.tsx:186-190`).
- Session: 7-day HS256 JWT in an httpOnly cookie with `maxAge` 7 d (`api/auth/login/route.ts:76-83`). There's no sliding refresh.

### 1.7 What is already good
- The Next 16 `viewport`/`metadata` APIs are used correctly. `viewportFit: cover` is paired with safe-area utilities.
- The `100dvh` shell, the 16 px input rule and a working maskable icon fix the main issues from the earlier run.
- Login and register use the right `type`/`autocomplete` (`email`, `current-password`, `new-password`) and `autoCapitalize="none"`.
- No webfonts, reduced-motion support, pinch-zoom left enabled, and modal history integration on most sheets.
- Account delete and archive now have a confirmation modal (HEAD commit).

---

## 2. Findings

### A. Push notifications

**PWA-01 · Critical · CONFIRMED · Effort M: Push reminders are fake from end to end and can never reach a device**
- Files: `src/app/more/preferences/page.tsx:140-146`; `src/lib/push/outbox.ts:1-32`; `src/lib/jobs/cron-runner.ts:525-547`; `package.json` (no `web-push`).
- Evidence: the client builds `endpoint: https://fcm.googleapis.com/fcm/send/test-<random>` with `p256dh: "BMo9aW7-test-p256dh-key-mock"` and `auth: "mockAuthKey123"`. It never calls `navigator.serviceWorker.ready` or `pushManager.subscribe`, and never fetches `/api/push/vapid-public-key`. The cron tick only pushes into a module-level array. No code reads `VAPID_PRIVATE_KEY`.
- Mobile impact: users turn on "Daily Spending Reminders", see "Reminders active", and never get a notification. On iOS this is the only way to re-engage a home-screen web app.
- Fix: on Save, `const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })`, then POST `sub.toJSON()`. On the server, add pinned `web-push`, send to every `PushSubscription` with a VAPID subject, and delete subscriptions on 404/410. Add a "Send test notification" button.

**PWA-02 · High · CONFIRMED · Effort S: The reminder UI reports success when push is unsupported, not installed, or denied**
- File: `src/app/more/preferences/page.tsx:131-151`, `:83-86`.
- Evidence: `if ("Notification" in window) { … requestPermission … }`. When `Notification` is missing (iOS Safari in a normal tab, iOS < 16.4, some in-app browsers), the permission step is skipped and the fake subscription is saved. The UI then shows "Reminders active". The toggle's initial state comes from the server (`pushQuery.data.enabled`), not from `Notification.permission` or an existing `PushSubscription`, so revoking permission in OS settings still shows "on". The denied path shows only "Notification permission not granted", with no steps to recover.
- Mobile impact: iPhone users who haven't installed the app, which is the group most likely to need guidance, get a false confirmation.
- Fix: check `"PushManager" in window && "serviceWorker" in navigator` and `display-mode: standalone` on iOS. When either check fails, disable the toggle and show the install steps inline. On load, reconcile the UI with `Notification.permission` and `reg.pushManager.getSubscription()`. When permission is `denied`, explain how to re-enable it (iOS: Settings → Notifications → Hard Money; Android: App info → Notifications).

**PWA-03 · High · CONFIRMED (latent) · Effort S: Reminders are re-sent on every cron tick after the configured time**
- File: `src/lib/jobs/cron-runner.ts:541` (`if (userTime >= configuredTime) enqueuePushNotification(...)`).
- Evidence: there's no "last sent on date" field and no dedupe. String comparison of `HH:mm` means every tick from 20:00 to 23:59 qualifies.
- Mobile impact: hidden today because of PWA-01. Once delivery works, every tick sends a notification, and users will mute or uninstall the app. iOS can also throttle a site that sends noisy pushes.
- Fix: store `lastReminderSentOn` (a local-date string) per user or subscription, and send at most once per local day inside a window (e.g. `configured ≤ now < configured + tick interval`). Optionally skip users who have already logged a transaction today.

**PWA-04 · Medium · CONFIRMED · Effort S: Turning reminders off on one phone unsubscribes every device, and settings are per user rather than per device**
- Files: `src/services/push-service.ts:13-16` (`unsubscribePush()` posts no body); `src/app/api/push/unsubscribe/route.ts:26-31` (no endpoint means `deleteMany({ userId })`); `src/app/api/push/subscribe/route.ts:47-51` (subscribing silently sets `pushRemindersEnabled: true` for the whole account).
- Mobile impact: a user with a phone and a tablet (or a partner on a shared household account) can't control reminders per device. The browser-side `PushSubscription.unsubscribe()` is never called, so the browser keeps a live subscription.
- Fix: send the device's `endpoint` on unsubscribe and call `sub.unsubscribe()`. Move `enabled` and `reminderTime` onto `PushSubscription`, or keep the user-level time and make enablement per device.

**PWA-05 · Low · CONFIRMED · Effort S: The VAPID public key is frozen at build time and falls back to a public sample key**
- Files: `src/app/api/push/vapid-public-key/route.ts:4-6`. Build output shows `○ /api/push/vapid-public-key` (static).
- Impact: once PWA-01 is fixed, a Docker image built without `VAPID_PUBLIC_KEY` ships the sample key `BEl62iUYgUivx…`. Subscriptions are then bound to a key whose private half isn't yours, and pushes fail.
- Fix: `export const dynamic = "force-dynamic"`, or read the key at request time with `connection()`. Throw in production if it's unset. Remove the fallback.

**PWA-06 · Low · CONFIRMED · Effort S: Notification payload and click handling issues**
- File: `public/sw.js:128-130,146,157,160-165`.
- Evidence:
  - The default URL `/transactions` doesn't exist (Transactions is `/`).
  - `client.url.includes(targetUrl)` with `"/"` matches any window, so the app is focused without navigating to the target.
  - `badge: "/icon-192.png"` is a full-colour, full-bleed icon. Android draws the badge from the alpha channel, so it shows as a solid white square in the status bar.
  - There's no `tag`/`renotify`, so reminders stack, and no `pushsubscriptionchange` handler.
- Fix: default to `/`. Compare `new URL(client.url).pathname` and call `client.navigate(target)` before `focus()`. Add a monochrome 96² `badge-96.png`. Set `tag: "daily-reminder"`. Re-subscribe in `pushsubscriptionchange`. Only allow same-origin target URLs.

### B. Service worker, offline and storage

**PWA-07 · High · SUSPECTED · Effort M: Offline cold start depends on the HTTP cache because the SW never serves app code**
- Files: `public/sw.js:59-66` (returns early for `/_next/`); `src/components/pwa-manager.tsx:28-65` (primes `/_next/` assets into a cache the SW never reads, see PWA-08).
- Evidence (code path CONFIRMED): offline, the SW returns the cached HTML for `/`, but every `<script src="/_next/static/...">` and the CSS bypass the SW and go to the network. They only load if the browser's HTTP disk cache still holds them.
- Mobile impact: iOS evicts HTTP cache aggressively, and Android does so under storage pressure. Opening the installed app on a plane or underground can then give an unstyled, non-interactive page, even though the ledger is sitting in IndexedDB. Not reproduced on a device, hence SUSPECTED.
- Fix: serve `/_next/static/**` cache-first from the SW (the files are content-hashed and immutable), and precache the build's chunk list on install. The Next docs (`progressive-web-apps.md:674`) point to Serwist for this. Add the missing offline-reload E2E tests (PWA-42).

**PWA-08 · Medium · CONFIRMED · Effort S: The asset-priming cache uses the old name, is never read, and grows on every deploy**
- Files: `src/components/pwa-manager.tsx:31` (`caches.open("hardmoney-v4")`) vs `public/sw.js:2` (`CACHE_VERSION = "hardmoney-v5"`).
- Evidence: the v5 SW's activate step deletes `hardmoney-v4`, then `PwaManager` recreates it on every page load and adds every `/_next/` URL it sees. Because `sw.js` doesn't change between app deploys, the SW never re-activates, so the v4 cache is never cleaned. Each deploy adds another ~1.4 MB set of hashed chunks (current build: 35 chunks, 1.38 MB raw).
- Mobile impact: wasted storage, and quota pressure that increases the chance of the whole origin being evicted (see PWA-11).
- Fix: delete `primeAssetCache`. Let the SW own all caching, with one cache name derived from the build ID, plus an expiration policy.

**PWA-09 · Medium · SUSPECTED · Effort S: RSC (flight) requests go through a cache-first branch with `ignoreSearch`, and entries pile up without limit**
- File: `public/sw.js:104-122`.
- Evidence (matching logic CONFIRMED): soft navigations to sub-pages (`/more/preferences`, `/accounts/[id]`) fetch `?_rsc=…` with the `RSC` header. They aren't `navigate`/`text/html`, so they reach the cache-first branch. A cached flight response is returned before the network, and each unique `_rsc` value is stored as a new entry. `Vary` headers will stop some mismatches, but nothing bounds the cache.
- Mobile impact: possible stale screens after a deploy, a slower first paint on navigation, and storage growth.
- Fix: bypass requests that have an `RSC` header or `_rsc` parameter. Restrict cache-first to an allow-list (`/icon-*.png`, `/manifest.json`, `/_next/static/`). Never use `ignoreSearch` for app routes.

**PWA-10 · Medium · CONFIRMED · Effort S: The update banner's Reload button does nothing in the common path, and the banner covers the FAB**
- Files: `public/sw.js:14` (unconditional `skipWaiting()` in install), `:43` (`clients.claim()`); `src/components/pwa-manager.tsx:87-100,107-114,126-135,144,156`.
- Evidence:
  - A new SW passes through `installed`, so the banner appears (`:92-97`), and then it activates and claims the page straight away. `controllerchange` fires while `isUpdatingRef` is still false, so there's no reload.
  - When the user later taps Reload, `waitingWorker.postMessage({type:"SKIP_WAITING"})` goes to a worker that is already active. Nothing changes, the page doesn't reload, and the banner stays.
  - The banner uses the same `bottom-mobile-offset right-4` position as the FAB (`fab.tsx:36`) at `z-50` vs `z-30`, so it covers the main "add" button.
  - The icon spins forever (`animate-spin`).
  - There's no `reg.update()` on `visibilitychange`, and iOS PWAs resume without navigating, so update checks are rare. Updates are only noticed when someone hand-edits `sw.js`.
- Mobile impact: after an SW change, users see a banner that can't be dismissed, hides the FAB and does nothing when tapped. Meanwhile the old page runs against new SW rules.
- Fix: remove the install-time `skipWaiting()`. On Reload, post `SKIP_WAITING` to `reg.waiting`, and reload on `controllerchange`. If there's no waiting worker, call `location.reload()`. Call `reg.update()` on `visibilitychange` → visible. Put the banner above the FAB or at the top under the safe-area inset, add a dismiss button, and use a static icon with `role="status"`. Generate the SW version from the build ID.

**PWA-11 · Medium · CONFIRMED · Effort S: No persistent-storage request, so unsynced offline entries can be evicted**
- Evidence: there are no `navigator.storage.persist()` or `estimate()` calls in `src/` or `public/`. The outbox of unsynced mutations lives in IndexedDB (`src/lib/db/index.ts`).
- Mobile impact: browsers can evict "best-effort" storage for the whole origin under pressure. For a local-first finance app, that silently discards transactions entered offline that haven't synced yet.
- Fix: call `navigator.storage.persist()` after login or the first offline write (Chrome grants it automatically for installed PWAs). Show the remaining quota under Preferences. Warn before logout or uninstall when the outbox isn't empty.

**PWA-12 · Medium · CONFIRMED · Effort S: Logout is one tap, ignores pending changes, and leaves the full ledger and caches on the device**
- Files: `src/app/more/page.tsx:48-60` (clears the React Query cache and one localStorage key only), `:189-197` (button). The per-user Dexie DB (`db/index.ts:416-424`), the SW HTML cache (`sw.js:79-84`) and the `hardmoney-v4` asset cache are kept.
- Screenshot: `image6.png` shows "Log Out" as the only action on the profile card, at the top of More, within thumb reach.
- Mobile impact:
  - An accidental tap logs the user out.
  - If the outbox isn't empty, those changes stay unsynced until the same user logs in again.
  - On a shared or handed-over phone, the next person can read the ledger with remote DevTools.
- Fix: a confirmation sheet that shows "N changes not synced yet", with "Keep data on this device" / "Remove data from this device". Removal runs `db.delete()`, deletes the caches and posts a message to the SW.

**PWA-13 · Medium · CONFIRMED · Effort S: An expired session shows as "Synced", and the hard 7-day session forces a weekly re-login**
- Files: `src/lib/sync/client.ts:41-43` and `:73` (`if (res.status === 401) { onStateChange("idle"); return; }`); `src/app/api/auth/login/route.ts:83` (`maxAge` 7 d); `src/lib/auth.ts:45` (`setExpirationTime("7d")`), with no refresh.
- Mobile impact: an installed PWA is opened many times a day without ever visiting `/login`. After 7 days, sync stops quietly while the pill says "Synced" (see the green "Synced" pill in `image.png` and `image4.png`). Entries made in that state never reach the partner's device.
- Fix: map 401 to a distinct `auth-expired` state with a "Sign in to sync" banner that preserves the outbox. Use a sliding session (re-issue the cookie when less than half the lifetime is left).

**PWA-14 · Low · CONFIRMED · Effort S: Sync polls every second while changes are pending, even offline**
- File: `src/components/sync-provider.tsx:186-190` (1 s `setInterval`, no `navigator.onLine` check); there's no single-flight guard in `syncNow`.
- Mobile impact: one failing request per second while offline, which costs battery and radio wake-ups.
- Fix: back off exponentially (2 s → 60 s), pause while `!navigator.onLine`, resume on `online`/`visibilitychange`, and allow only one sync in flight.

**PWA-15 · Low · CONFIRMED · Effort S: The offline fallback page is a dead end**
- File: `src/app/offline/page.tsx:16-33`.
- Evidence: it offers only "Try Again", although its copy says visited tabs still work. It uses `min-h-[70vh]` inside the dvh shell.
- Fix: add a "Go to Transactions" link (with `/` always precached), and say how many changes are waiting to sync.

### C. Manifest and installability

**PWA-16 · Medium · CONFIRMED · Effort S: The manifest is missing installability and quality fields**
- File: `public/manifest.json:1-31`.
- Evidence and impact:
  - No `id`: Chrome derives the app identity from `start_url`, so changing `start_url` later creates a second "app".
  - No `scope`.
  - No `screenshots`: Android Chrome shows the minimal install sheet instead of the richer one, which needs `form_factor: "narrow"` screenshots.
  - No `shortcuts`: a long-press on the icon could offer "Add expense", "Shopping list" and "SMS inbox".
  - `orientation: "portrait-primary"` locks tablets, foldables and landscape keyboards.
  - `background_color`/`theme_color` are fixed at `#121212`, so light-theme users get a dark splash screen and a dark Android task-switcher header.
  - No `lang`.
- Fix: add `"id": "/"`, `"scope": "/"`, `"lang": "en"`, two or three narrow screenshots (the audit screenshots are a good starting point once cropped to real device size), `shortcuts` with 96² icons (e.g. `/?quickAdd=expense`, `/more/shopping-list`, `/more/inbox`), and `orientation: "any"`. Pick a neutral `background_color` or match the light theme. Optionally move to `app/manifest.ts`.

**PWA-17 · Medium · CONFIRMED · Effort S: No install entry point on Android, and the iOS install hint is hidden in Preferences**
- Files: `src/components/pwa-manager.tsx:20-25` (stores `beforeinstallprompt` on `window.__hardMoneyInstallPrompt` and dispatches `hardmoney_install_ready`, but nothing listens); `src/app/more/preferences/page.tsx:463-478` (the iOS note appears only inside Preferences, below the reminder form).
- Mobile impact: the app depends on being installed (offline use, iOS push, full-screen use), but users are only told about installing if they open Preferences on an iPhone.
- Fix: an "Install app" row at the top of More, shown when not in `display-mode: standalone`. On Android/desktop it calls the stored `prompt()`. On iOS Safari it opens a short sheet with the Share → Add to Home Screen steps. Hide it after `appinstalled`.

**PWA-18 · Low · CONFIRMED · Effort S: Icon weight, branding and leftovers**
- Files: `public/icon-512.png` (242 KB), `public/icon-maskable-512.png` (232 KB), `public/icon-192.png` (42 KB); `public/{file,globe,next,vercel,window}.svg`; `src/app/favicon.ico` alongside `public/favicon.png`.
- Evidence:
  - The 512 icons are precached on SW install (`sw.js:7`).
  - The `any` icon has transparent rounded corners, so some Android launchers place it on a white plate. The full-bleed maskable icon is the right asset there. Its artwork sits close to the 80 % safe-zone circle at the tail and snout (eyeballed), so check it with a maskable preview tool.
  - Branding is inconsistent. The home-screen icon is a green piggy bank with a "$" sign. The in-app mark is a red "H" tile (`image-desktop.png` sidebar, login page), the accent colour is red, and the currency is LKR.
- Fix: compress the icons (palette PNG or WebP fallbacks, usually under 40 KB each), add a 192 maskable icon, pick one brand mark and use it for the icon, sidebar, login and splash, and delete the leftover create-next-app files and the duplicate favicon.

### D. iOS and Android standalone shell

**PWA-19 · Medium · CONFIRMED · Effort S: The status bar and `theme-color` follow the system theme, not the app theme**
- Files: `src/app/layout.tsx:22-25` (`themeColor` keyed on `prefers-color-scheme`), `:38` (`statusBarStyle: "default"`); `src/components/theme-provider.tsx` (never updates `<meta name="theme-color">`).
- Evidence: the app lets users pick light or dark independently of the OS (header sun/moon toggle in `image.png`). The meta tags only follow the OS setting.
- Mobile impact: a user who picks dark in a light-mode OS gets a white Android status bar and app-switcher header, and on iOS a light status-bar area, over a `#121212` app. The reverse also happens. There are no `apple-touch-startup-image` entries, so iOS shows a blank launch screen. (The screenshots come from a device frame, so the real status bar couldn't be checked; the mismatch is CONFIRMED from code.)
- Fix: in `ThemeProvider`, after applying the theme, set every `meta[name=theme-color]` to the active `--bg`. Consider `statusBarStyle: "black-translucent"` (content already pads with `env(safe-area-inset-top)`). Add startup images generated for common iPhone sizes, or at least set `background_color` to match.

**PWA-20 · Medium · CONFIRMED · Effort S: No root `color-scheme`, so native controls render light inside the dark theme**
- Files: `src/app/globals.css` (sets `color-scheme` only on `select`, `:185,:192`). The checkbox at `src/app/accounts/page.tsx:317-323` has no custom styling.
- Screenshot: `image4.png` shows the "Show archived" checkbox as a bright white square on the dark header. The same applies to `type="date"`/`type="time"` pickers (`mobile-quick-add.tsx:1036`, `preferences/page.tsx:429-436`) and scrollbars.
- Fix: `:root { color-scheme: light } .dark, [data-theme="dark"] { color-scheme: dark }`, and `accent-color: var(--accent)` for checkboxes.

**PWA-21 · Medium · SUSPECTED · Effort M: On-screen keyboard behaviour: Android lifts the bottom nav and FAB above the keyboard, and iOS covers sheets**
- Files: `src/app/layout.tsx:21` (`interactiveWidget: "resizes-content"`); `bottom-nav.tsx:35` (`fixed bottom-0`); `fab.tsx:36`; sheets sized with `modal-sheet-dialog` (`globals.css:247-255`).
- Evidence: with `resizes-content`, Android Chrome shrinks the layout viewport when the keyboard opens, so `fixed bottom-0` elements ride up above the keyboard. The 64 px nav and the 52 px FAB then take space from the input the user is typing in. Examples: Shopping List "Add an item" (`image5.png`), search on Trans (`image.png`), inbox edits. iOS ignores `interactive-widget`, so the keyboard overlays the page and the bottom part of bottom sheets (Save buttons) can sit under it. There's no `visualViewport` handling.
- Fix: hide the bottom nav and FAB while an editable element has focus (`focusin`/`focusout`, or `visualViewport.height < innerHeight * 0.75`). For iOS sheets, set `max-height` from `visualViewport.height` and `scrollIntoView({block:"nearest"})` on focus. Check on a real iPhone and Pixel.

**PWA-22 · Medium · SUSPECTED · Effort S: Fast taps on the custom keypad can trigger double-tap zoom, and taps flash grey**
- Files: `src/components/transaction/mobile-quick-add.tsx:601-760` (keypad buttons); there's no `touch-action` or `-webkit-tap-highlight-color` anywhere in `src/`.
- Mobile impact: entering "11" or "00" quickly on iOS can zoom the page, because Safari still does double-tap zoom on elements without `touch-action: manipulation`. Android shows a grey highlight flash on every tap of custom controls.
- Fix: `button, [role=button], a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }` plus a visible `:active` state, which is already present on most buttons.

**PWA-23 · Medium · CONFIRMED · Effort S: Every bottom-nav tap adds a history entry, so Android back walks back through tabs**
- File: `src/components/navigation/tab-navigation-context.tsx:123-126` (`history.pushState(null, "", targetPath)` on each switch).
- Mobile impact: after Trans → Stats → Budget → Accounts → Trans, the Android back gesture walks back through four tabs before leaving the app. Native tab apps go back to the home tab and then exit.
- Fix: use `history.replaceState` for tab switches, so only drill-downs push entries. Optionally treat back on a non-home tab as "go to Trans".

**PWA-24 · Low · CONFIRMED · Effort S: Some overlays miss history integration or bottom safe-area padding**
- Files:
  - No `useModalHistory`: `src/app/more/household/page.tsx:523`, `src/components/transaction/calibration-modal.tsx:210`, `src/components/transaction/daily-view.tsx:340` (raw SMS modal), `src/components/ui/icon-picker.tsx:73`.
  - No `pb-sheet-safe` or inset padding: `budget/page.tsx:438`, `loan-modal.tsx:130`, `loan-detail-modal.tsx:245,624`, `fixed-deposit-modal.tsx:205`, `fd-close-modal.tsx:85`, `daily-view.tsx:340`.
  - `icon-picker.tsx:77` still uses `max-h-[85vh]`.
- Mobile impact: Android back leaves the page instead of closing these sheets. On iPhones with a home indicator, their last button can sit under it.
- Fix: apply the same hook and the same safe-area classes to every overlay. That's easiest through one shared `<Sheet>` (see PWA-33).

### E. Mobile forms

**PWA-25 · High · CONFIRMED · Effort S: Amount fields open a full text keyboard, and numeric fields use `type="number"`**
- Files (`type="text"`, no `inputMode`):
  - Opening balance: `accounts/page.tsx:1066`
  - Credit limit: `:1110`
  - Inbox amount: `more/inbox/page.tsx:430`, `components/inbox/inbox-items.tsx:78`
  - Template amount: `more/bookmarks/page.tsx:256`
  - Transaction edit amount: `transaction-edit-modal.tsx:303`
  - Split amounts: `:501`
  - EMI pay amount: `loan-detail-modal.tsx:667`
  - Loan principal: `loan-modal.tsx:211`
  - Loan edit principal: `loan-detail-modal.tsx:298`
  - FD principal: `fixed-deposit-modal.tsx:252`
  - FD close proceeds: `fd-close-modal.tsx:123`
  - Installment fee: `installment-plan-modal.tsx:281`
  - Settle custom amount: `settle-modal.tsx:193`
- `type="number"` is used for budget limit (`budget/page.tsx:492`), rates, tenures, due days, USD→LKR amount and rate (`quick-add-modal.tsx:475,497`, `inbox-items.tsx:93,98`). There's no `enterKeyHint` anywhere.
- Mobile impact: typing money on a QWERTY keyboard is slow and error-prone, and letters are accepted and parsed silently (earlier FIN-16). `type="number"` on iOS gives a keypad without a minus sign in some layouts. It also accepts `e`, and it changes value when scrolled on Android Chrome. In this app that happens inside scrollable sheets.
- Fix: for money, use `type="text" inputMode="decimal" autoComplete="off" pattern="[0-9]*[.,]?[0-9]{0,2}"` with strict parsing. For whole numbers (tenure, due day), use `inputMode="numeric"`. Add `enterKeyHint="next"`/`"done"`. Leave `quick-add-amount` (`inputMode="none"` + custom keypad) as it is.

**PWA-26 · High · CONFIRMED · Effort S: Quick Add has no in-flight guard, so a double tap on Save can create two transactions**
- Files: `src/components/transaction/quick-add-modal.tsx:197-279` (`validateAndSubmit` awaits `localCreateTransaction` with no `isSaving` flag); mobile Save in the sheet header `mobile-quick-add.tsx:305-313` and the note panel's "Save Transaction" (`quick-add-mobile-note-save`).
- Mobile impact: the header Save button is small (`px-3.5 py-1.5`, about 30 px tall). Repeated taps on a slow phone, especially while IndexedDB is busy syncing, insert duplicate rows that then sync to the household.
- Fix: a `savingRef` and disabled state set synchronously at the top of `validateAndSubmit` and cleared in `finally`. Reuse one client-generated transaction ID per sheet session so a retry is idempotent.

**PWA-27 · Medium · CONFIRMED · Effort M: The mobile Quick Add sheet ignores theme and colour swap, and its controls are hard to use with a screen reader**
- File: `src/components/transaction/mobile-quick-add.tsx`.
- Evidence:
  - The palette is hard-coded dark (`:267` `bg-[#12161A] text-white`, many `#1B2028`/slate classes), so light-theme users get a black full-screen sheet.
  - Income/expense colours are fixed blue/red (`:357`, `:138`), so users who enabled "Swap In/Out Colors" see the opposite of the rest of the app.
  - The X in the panel header (`:591-597`) doesn't close the sheet. It switches to the amount keypad.
  - Field rows are `div onClick` (`:398-560`), so TalkBack and VoiceOver announce text, not buttons.
  - Keypad symbols `⌫ × ÷` have no `aria-label` (`:633,723`).
  - "Exclude from budget" is a bare `<button>` with no `role="switch"`/`aria-checked`/name (`:1100-1113`).
  - The "Transaction Note" and "Custom Date" labels aren't tied to their inputs (`:1034,1054`).
  - The amount display isn't a live region, so values typed on the keypad aren't announced.
  - The back button always reads "Trans." (`:281-284`), whatever page the user came from.
- Fix: use theme tokens (`--bg`, `--surface`, `--income`, `--expense`). Rename the X to "Done", or remove it. Turn rows into `<button aria-label="Amount, 1,250.00">`. Label the keypad keys ("Backspace", "Multiply", "Divide"). Use `role="switch"` for the toggle. Wire up `htmlFor`/`id`. Put `aria-live="polite"` on the amount. Label the back button "Close".

### F. Mobile visual design and accessibility (from the screenshots)

**PWA-28 · Medium · CONFIRMED · Effort S: `divide-hairline` isn't a real utility, so dividers render in the text colour (bright white lines in dark mode)**
- Files: 18 uses in 15 files, e.g. `components/ui/summary-bar.tsx:30`, `app/more/page.tsx:205`, `components/transaction/daily-view.tsx`, `calendar-view.tsx`, `monthly-view.tsx`, `stats-sections.tsx`, `accounts/page.tsx`. `.border-hairline` is a hand-written class (`globals.css:136`), and there's no `--color-hairline` theme token. So `divide-x`/`divide-y` fall back to Tailwind v4's default border colour, `currentColor`.
- Screenshots: `image.png`, `image2.png` and `image4.png` show the separators between Income | Expense | Total (and Assets | Liabilities | Net Worth) as bright white bars. `image6.png` shows white lines between every row in the More lists. Other borders in the same screens are the intended subtle `#2C2C2E`.
- Impact: harsh, noisy lines on the most-viewed screens. It looks like a bug and draws the eye away from the numbers.
- Fix: add `--color-hairline: var(--border);` to `@theme` (and use `border-hairline`/`divide-hairline` as real utilities), or replace with `divide-[var(--border)]`.

**PWA-29 · Medium · CONFIRMED · Effort S: The FAB appears on every page and covers the last row**
- Files: `src/components/ui/fab.tsx:16-18` (hidden only on `/login`, `/register`); `globals.css:227-229` (`.pb-nav-safe` reserves only the nav height, nothing for the FAB).
- Screenshots: `image5.png`, where Shopping List shows the transaction "+" FAB, which suggests it adds a shopping item. It doesn't. `image6.png`, where the FAB sits on the "Apple Shortcuts Guide" row's chevron. Also visible on the Stats, Budget and Accounts screenshots.
- Fix: hide it on `/more/*` and on detail pages, or make it context-aware (on `/accounts/[id]`, preselect the account). Add `calc(4rem + 4.5rem + env(safe-area-inset-bottom))` bottom padding on pages where it shows.

**PWA-30 · Medium · CONFIRMED · Effort S: Many tap targets are well under 44 px (iOS) and 48 dp (Android)**
- Files and sizes:
  - Month chevrons `month-switcher.tsx` (`p-1` + 18 px ≈ 26 px). See `image.png`, `image2.png`, `image3.png`.
  - Account edit/archive/delete `accounts/page.tsx:1379-1407` (`p-1.5` + 13 px ≈ 25 px, 4 px apart, delete next to archive). See `image4.png`.
  - Header theme and colour-swap buttons `app-header.tsx`/`page.tsx` (`p-2` + 18 px ≈ 34 px).
  - Sub-page back links, e.g. `preferences/page.tsx:164-169` (`p-1.5` + 16 px ≈ 28 px). See `image5.png`.
  - The sync pill is a ~24 px `div` (`sync-provider.tsx:296-302`).
  - Shopping-list checkbox and drag handle (`image5.png`).
  - The "Show archived" checkbox (`image4.png`).
- Mobile impact: mis-taps, in particular hitting Archive or Delete instead of Edit. One-handed use is hard.
- Fix: at least 44×44 px hit areas (padding or an `::after` overlay), 8 px between destructive and safe actions, and on mobile, move edit/archive/delete into a row overflow menu or swipe actions.

**PWA-31 · Medium · CONFIRMED · Effort M: Text is too small for phone reading**
- Evidence: 93 uses of `text-[10px]`, 189 of `text-[11px]`, 3 of `text-[9px]` in `calendar-view.tsx`, and 456 of `text-xs` (12 px).
  - Bottom-nav labels are 11 px (`bottom-nav.tsx:65`).
  - Summary-bar labels are 11 px and amounts 12 px (`summary-bar.tsx:33-58`).
  - More-row descriptions are 11 px (`more/page.tsx:224`).
- Screenshots: every mobile screenshot. In `image6.png` the descriptions are hard to read, and in `image.png` "added by Viran" and the account metadata are about 11 px.
- Fix: a type scale with 12 px minimum for metadata, 14 px for body and 16 px for key amounts (PRD §5.0 lists 12/14/16/20/28). Respect the user's text size: use `rem` units, and test at iOS Larger Text and Android font scale 1.3.

**PWA-32 · Medium · CONFIRMED · Effort S: Dark-theme accent buttons fail AA contrast**
- Evidence: white text on dark `--accent` `#E8505B` = **3.67:1** (AA for normal text needs 4.5:1). This covers the Shopping List "+ Add" button (`image5.png`), the accent Save buttons in Preferences, inbox badges on More rows (`more/page.tsx:230-235`, 10 px white on accent) and the update banner button. The FAB icon passes the 3:1 non-text threshold.
- Fix: darken the dark-theme accent to about `#C93A45` for filled buttons, or use dark text on the light accent. Run axe on every tab and open sheet in both themes.

**PWA-33 · Medium · CONFIRMED · Effort M: Sheets and dialogs have no dialog semantics or focus management**
- Evidence: 0 `role="dialog"`, 0 `aria-modal`, 0 `aria-live` in `src/`. `Escape` is handled only in `confirmation-modal.tsx:37`. The page behind stays exposed to screen readers.
- Mobile impact: VoiceOver and TalkBack users can swipe into the content behind an open sheet. They aren't told a sheet opened, and focus isn't moved to it or returned afterwards.
- Fix: one shared `<Sheet>`/`<Dialog>` (native `<dialog>` with `showModal()`, or Radix) with `aria-labelledby`, initial focus, focus restore, an inert background, safe-area padding and `useModalHistory`. Migrate all 19 overlays. This also fixes PWA-24.

**PWA-34 · Medium · CONFIRMED · Effort M: Primary rows are `div onClick`, so screen readers don't expose them as actions**
- Files: budget card `components/budget/budget-card.tsx:46-51` (`image3.png`), transaction rows in `daily-view.tsx` (`image.png`), stats category rows (`image2.png`), the Quick Add field rows (PWA-27) and the sync pill (`sync-provider.tsx:296-302`).
- Fix: `<button>` or `<a>` with a descriptive name, e.g. "Expense, Sampath LKR, LKR 10.00, 27 Oct, edit".

**PWA-35 · Low · CONFIRMED · Effort S: The budget card prints the icon's name as text**
- File: `src/components/budget/budget-card.tsx:55` (`<span className="text-base">{item.categoryIcon}</span>`).
- Screenshot: `image3.png` shows "**Wallet** Salary", where "Wallet" is the Lucide icon name for the Salary category.
- Fix: render `<CategoryIcon name={item.categoryIcon} />` with the category colour, as the other lists do.

**PWA-36 · Low · CONFIRMED · Effort S: Tab headers are inconsistent, and sync status is missing on three tabs**
- Screenshots:
  - `image.png` (Trans): "Hard Money" title, sync pill, colour-swap and theme buttons.
  - `image2.png` (Stats): title only.
  - `image3.png` (Budget): title, subtitle and "Add Budget".
  - `image4.png` (Accounts): title, sync pill, "Show archived" and "Add Account".
  - `image6.png` (More): title and subtitle.
- `AppHeader` (`components/navigation/app-header.tsx`) exists but no page uses it. The sync pill is the only manual refresh, because pull-to-refresh is disabled (`globals.css:103`), so on Stats, Budget and More there's no way to see sync state or retry. The pill's text uses an undefined token `var(--muted)` (`sync-provider.tsx:306,318`). The tab label is abbreviated "Trans." (`bottom-nav.tsx:24`).
- Fix: one shared mobile header with the page title, sync status and one trailing action. Move theme and colour swap to Preferences. Rename the tab "Transactions" (it fits at 11-12 px), or use "Ledger".

**PWA-37 · Low · CONFIRMED · Effort S: Amounts mix monospace and proportional fonts**
- Screenshot: `image.png`. Day headers and row amounts ("– LKR 10.00", "+ LKR 9,800,000.00") are monospace, while the summary bar directly above uses the proportional font. `image4.png` mixes them as well.
- Impact: it looks unfinished, and Android's monospace fallback differs from iOS SF Mono. `tabular-nums` already gives aligned digits.
- Fix: drop `font-mono` from amounts and keep `tabular-nums` with the system font.

**PWA-38 · Low · CONFIRMED · Effort S: Transactions excluded from stats aren't explained**
- Files: `components/transaction/daily-view.tsx:69-72` (day total skips `excludeFromStats`), `:215` (badge shown only when both `excludeFromBalance && excludeFromStats`).
- Screenshot: `image.png`. "Fri, Oct 23" shows a day total of **LKR 0.00** above a row of **+ LKR 9,800,000.00** (loan disbursement), and Income is LKR 0.00. Only a "No budget" chip is shown.
- Fix: show an "Excluded from totals" chip whenever `excludeFromStats` is true, and grey out the row amount.

**PWA-39 · Low · CONFIRMED · Effort S: More tab clean-up**
- Files: `src/app/more/page.tsx:252-256` (placeholder `EmptyState` "Settings & Tools" at the bottom of a full page; it's the empty card cut off at the bottom of `image6.png`); `:183` fallback email `treasury-admin@local`.
- Other issues: the iOS-only "Apple Shortcuts Guide" row is shown to Android users. There's no app version or "Install app" row (PWA-17). Log Out is the most prominent control (PWA-12).
- Fix: remove the placeholder, show the build version at the bottom, show the iOS-only rows only on iOS, and move Log Out to the end of the list.

### G. Performance on mobile

**PWA-40 · High · CONFIRMED · Effort M: Every route, including `/login` and `/offline`, downloads about 1.08 MB of JS (317 KB gzipped)**
- Measured from the build (gzip -9; Brotli on the wire is usually 10-20 % smaller):

| Route | JS files | Raw | Gzip |
|---|---|---|---|
| `/login` | 18 | 1,087 KB | 319 KB |
| `/` | 17 | 1,082 KB | 317 KB |
| `/offline` | 18 | 1,084 KB | 318 KB |
| `/more/preferences` | 18 | 1,096 KB | 321 KB |
| Root layout entry alone | 12 | 639 KB | 185 KB |
| `/login` page entry alone | 1 | 5 KB | 2 KB |

- Cause: `src/components/navigation/native-tab-container.tsx` statically imports all five tab pages (`@/app/page`, `stats`, `budget`, `accounts`, the 1,642-line `accounts/page.tsx`, and `more`) into the root layout. Their full import graphs (Quick Add, modals, Dexie hooks, finance-core) ship with every page. The layout also mounts `QuickAddModal`, `SyncProvider` and the tab container on `/login`. CSS is fine at 64 KB raw / 12 KB gzip, and there are no webfonts or `<img>` tags.
- Mobile impact: on a mid-range Android phone over 4G, about 1 MB of JS to parse and run before the app responds, on first install and after every deploy. That hurts first impressions on `/login` the most.
- Fix: load tabs with `next/dynamic` / `React.lazy` inside `NativeTabContainer`, so only the active tab is in the initial bundle and the rest prefetch on idle. Mount `QuickAddModal` lazily on first open. Render a minimal auth layout for `/login`/`/register` (a route group with its own layout). Set a performance budget (e.g. 150 KB gzip for first load) in CI.

**PWA-41 · Medium · CONFIRMED · Effort M: Live queries load whole tables on every change**
- Files: `src/components/sync-provider.tsx:227-289` (`db.transactions.filter(...).toArray()` and the same for every table), consumed by every mounted tab. Up to five tabs stay mounted (`native-tab-container.tsx`).
- Mobile impact: with a year or more of data, each sync or write re-reads and re-filters every table for every mounted tab. That causes dropped frames and battery drain on low-end phones.
- Fix: indexed range queries per screen (`where("transactionDate").between(...)`), pause live queries for hidden tabs, and virtualise long lists.

### H. Verification gap

**PWA-42 · Medium · CONFIRMED · Effort M: None of the PWA behaviour is covered by automated tests**
- Files: `playwright.config.ts:15` (`serviceWorkers: "block"`), `:44` (`next dev` web server, where `PwaManager` doesn't register the SW at all); `tests/e2e/s20-pwa.spec.ts` contains S20-03 and S20-05…09 only. Offline reload (S20-01), offline tab navigation (S20-02) and the update flow (S20-04) are missing. The `mobile-safari` project runs `@smoke` tests only.
- Impact: PWA-07, PWA-09 and PWA-10 could only be found by reading code.
- Fix: a separate Playwright project against `next build && next start` with `serviceWorkers: "allow"`. Tests: install → go offline → reload `/` and a sub-page. Change `sw.js` → banner → Reload reloads the page. Real push subscription (Chromium). Run axe on every tab and sheet on Pixel 7 and iPhone 14.

---

## 3. Comparison with the earlier run (`audit/2026-10-20/frontend-uiux.md`, `audit/2026-10-20/infra-prd.md`)

Earlier IDs are shown with their source file: FE = frontend-uiux.md, INF = infra-prd.md.

### 3.1 Fixed since the earlier run

| Earlier item | Status now | Evidence |
|---|---|---|
| FE MOB-01: bottom nav, FAB and toasts ignore safe-area insets; `black-translucent` status bar with no top inset | **Fixed** | Safe-area utilities in `globals.css:204-255`, used by the shell (`layout.tsx:64`), bottom nav, FAB, toast, banner and most sheets. Status bar is now `default`. Gaps remain on a few sheets (PWA-24). |
| FE MOB-02: `h-screen` (100vh) shell; sheets use `90vh` | **Fixed** | `layout.tsx:57` uses `h-[100dvh]`, `.modal-sheet-dialog` uses `dvh`, and `interactive-widget=resizes-content` was added. That last change causes a new side effect (PWA-21). One `85vh` remains in `icon-picker.tsx:77`. |
| FE PWA-09 (part): maskable icon reused the padded `icon-512`; artwork read "VG"; 290 KB icon | **Partly fixed** | A dedicated full-bleed `icon-maskable-512.png` now exists, the artwork is a piggy bank, and `icon-512` is 242 KB. `id`, `scope`, `shortcuts`, `screenshots`, the orientation lock, the static dark colours and the brand mismatch remain (PWA-16, PWA-18). |
| FE NAV-04 (part): sheets don't integrate with history, so Android back leaves the page | **Mostly fixed** | `useModalHistory` (`src/hooks/use-modal-history.ts`) is used by 12 overlays. 4 are still missing (PWA-24). A new, related problem: tab switches push history (PWA-23). |
| FE FIN-05: account delete is one tap with no confirmation | **Fixed** | `accounts/page.tsx:189-199` now opens `ConfirmationModal` (commit `0c401ec`). The tap targets are still tiny (PWA-30). |
| iOS input focus zoom (implicit in FE MOB-02) | **Fixed** | `globals.css:195-202` forces 16 px on inputs under 768 px. |

### 3.2 Still present

| Earlier item | This run | Notes |
|---|---|---|
| FE PWA-01 / INF OPS-04: fake push subscription; push never delivered | PWA-01 | The fake moved from `more/page.tsx` to `more/preferences/page.tsx:140-146`. Still no `web-push`. |
| FE PWA-02 / INF PWA-01: SW never serves `/_next/`; offline cold start depends on the HTTP cache | PWA-07 | Unchanged, and now worse because the priming cache name drifted (PWA-08). |
| FE PWA-03: RSC requests answered from the cache-first branch | PWA-09 | Unchanged (`sw.js:104-122`). |
| FE PWA-04 / INF PWA-02: unconditional `skipWaiting()` undermines the update prompt | PWA-10 | Unchanged. This run adds that the Reload button is a no-op and that the banner covers the FAB. |
| FE PWA-05: manual cache version duplicated in two files; unbounded growth | PWA-08 | Now actively broken: SW `v5` vs manager `v4`. |
| FE PWA-06 / INF PWA-03: authenticated HTML cached and kept after logout | PWA-12 | Unchanged. |
| FE PWA-07: notification fallback URL `/transactions` doesn't exist | PWA-06 | Unchanged (`sw.js:130,146,157`). |
| FE PWA-08: `beforeinstallprompt` captured but unused | PWA-17 | Unchanged. |
| FE PWA-10: offline page is a dead end | PWA-15 | Unchanged. |
| FE PWA-11: leftover create-next-app assets and duplicate favicon | PWA-18 | Unchanged. |
| INF CFG-04: VAPID key route prerendered static with a sample fallback key | PWA-05 | Re-confirmed in this run's build (`○ /api/push/vapid-public-key`). |
| Backend F-038 (from `backend-security.md`): reminders fire every tick | PWA-03 | Unchanged (`cron-runner.ts:541`). |
| FE MOB-03: FAB overlaps content and appears on every page | PWA-29 | Unchanged. Now visible in `image5.png` and `image6.png`. |
| FE MOB-05: mobile header controls differ per tab; `AppHeader` unused | PWA-36 | Unchanged. Visible across `image.png`…`image6.png`. |
| FE STATE-04: session expiry shown as "Synced" | PWA-13 | Unchanged (`client.ts:41-43`, `:73`). |
| FE PERF-02: 1 s sync poll even offline | PWA-14 | Unchanged. |
| FE PERF-01: whole-table live queries | PWA-41 | Unchanged. |
| FE PRV-02 / DEST-02: local data kept after logout; logout one tap and ignores the outbox | PWA-12 | Unchanged. |
| FE FIN-03: Quick Add has no in-flight guard | PWA-26 | Unchanged. |
| FE FIN-16 (part): amount inputs lack `inputMode="decimal"` | PWA-25 | Unchanged. This run lists all 14 inputs and adds the `type="number"` issues. |
| FE A11Y-01: no dialog semantics or focus management | PWA-33 | Unchanged (0 `role="dialog"`, 0 `aria-modal`). |
| FE A11Y-02: `div onClick` rows | PWA-34 | Unchanged. |
| FE A11Y-04 (part): toggles expose no state | PWA-27 | Still true in the mobile Quick Add sheet ("Exclude from budget"). |
| FE A11Y-05 (part): white on dark accent 3.67:1 | PWA-32 | Unchanged. |
| FE A11Y-09: tap targets under 44 px | PWA-30 | Unchanged. Account row icons visible in `image4.png`. |
| FE A11Y-10: font sizes below the PRD scale | PWA-31 | Unchanged (93 × 10 px, 189 × 11 px, 3 × 9 px). |
| FE NAV-03: placeholder `EmptyState` and fallback email on More | PWA-39 | Unchanged. Visible at the bottom of `image6.png`. |
| FE VIS-02 (part): undefined tokens | PWA-36 | `--muted` in the sync pill, `--surface-hover` on More rows. |
| INF TST-02: E2E runs on `next dev` with SWs blocked; S20-01/02 missing | PWA-42 | Unchanged. S20-04 (update flow) is also missing. |
| FE SEC-02 / INF: `middleware.ts` deprecated in Next 16 | Not a PWA finding | The build still prints the deprecation warning. Tracked in the security and infra areas. |

### 3.3 Missed by the earlier run (new in this run)

| This run | Why it was missed or is new |
|---|---|
| PWA-02: false "Reminders active" on iOS Safari and other unsupported browsers; permission state not reconciled | The earlier run reported the fake subscription but not the `"Notification" in window` bypass. |
| PWA-04: unsubscribe removes every device's subscription; reminders are per user | Not covered. |
| PWA-08: priming cache drift (`v4` vs `v5`) and growth on every deploy | New regression: `sw.js` was bumped to `v5` but `pwa-manager.tsx` wasn't. |
| PWA-10 (part): Reload button is a no-op; banner covers the FAB; no `reg.update()` on resume | Earlier run noted `skipWaiting` but not these effects. |
| PWA-11: no `navigator.storage.persist()`, so the offline outbox can be evicted | Not covered. |
| PWA-13 (part): fixed 7-day session with no sliding refresh forces weekly re-login in the installed app | Not covered from the mobile angle. |
| PWA-19: status bar and `theme-color` ignore the in-app theme override; no iOS startup images | Not covered. |
| PWA-20: no root `color-scheme`; native controls render light in dark mode (`image4.png`) | Not covered. |
| PWA-21: `resizes-content` lifts the bottom nav and FAB above the Android keyboard; iOS sheets under the keyboard | New side effect of the MOB-02 fix. |
| PWA-22: iOS double-tap zoom on the keypad; no `touch-action`/tap-highlight | Not covered. |
| PWA-23: tab switches push history, so Android back walks back through tabs | New with the native tab container. |
| PWA-27: mobile Quick Add sheet hard-coded dark, ignores colour swap, X doesn't close, a11y gaps | Partly covered before (A11Y-04 toggle). Theme, colour swap and the X behaviour weren't. |
| PWA-28: `divide-hairline` dividers render in `currentColor` (white lines) | Only visible in screenshots, which the earlier run didn't have. |
| PWA-35: budget card prints the icon name "Wallet" as text | Seen in `image3.png`. |
| PWA-37: mixed mono and proportional amount fonts | Seen in `image.png` and `image4.png`. |
| PWA-38: excluded-from-stats rows unexplained (day total 0.00 next to +9.8M) | Seen in `image.png`. |
| PWA-40: measured ~317 KB gzip JS on every route; root layout bundles all tabs | The earlier run didn't measure bundles. The tab container that causes it is newer. |

### 3.4 Earlier items not re-verified in this run
- FE MOB-04 (dense rows overflowing at 320-375 px) and FE MOB-06 (inbox renders both layouts). The screenshots are around 640 CSS px wide and don't show the narrow-width cases, and I didn't re-read those components line by line.
- INF PWA-04 (Apple Shortcut download). The route is gone and a static `public/HardMoney_SMS_Ingress.shortcut` replaces it. That's outside the PWA shell scope and is left to the backend/infra reviewers.

---

## 4. Suggested fix order for the mobile PWA

1. **This week (S effort, high impact):** PWA-25 (`inputMode`), PWA-26 (save guard), PWA-28 (divider token), PWA-10 (update flow and banner position), PWA-08 (delete the priming cache), PWA-02 (honest reminder UI), PWA-29 (FAB scope), PWA-20 (`color-scheme`), PWA-22 (`touch-action`), PWA-23 (`replaceState` for tabs).
2. **Next:** PWA-07 + PWA-09 (a real SW precache via Serwist or equivalent, with a bypass for RSC requests), PWA-11 (persistent storage), PWA-12/PWA-13 (logout and session UX), PWA-40 (lazy tabs and auth layout).
3. **Then:** PWA-01/03/04/05/06 (real web push end to end), PWA-16/17/18/19 (manifest, install UX, icons, status bar), PWA-33/34/27 (a shared accessible Sheet and button rows), PWA-30/31/32 (touch targets, type scale, contrast), and PWA-42 (production-build PWA tests on Pixel and iPhone projects).

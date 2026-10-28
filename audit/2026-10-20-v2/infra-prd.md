# Hard Money audit (run 2): Infra, config, tests, deployment + PRD/PLAN gap table

- **Report label:** 2026-10-20-v2 (second audit run). The machine clock read `Wed Oct 28 08:03 +0530 2026` while this ran.
- **Repo HEAD:** `0c401ec` ("feat: add confirmation modal component and integrate into account actions"). That is 33 commits after the first run's HEAD `f8e719a`.
- **Working tree:** clean, apart from the untracked screenshots in `audit/*.png`.
- **Scope:** read-only. I changed no source files, made no commits, didn't touch a database and started no dev server.
- **Side effects of the checks:** `pnpm build` ran `prisma generate`, which rewrote the generated client inside `node_modules`. `next build` created `.next/`, which is gitignored and didn't exist before.
- **Next.js docs:** usage was checked against `node_modules/next/dist/docs/`, specifically `version-16.md` (middleware → proxy), `proxy.md`, `cacheComponents.md`, `partialPrefetching.md`, `agentUpgrade.md`, `output.md` and `progressive-web-apps.md`.

**Status labels**
- **CONFIRMED:** a command I ran in this audit shows it. That covers build, lint, tsc, vitest, a node reproduction script, `ls`/`file`/`grep` on the tree, or inspecting the build output.
- **SUSPECTED:** inferred from reading code. It needs a runtime check (a live DB, a device or concurrency) to prove.

**Effort:** S is under half a day, M is 1-3 days, L is more than 3 days.

---

## 0. Command results (current run)

| Command | Result | First run (same day, HEAD `f8e719a`) |
| --- | --- | --- |
| `pnpm lint` | **FAIL**, exit 1. **157 problems: 142 errors, 15 warnings.** | FAIL: 187 problems (163 errors, 24 warnings) |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0, no output | PASS |
| `pnpm exec vitest run` | **PASS**: 8 files, **62 tests**, 0.92 s | PASS: 6 files, 44 tests |
| `pnpm build` (no env, no DB) | **FAIL**, exit 1. Page-data collection throws `AUTH_SECRET must be configured with at least 32 bytes in production` (`src/lib/auth.ts:9`) for `/api/households/[id]/members`, `/api/auth/register` and `/api/fixed-deposits/[id]`. Compile and TypeScript stages pass. | PASS (the secret fallback still existed then) |
| `AUTH_SECRET=<dummy 52-char placeholder> next build` | **PASS**, exit 0. 46 static pages. Warning: `The "middleware" file convention is deprecated. Please use "proxy" instead.` `/api/push/vapid-public-key` was prerendered **static** (○). No DB is needed. | n/a |
| `docker compose config -q` | Valid YAML. It warns that `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `CRON_SECRET` are unset and defaults them to blank. | n/a |
| `docker compose build web` | Couldn't run: the Docker daemon isn't running. No `Dockerfile` exists (`ls Dockerfile` reports no such file). | Same |
| Playwright | Not run. It needs Postgres and a dev server, which this audit isn't allowed to use. | Not run |

**Lint breakdown (current)**

| Rule | Count |
| --- | --- |
| `@typescript-eslint/no-explicit-any` (error) | 139 |
| `react-hooks/set-state-in-effect` (error; React Compiler bail-out) | 2 (`src/app/more/sms-activity/page.tsx:51`, `src/components/account/loan-detail-modal.tsx:97`) |
| `prefer-const` (error) | 1 (`src/lib/finance-core/calculator.ts:98`) |
| `@typescript-eslint/no-unused-vars` (warning) | 12 |
| `react-hooks/exhaustive-deps` (warning) | 3 |

Errors per file, top entries:

| File | Errors |
| --- | --- |
| `src/app/api/test/[...slug]/route.ts` | 27 |
| `src/app/api/sync/push/route.ts` | 18 |
| `src/lib/jobs/cron-runner.ts` | 10 (plus 4 warnings) |
| `src/lib/sms/worker.ts` | 10 |
| `src/lib/sms/ingestion.ts` | 9 |
| `tests/e2e/s19-household.spec.ts` | 9 |
| `src/app/api/loans/[id]/pay-emi/route.ts` | 8 |
| `tests/e2e/s07-transaction-lifecycle.spec.ts` | 8 |
| `tests/e2e/s06-trans-views.spec.ts` | 7 |
| `src/app/api/loans/[id]/schedule/[entryId]/route.ts` | 6 |
| `src/components/pwa-manager.tsx` | 4 |
| `src/app/api/sync/pull/route.ts` | 4 |

17 other files have 1-3 problems each.

---

## 1. How infra, config and tests work today

### 1.1 Toolchain and build
- **App:** a single Next.js 16.4.3 app (App Router, Turbopack, React 19.3).
  - `next.config.ts` turns on `reactCompiler`, `cacheComponents` and `partialPrefetching`, which the docs say must be set together. It also sets `devIndicators: false`, `experimental.agentUpgrade: "security"` (the documented default) and a Turbopack rule for Tailwind v4.
  - It has no `headers()`, no `output: "standalone"` and no `poweredByHeader: false`.
- **Package manager:** pnpm 12.6.0 via `packageManager`; Node 24.21.0 locally. `package.json` has no `engines` field.
  - Scripts: `dev`, `build` (`prisma generate && next build`), `start`, `lint` (`eslint`), `test`/`test:unit` (vitest) and `test:e2e` (playwright).
  - There are no `typecheck`, `db:migrate` or `db:seed` scripts.
- **Database:** Prisma 6.19.3 with Postgres. There are 4 migrations under `prisma/migrations/`: `init` (688 lines), currency conversion, historical progress, and loan payment due day.
  - The global `global_server_seq` sequence isn't in any migration. `src/lib/server-seq.ts:19-21` creates it lazily at runtime.
- **Lint:** ESLint 9 flat config (`eslint-config-next` core-web-vitals plus typescript).
- **Unit tests:** Vitest 5 runs `tests/unit/**/*.test.ts` with no coverage provider installed. `node_modules/@vitest` doesn't exist.
- **E2E tests:** Playwright 1.64 runs `tests/e2e`.

### 1.2 Runtime topology
- **One process: the Next server.** Everything runs in it.
  - **SMS ingress:** `POST /api/v1/webhooks/sms-ingress` saves a `BankSms` row as `PENDING`, then calls `setTimeout(processBankSms, 0)` in the same process.
  - **Scheduled jobs:** `runCronTick()` (`src/lib/jobs/cron-runner.ts`) covers budget snapshots, CC statements, installment billing, FD payouts and maturity, and push reminders. It runs only when something POSTs `/api/v1/cron/tick` with `CRON_SECRET`, or through the E2E test API. Nothing in the repo schedules it.
  - **Push:** `enqueuePushNotification` appends to an in-memory array. No push library is installed and nothing is ever delivered.
- **Docker:** `docker-compose.yml` defines `postgres:16-alpine` (port 5432 published) and a `web` service built from a `Dockerfile` that doesn't exist. There's no worker service and no migrate step.
- **Request gate:** `src/middleware.ts` (a deprecated name in Next 16) verifies the `hardmoney_session` HS256 JWT.
  - Public paths: `/login`, `/register`, `/offline`, `/api/auth`, `/api/health`, `/api/test`, `/api/v1/cron` and `/api/v1/webhooks`.
  - Static assets are skipped with an extension regex.
  - Route handlers re-check the session and its `sessionVersion` through `getSessionUser()`.
- **Fail-fast secrets:** in production, `AUTH_SECRET` (`src/lib/auth.ts:6-10`, `src/middleware.ts:4-8`) and `APP_ENCRYPTION_KEY(S)` (`src/lib/encryption.ts:3-16`) now fail fast when missing.
- **Test API:** `/api/test/*` returns 404 unless all of these hold: `NODE_ENV !== "production"`, `E2E_MODE=1`, `E2E_SECRET` is set, and the `x-e2e-secret` header matches.

### 1.3 Health, logging, monitoring
- **Health:** `GET /api/health` returns `{status:"ok", now, uptime}`. It never touches the DB, the job state or the SMS queue. The compose `web` service has no healthcheck.
- **Logging:** plain `console.*` everywhere. There's no logger, no request IDs, no redaction, no `instrumentation.ts` and no error reporting.
  - `src/lib/server-log.ts` monkey-patches `console` into an in-memory array. Only the test API imports it, and only dynamically.
  - The SMS ingress route alone has 19 console calls.
- **Monitoring:** no job-run history, no "System health" page and no metrics.

### 1.4 PWA
- **Service worker:** `public/sw.js` is hand-written, cache `hardmoney-v5`.
  - It precaches `/offline`, the manifest and icons.
  - HTML navigations are network-first with a cache fallback, then `/offline`.
  - Other GETs are cache-first, except `/api/*` and `/_next/*`, which are never handled.
  - It calls `skipWaiting()` on install and has push and notification-click handlers.
- **PWA manager:** `src/components/pwa-manager.tsx` registers the SW only when `NODE_ENV === "production"`. It "primes" a cache named `hardmoney-v4`.
- **Manifest:** `public/manifest.json` sets `standalone`, 192/512 icons plus a maskable icon, and `theme_color #121212`.

### 1.5 Tests
- **Unit:** 62 tests in 8 files.

  | File | Tests |
  | --- | --- |
  | `calculator` | 5 |
  | `confirmation-modal` | 4 |
  | `credit-card` | 6 |
  | `encryption` | 2 |
  | `finance-core` (money, calendar, ledger, budget, FD and loan golden vectors) | 20 |
  | `mask-numbers` | 3 |
  | `sms-template-parser` | 18 |
  | `transfer-reconciliation` (ingestion) | 4 |

  Nothing tests `cron-runner`, `sync/push`, `sync/pull`, `sms/worker`, `auth`, `authorization`, `rate-limit` or Dexie migrations.
- **E2E:** 21 spec files with 247 distinct `S##-##` IDs, against 261 IDs planned in PLAN.md.
  - Projects: `web` (Desktop Chrome 1440×900), `mobile` (Pixel 7, 412×915) and `mobile-safari` (iPhone 14, `@smoke` only; 3 tagged tests).
  - The `webServer` is `npx next dev -p 3000` with `reuseExistingServer: true`, and `serviceWorkers: "block"` is set.
  - Axe runs in one test (S01-07, shell page only). `toHaveScreenshot` is used 0 times.
- **CI:** none. There's no `.github/` and no other pipeline config.

---

## 2. Findings

**Finding counts:** 2 Critical, 15 High, 13 Medium, 7 Low (37 total).

### INF-01. `docker compose up` can't work: no Dockerfile, no worker, no migrate step, partial env
- **Severity:** Critical. **Status:** CONFIRMED.
- **Location:** `docker-compose.yml:20-40`. There's no `Dockerfile` or `.dockerignore` at the repo root, and `next.config.ts` has no `output`.
- **Evidence:**
  - `ls Dockerfile .dockerignore` reports "No such file or directory" for both. `docker compose config -q` passes, but the `web` service has `build: { dockerfile: Dockerfile }`.
  - There's no `worker` service, although PRD §1 says "Docker Compose (`web`, `worker`, `postgres`)".
  - Nothing runs `prisma migrate deploy`.
  - The `web` service doesn't forward `VAPID_*`, `GEMINI_PROVIDER`, `APP_ENCRYPTION_KEYS` or `E2E_SECRET`.
  - There's no `web` healthcheck.
- **Impact:** the only documented deployment path for an "open-source, self-hosted" product fails at the first command.
- **Fix:**
  - Add a multi-stage Dockerfile: `pnpm fetch`, `pnpm install --frozen-lockfile`, `prisma generate`, then `next build` with `output: "standalone"` (copy `public/` and `.next/static` per `output.md`). Run as the non-root `node` user.
  - Add `.dockerignore`.
  - Add a one-shot `migrate` service (`prisma migrate deploy`) that `web` waits on with `service_completed_successfully`.
  - Add a `worker`/cron service (see INF-02).
  - Add a `web` healthcheck on `/api/health`.
  - Forward every runtime env var.
- **Effort:** M.

### INF-02. No scheduler: installments, statements, FD payouts, budget month-close and reminders never run by default
- **Severity:** Critical. **Status:** CONFIRMED.
- **Location:** `src/lib/jobs/cron-runner.ts:36`. Its only callers are `src/app/api/v1/cron/tick/route.ts:20` and the E2E test API.
- **Evidence:**
  - `grep pg-boss|pg_advisory` over `src/` returns 0 files.
  - There's no worker, no interval timer, no catch-up on login or sync, and no README telling the operator to set up an external cron.
  - PRD §1 and §2.7 require a pg-boss worker plus "catch-up ... when a user authenticates and syncs, guarded by a Postgres advisory lock".
- **Impact on a default install:**
  - CC installments are never billed and plans never complete.
  - Statement snapshots are never written.
  - FD interest is never paid and FDs never mature.
  - Budget rollover snapshots never close.
  - Reminders never fire.

  Users see balances that silently drift from their bank.
- **Fix:**
  - Minimum: a compose `cron` sidecar (for example `curlimages/curl` in a loop, or supercronic) that POSTs `/api/v1/cron/tick` with `CRON_SECRET` every 15 minutes. Document it.
  - Proper: pg-boss per the PRD, with `pg_try_advisory_lock` around `runCronTick` and an opportunistic catch-up after `sync/pull`.
- **Effort:** M.

### INF-03. Raw SMS bodies, API key prefixes and user emails are written to production logs
- **Severity:** High. **Status:** CONFIRMED (static: unconditional code path).
- **Location:** `src/app/api/v1/webhooks/sms-ingress/route.ts:34-39,56,86-95,128`.
- **Evidence:**
  - When `E2E_MODE !== "1"` (every production install), line 94 runs `console.log("[SMS-INGRESS] Request body:", JSON.stringify(body, null, 2))`. That body contains the full `rawSms`.
  - Line 38 logs the first 10 characters of the webhook API key.
  - Line 56 logs `user.email`.
  - Line 128 logs the `dedupeKey`.
  - Redaction applies only in E2E mode (lines 86-92). The S14 "raw SMS never logged" test therefore passes while production does the opposite.
  - This logging arrived with commit `da48e4f` ("add detailed logging ... to SMS ingress webhook route"), after the first audit.
- **Impact:** this directly violates PRD §6 ("Raw SMS and parsed payloads are never written to application logs"). Bank SMS carry balances, merchants, partial card numbers and OTP-adjacent text. Any log shipping or `docker logs` exposes them.
- **Fix:**
  - Delete the body log and the key-prefix log, and log the user ID instead of the email.
  - Introduce a logger with a redaction list (`rawSms`, `rawMessage`, `x-api-key`, `authorization`, `cookie`, `email`). See INF-23.
  - Make the E2E secrecy test run with `E2E_MODE` redaction disabled, so it tests the production path.
- **Effort:** S.

### INF-04. Encryption key rotation corrupts newly saved Gemini keys
- **Severity:** High. **Status:** CONFIRMED (node reproduction against `src/lib/encryption.ts`).
- **Location:** `src/lib/encryption.ts:23,32,48-51`.
- **Evidence:**
  - `encryptAesGcm` encrypts with the **first** key in `APP_ENCRYPTION_KEYS`, but always writes the 4-part `v1:` format without a key id.
  - `decryptAesGcm` maps any 4-part value to kid `current`.
- **Reproduction:** I set `APP_ENCRYPTION_KEYS="v2:<B>,current:<A>"`, the natural "new key first" rotation, and ran a node script against the module.
  - Single-key roundtrip: `true`.
  - Old ciphertext after rotation: `true`.
  - New ciphertext prefix: `v1:`, 4 parts.
  - Decrypting the new ciphertext: `ERR Unsupported state or unable to authenticate data`.
- **Impact:** as soon as an operator rotates, every Gemini key saved afterwards can't be decrypted. `worker.ts:127-134` then marks those SMS "Failed to decrypt Gemini API key", and re-entering the key doesn't help. Rotation is a PRD §6 requirement.
- **Fix:**
  - Encrypt as `v2:<kid>:<iv>:<tag>:<ct>` using the first key's kid. Keep `v1` decode mapped to `current`.
  - Add a unit test for rotation in both orders.
  - Add a re-encrypt script.
  - Document `APP_ENCRYPTION_KEYS` in `.env.example`.
- **Effort:** S.

### INF-05. Gemini provider: raw SMS retained in memory forever, key sent in the URL, no schema, no timeout, and `.env.example` disables real Gemini
- **Severity:** High. **Status:** CONFIRMED (static).
- **Location:** `src/lib/sms/gemini-provider.ts:52-58,60,94-107,109-111`, `.env.example:13`.
- **Evidence:**
  - Every call pushes `{rawMessage, maskedMessage, ...}` into a `globalThis` array. That happens in production too, and nothing clears the array except the test API. The result is unbounded memory growth and unmasked SMS kept in process memory.
  - The key goes in `?key=` in the URL, where proxy or egress logs can capture it. Google also accepts the `x-goog-api-key` header.
  - `generationConfig` sets only `responseMimeType`. No `responseSchema` is sent, so PRD §1 "Zod-based Structured Outputs" isn't met.
  - `fetch` has no timeout or `AbortSignal`, so a hung upstream call blocks that SMS forever (see INF-09).
  - The error message embeds the full upstream response body, and it ends up in `failureReason`.
  - `.env.example` ships `GEMINI_PROVIDER="mock"`. A self-hoster who copies it and runs `pnpm start` routes every non-template SMS to the mock path, which throws "No mock Gemini response queued". Compose doesn't forward the variable, so Docker installs behave differently from `pnpm start` installs.
- **Fix:**
  - Capture requests only when `E2E_MODE === "1"`.
  - Send the key in the `x-goog-api-key` header.
  - Pass `responseSchema` (from `z.toJSONSchema(BankSmsSchema)`) or use `@google/genai`.
  - Add `AbortSignal.timeout(15000)` and truncate error bodies.
  - Remove `GEMINI_PROVIDER` from `.env.example` and put it in a `.env.test`.
- **Effort:** S-M.

### INF-06. Push reminders are fake: the client fabricates a subscription, and the server never sends anything
- **Severity:** High. The UI reports success for a feature that doesn't exist. **Status:** CONFIRMED (static).
- **Location:** `src/app/more/preferences/page.tsx:140-145`, `src/lib/push/outbox.ts:13-24`, `src/lib/jobs/cron-runner.ts:516-548`, `package.json` (no `web-push`).
- **Evidence:**
  - Instead of calling `registration.pushManager.subscribe({applicationServerKey})`, the page builds `endpoint: https://fcm.googleapis.com/fcm/send/test-<random>` with `p256dh: "BMo9aW7-test-p256dh-key-mock"` and posts it. The UI then shows "Reminders active".
  - `grep web-push|sendNotification` over `src/` returns 0 matches. `VAPID_PRIVATE_KEY` is never read.
  - The cron reminder block fires on **every** tick after the configured time (`userTime >= configuredTime`, line 541) with no once-per-day guard, so the in-memory array grows without bound.
- **Impact:** this misleads users on the PWA's main engagement feature. PLAN Step 20 is marked ☑ but the feature isn't built.
- **Fix:**
  - Use a real `pushManager.subscribe` with the VAPID public key (fetched at runtime; see INF-19).
  - Add `web-push`, send to every `PushSubscription`, and delete subscriptions on 404/410.
  - Persist `lastReminderSentOn` (a date in the user's timezone).
  - Keep the in-memory outbox for E2E only.
- **Effort:** M.

### INF-07. Every money column is `INTEGER` (int4), not `BIGINT`
- **Severity:** High. **Status:** CONFIRMED.
- **Location:** `prisma/schema.prisma` (33 `*Minor` fields, all `Int`/`Int?`), `prisma/migrations/20261023054607_init/migration.sql:130,180,355`, e.g. `"amountMinor" INTEGER NOT NULL`.
- **Evidence:**
  - The int4 maximum of 2,147,483,647 minor units is LKR 21,474,836.47.
  - The supplied screenshot (`audit/image.png`) already shows a "Loan Disbursement: BOC Housing" of LKR 9,800,000.00, which is 46% of the ceiling.
  - A LKR 25M housing loan, lease or FD, or an account balance above LKR 21.4M, makes Prisma throw on write.
- **Impact:** realistic Sri Lankan housing loans and FDs can't be recorded, and aggregates such as `balanceCacheMinor` can overflow. PRD §2.1 requires BIGINT.
- **Fix:**
  - Write a migration that changes the `*Minor` columns to `bigint`.
  - Map to JS `number` with a `Number.isSafeInteger` guard at the API edge, or use superjson as the PRD says.
  - Add an overflow regression test.
- **Effort:** M-L.

### INF-08. Sync sequencing and atomicity are unsafe: sequence not migrated, silent fallback, no transactions in push, unpaginated pull
- **Severity:** High. **Status:** CONFIRMED (static). Missed rows under concurrency are SUSPECTED.
- **Location:** `src/lib/server-seq.ts:9-45`, `src/app/api/sync/push/route.ts` (0 uses of `$transaction`; `appliedMutation.findUnique` at line 97), `src/app/api/sync/pull/route.ts:53-139` (`serverSeq: { gt: cursor }`, no `take`).
- **Evidence:**
  - `global_server_seq` isn't in any migration (`grep` over `prisma/migrations` returns 0 matches). It's created on first failure. If `nextval` fails, the code falls back to a `SyncSequence` row starting at 1, which is far below existing client cursors, so those rows are never pulled.
  - Inside an interactive Prisma transaction, the failing first `nextval` aborts the Postgres transaction, so the fallback can't work there anyway.
  - Push applies each mutation and records `AppliedMutation` without a DB transaction. A crash in between re-applies the mutation on retry, and concurrent retries both pass the `findUnique` check.
  - The sequence value is drawn before commit, so a concurrent pull can advance past an uncommitted lower seq.
  - Pull returns every changed row in one response. A first sync on a phone with years of data is one very large JSON payload.
- **Impact:** permanent, silent client/server divergence. That's the worst failure mode for an offline-first ledger.
- **Fix:**
  - Create the sequence in a migration and remove the fallback.
  - Wrap each mutation plus its `AppliedMutation` insert in `prisma.$transaction`, with a unique `mutationId`.
  - Use a safe pull watermark: return rows only up to the minimum in-flight seq, or re-pull an overlap window.
  - Paginate pull with `take` and a `hasMore` flag.
- **Effort:** L.

### INF-09. SMS processing isn't durable: rows stuck in `PENDING` or `PROCESSING` are never retried
- **Severity:** High. **Status:** CONFIRMED (static).
- **Location:** `src/app/api/v1/webhooks/sms-ingress/route.ts:150-160`, `src/lib/sms/worker.ts:22-31,272-305`, `prisma/schema.prisma` `BankSms.nextRetryAt` (unused; `grep nextRetryAt src` returns 0).
- **Evidence:**
  - Processing is a `setTimeout` inside the request process.
  - `processAllPendingBankSms` is only called by the test API.
  - The cron tick doesn't sweep SMS.
  - If the process restarts after the insert, or anything throws after the `PENDING → PROCESSING` claim, the row stays in that state forever. The manual retry route only works if the user notices.
- **Impact:** bank transactions silently go missing.
- **Fix:**
  - In the tick or worker, sweep `PENDING` rows and `PROCESSING` rows older than 5 minutes.
  - Use `attempts` with an exponential `nextRetryAt`, and set `FAILED` after N attempts.
  - Show the status in the SMS activity log.
- **Effort:** M.

### INF-10. Cron runner correctness and scale problems
- **Severity:** High. **Status:** CONFIRMED (static). The crash loop is SUSPECTED.
- **Location:** `src/lib/jobs/cron-runner.ts:61-90,91,253,317-336,414-466,541`.
- **Evidence:**
  - For every budget, the runner loads **all** of the user's transactions (line 61) and allocates a new `serverSeq` for every month on every tick (line 91). That's O(budgets × transactions) work per tick, and the seq bumps force clients to re-pull every snapshot each time.
  - The FD payout writes `transaction.create` (434) and then `fixedDepositPayout.create` (455) without a transaction. If the second write fails, the next tick finds no payout and re-creates the transaction with the same deterministic id. That hits a unique violation, and `runCronTick` throws on every later tick. All later jobs, other FDs and reminders stop until someone fixes the data by hand.
  - There's no per-job isolation, so one failing budget aborts everything after it.
  - The budget code uses `Asia/Colombo` everywhere (line 17) rather than `User.timezone`. In the codebase as a whole, `Asia/Colombo` appears 14 times across 7 files.
  - `cycleStartDate` (line 253) uses the server-local `getFullYear()`/`getMonth()`.
  - The "Investment Yield" category and the payout share one `nextSeq`.
  - There's no lock against concurrent ticks and no job-run history.
- **Fix:**
  - Scope queries by category and month.
  - Upsert snapshots only when values change.
  - Wrap each period's writes in `$transaction`.
  - Use try/catch per job and per entity, with a `JobRun` table.
  - Take `pg_try_advisory_lock`.
  - Compute boundaries in each user's timezone.
- **Effort:** M-L.

### INF-11. Service worker: offline cold start relies on the browser HTTP cache, the asset "priming" is dead code, and the update prompt can't appear
- **Severity:** High (the product is mainly used as a mobile PWA). **Status:** cache mismatch and early return CONFIRMED (static). The user-visible offline failure is SUSPECTED, mainly on iOS where the HTTP cache is evicted aggressively.
- **Location:** `public/sw.js:2,14,59-66`, `src/components/pwa-manager.tsx:31,80-100`.
- **Evidence:**
  - The fetch handler `return`s early for `/_next/*`, so JS and CSS chunks are never served from Cache Storage.
  - `pwa-manager.tsx` writes those chunks into a cache named **`hardmoney-v4`**, but the SW's version is **`hardmoney-v5`**. The SW never reads that cache, and its `activate` handler deletes every non-current cache on the next update.
  - The install handler calls `self.skipWaiting()` unconditionally, so a waiting worker never exists. The "New version available" banner (`pwa-update-banner`) can only appear through the test hook `__hardMoneyTriggerUpdatePrompt`.
  - The SW is registered only in production, while E2E runs `next dev` with SWs blocked (INF-16). None of this is exercised.
- **Impact:** after the browser evicts its HTTP cache, launching from the Home Screen offline shows HTML whose scripts fail to load, so the app is dead. PRD §6 says "works fully offline from cold start".
- **Fix:**
  - Adopt Serwist (`@serwist/next`, per the PRD) with a revisioned precache of the build manifest. At minimum, add cache-first handling for `/_next/static/*` in `hardmoney-v5` and delete the priming code.
  - Remove the auto `skipWaiting`, and post `SKIP_WAITING` only from the banner.
- **Effort:** M.

### INF-12. The shipped Apple Shortcut is an unsigned XML plist with a placeholder URL
- **Severity:** High. It blocks onboarding for the SMS pipeline, which is feature #6. **Status:** file format and placeholder CONFIRMED. The iOS import failure is SUSPECTED.
- **Location:** `public/HardMoney_SMS_Ingress.shortcut` (1,491 bytes), `src/app/more/shortcuts/page.tsx`.
- **Evidence:**
  - `file` reports "XML 1.0 document text". The only URL inside is `https://your-domain.com/api/v1/webhooks/sms-ingress`.
  - Since iOS 15, the Shortcuts app imports only signed `.shortcut` files or iCloud links.
- **Fix:**
  - Publish an iCloud Shortcut link with Import Questions for the URL and API key, and link it from the guide.
  - Alternatively, serve a per-instance file with `APP_URL` filled in, signed with `shortcuts sign` on macOS during release.
- **Effort:** M.

### INF-13. Postgres is published on all interfaces with default credentials
- **Severity:** High. **Status:** CONFIRMED.
- **Location:** `docker-compose.yml:7-11,15`.
- **Evidence:**
  - `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}` together with `ports: "5432:5432"` binds `0.0.0.0`.
  - The healthcheck hard-codes `pg_isready -U postgres`, so it breaks when `POSTGRES_USER` is changed.
  - The `web` default `DATABASE_URL` also embeds `postgres:postgres`.
- **Fix:**
  - Drop the port mapping, or bind to `127.0.0.1:5432:5432`.
  - Use `${POSTGRES_PASSWORD:?required}` and `pg_isready -U $${POSTGRES_USER}`.
- **Effort:** S.

### INF-14. No README or self-hosting docs
- **Severity:** High. **Status:** CONFIRMED (no `README.md` in the repo root listing).
- **Evidence:** PRD §1 says "A README must cover first-run, backup (`pg_dump`) and upgrades". PRD §6 and PLAN Step 21 say the same.
- **Impact:** operators have no instructions for any of the following:
  - generating `AUTH_SECRET` and `APP_ENCRYPTION_KEY`
  - running migrations
  - setting up cron (INF-02)
  - putting the app behind HTTPS, which secure cookies need (INF-27)
  - backup and restore
  - setting up the Apple Shortcut
  - the Gemini privacy disclosure
- **Fix:** write the README and a `docs/self-hosting.md` with an upgrade checklist.
- **Effort:** M.

### INF-15. No CI pipeline
- **Severity:** High. **Status:** CONFIRMED (no `.github/`).
- **Evidence:**
  - PLAN Step 0 requires "lint → typecheck → vitest → playwright (web, mobile) → upload traces".
  - Lint has been red in both audit runs, and nothing gates merges.
  - PLAN's Definition of Done ("Full earlier suite still green") can't be shown for any step.
- **Fix:** add a GitHub Actions workflow with a Postgres service: install `--frozen-lockfile`, then lint, `tsc --noEmit`, vitest, `prisma migrate deploy`, `next build`, Playwright `web` and `mobile` (sharded), and upload traces.
- **Effort:** M.

### INF-16. E2E runs on `next dev` with service workers blocked, and the PWA offline tests from PLAN are missing
- **Severity:** High. **Status:** CONFIRMED.
- **Location:** `playwright.config.ts:15,45-54`, `tests/e2e/s20-pwa.spec.ts` (6 tests).
- **Evidence:**
  - PLAN A.1 says the app is tested against a production build (`next build && next start`) because offline and PWA behavior needs the real service worker.
  - The config instead runs `npx next dev` with `serviceWorkers: "block"` and `reuseExistingServer: true` (even on CI).
  - An automated diff of IDs (PLAN 261, implemented 247) shows these missing: **S18-12, S18-13, S20-01, S20-02, S20-04, S20-10, S21-01 to S21-13**. That covers offline reload, offline tab navigation, the update flow, WebKit offline smoke, export/import, the health page, the full axe sweep, performance, journeys and expired-session-offline.
  - Dev mode also hides build-only behavior. This audit's own build caught two such issues: the static VAPID route (INF-19) and the build-time secret requirement (INF-18).
- **Fix:**
  - Add a CI project that uses `pnpm build && pnpm start` with `reuseExistingServer: !process.env.CI`.
  - Add a dedicated PWA project with `serviceWorkers: "allow"`.
  - Implement S20-01, S20-02, S20-04, S20-10 and S21-12 first.
- **Effort:** M-L.

### INF-17. Unit and integration coverage misses the money-critical server code
- **Severity:** High. **Status:** CONFIRMED (test import map; no coverage provider installed).
- **Evidence:**
  - The 62 Vitest tests cover only pure helpers, the template parser and one ingestion path.
  - Nothing covers `cron-runner.ts`: catch-up, idempotency, day-31 clamping and the timezone boundary. PRD §6 explicitly calls for "Scheduler tests".
  - Nothing covers `sync/push` or `sync/pull`: idempotent retry, tombstones, role sanitization. PRD §6 calls for "Sync tests".
  - Nothing covers `worker.ts`, `auth.ts`, `authorization.ts`, `rate-limit.ts`, Dexie upgrades from v1 to v6, or encryption rotation (which would have caught INF-04).
  - There are no property-based tests (`fast-check`) for the invariants PRD §6 lists.
  - `vitest.config.mts` has no `coverage` block.
- **Fix:**
  - Add a Vitest integration project against a throwaway Postgres (Testcontainers) for the cron, sync and worker code.
  - Use `fake-indexeddb` for Dexie migration tests.
  - Add `fast-check` invariant tests.
  - Install `@vitest/coverage-v8` and set thresholds on `src/lib/finance-core` and `src/lib/jobs`.
- **Effort:** L.

### INF-18. `pnpm build` needs `AUTH_SECRET` at build time
- **Severity:** Medium. **Status:** CONFIRMED (the build fails without it and passes with a dummy value).
- **Location:** `src/lib/auth.ts:6-10` (top-level throw), `src/middleware.ts:4-8`.
- **Evidence:** `next build` sets `NODE_ENV=production` and evaluates route modules during "Collecting page data", so the module-level guard throws.
- **Impact:**
  - A Docker or CI build either fails, or the real secret has to be supplied as a build arg, where it can end up in image layers.
  - The guard does its job at runtime. A placeholder at build time works, but nothing documents that.
- **Fix:**
  - Move the check into a lazily called `getAuthKey()`, or into `instrumentation.ts` `register()`, so it runs at server start rather than at module evaluation.
  - Alternatively, skip the check when `process.env.NEXT_PHASE === "phase-production-build"`.
  - Validate all env once with zod in `src/lib/env.ts`.
- **Effort:** S.

### INF-19. The VAPID public-key route is prerendered static and serves a hard-coded sample key
- **Severity:** Medium. Push is fake anyway (INF-06), but this blocks the fix. **Status:** CONFIRMED.
- **Location:** `src/app/api/push/vapid-public-key/route.ts:3-8`.
- **Evidence:**
  - The build marks `○ /api/push/vapid-public-key`.
  - `.next/server/app/api/push/vapid-public-key.body` contains `{"publicKey":"BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkws6Z35FUVqWp5kxIFgqyTQ2962W1ZOfWDUED850="}`, which is the widely published web-push demo key.
  - With `cacheComponents`, a GET handler that reads no request data is prerendered, so the runtime `VAPID_PUBLIC_KEY` is ignored.
- **Fix:** call `await connection()` (from `next/server`) before reading env, return 503 when the key is unset, and remove the fallback key.
- **Effort:** S.

### INF-20. Lint gate is red: 142 errors, including 2 React Compiler bail-outs
- **Severity:** Medium. **Status:** CONFIRMED (`pnpm lint`).
- **Evidence:**
  - See §0 for the breakdown.
  - The two `set-state-in-effect` errors (`sms-activity/page.tsx:51`, `loan-detail-modal.tsx:97`) are flagged by the React Compiler rules.
  - The 139 `any` casts are concentrated in money-critical code: `sync/push` 18, `cron-runner` 10, `sms/worker` 10, `sms/ingestion` 9, `loans/*` 17. Most are `(prisma as any).model`, which isn't needed because those models exist in the generated client.
- **Fix:**
  - Remove the `as any` casts.
  - Replace effect-driven fetches with React Query or derived state.
  - Run `eslint --max-warnings=0` in CI.
- **Effort:** M.

### INF-21. Health endpoint checks nothing
- **Severity:** Medium. **Status:** CONFIRMED.
- **Location:** `src/app/api/health/route.ts:4-11`, `docker-compose.yml` (no `web` healthcheck), `playwright.config.ts:47` (uses it as the readiness URL).
- **Evidence:** it returns `ok` with no `SELECT 1`, no sequence check, no last-cron-run age and no `PENDING` SMS count.
- **Fix:**
  - Split it into `/api/health/live` (process up) and `/api/health/ready` (DB reachable, last tick less than 2× the interval old, SMS backlog under a threshold), returning 503 when not ready.
  - Show the details on a session-protected "System health" page (PRD §6).
- **Effort:** S-M.

### INF-22. No security headers; `sw.js` served without no-cache headers
- **Severity:** Medium. **Status:** CONFIRMED (`next.config.ts` has no `headers()`).
- **Evidence:** the local Next PWA guide (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:616-650`) recommends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js`. None of these are set. There's no CSP or HSTS, and `X-Powered-By` is exposed.
- **Impact:** clickjacking is possible on a finance app, and SW updates can be delayed by intermediary caches.
- **Fix:**
  - Add `headers()` per the guide plus CSP and HSTS.
  - Set `poweredByHeader: false`.
- **Effort:** S-M (the CSP needs tuning).

### INF-23. No structured logging, error reporting or job history
- **Severity:** Medium. **Status:** CONFIRMED.
- **Evidence:**
  - Ad-hoc `console.*` calls: 19 in the ingress route and about 20 elsewhere.
  - No `instrumentation.ts` (`onRequestError`), no request IDs, no log levels, no Sentry/OTel and no `JobRun` table.
  - PRD §6 requires structured logs, job run history and a System health page.
- **Fix:**
  - Add `pino` with a redaction list (it also covers INF-03).
  - Add `instrumentation.ts` with `onRequestError`.
  - Add a `JobRun` table written by `runCronTick`.
- **Effort:** M.

### INF-24. `.env.example` and compose env don't match what the code reads
- **Severity:** Medium. **Status:** CONFIRMED (`grep process.env` against `.env.example` and `docker-compose.yml`).
- **Evidence:**
  - Documented but unused: `APP_URL`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TZ` (the code hard-codes `Asia/Colombo`).
  - Read but undocumented: `E2E_SECRET`, `APP_ENCRYPTION_KEYS` (the rotation format), and the `POSTGRES_USER`/`PASSWORD`/`DB` variables that compose uses.
  - Unsafe example value: `GEMINI_PROVIDER="mock"` (INF-05).
  - Compose doesn't forward `VAPID_*`, `GEMINI_PROVIDER`, `APP_ENCRYPTION_KEYS` or `E2E_SECRET`.
  - No comments explain how to generate the values (`openssl rand -hex 32`, `npx web-push generate-vapid-keys`).
- **Fix:**
  - Rewrite `.env.example` as production-safe placeholders with generation instructions.
  - Move the test values to `.env.test.example`.
  - Validate with zod at boot.
- **Effort:** S.

### INF-25. Migration history was squashed after the fact, and there are no DB scripts
- **Severity:** Medium. **Status:** CONFIRMED (`git show --stat 8486714`).
- **Evidence:**
  - Commit `8486714` (2026-10-23) deleted earlier migration files and created a new 688-line `20261023054607_init`.
  - Any database migrated under the old history now has a `_prisma_migrations` table that doesn't match the repo, so `prisma migrate deploy` fails or needs a manual baseline.
  - `package.json` has no `db:migrate`, `db:generate` or `db:seed` scripts.
  - The sequence is missing from the migrations (INF-08).
- **Fix:**
  - Document a one-time baseline (`prisma migrate resolve --applied 20261023054607_init`) for existing installs.
  - From now on, never rewrite applied migrations.
  - Add the DB scripts.
- **Effort:** S.

### INF-26. Rate limiters are in-memory, spoofable and unbounded, and the webhook key lookup isn't indexed
- **Severity:** Medium. **Status:** CONFIRMED (static).
- **Location:** `src/lib/rate-limit.ts:1-12`, `src/app/api/auth/login/route.ts:28`, `src/app/api/auth/register/route.ts:36`, `src/app/api/v1/webhooks/sms-ingress/route.ts:8-10,46-72`, `prisma/schema.prisma:19` (`apiKeyHash String?`, no `@unique` or index).
- **Evidence:**
  - The login and register limiters key on the first `x-forwarded-for` value. Without a trusted proxy, that's client-controlled, so attackers can rotate it.
  - The `Map`s are never evicted, are per process and reset on restart.
  - The webhook checks its limiter only after a successful key lookup. Invalid keys are never throttled, and each attempt is an unindexed `findFirst` on `User`.
  - Dedupe is check-then-insert, so a concurrent duplicate hits the unique constraint and returns 500 instead of `DUPLICATE`.
- **Fix:**
  - Add `@unique` on `apiKeyHash`.
  - Add a per-IP limiter for failed auth.
  - Trust XFF only when a `TRUST_PROXY` env var is set.
  - Use an LRU or Postgres-backed limiter.
  - Catch `P2002` and return `DUPLICATE`.
- **Effort:** S-M.

### INF-27. Plain-HTTP self-hosting breaks login silently
- **Severity:** Medium. **Status:** SUSPECTED (needs a LAN test).
- **Location:** `src/app/api/auth/login/route.ts:80` (`secure: process.env.NODE_ENV === "production"`), `docker-compose.yml:37` (`NODE_ENV: production`), `.env.example:5` (`APP_URL="http://localhost:3000"`).
- **Evidence:** a self-hoster who opens `http://192.168.x.x:3000` from a phone gets a `Secure` cookie that the browser drops, so every request after login is 401.
- **Impact:** a confusing first-run failure. Service workers and push also need HTTPS outside localhost.
- **Fix:**
  - Document HTTPS behind a reverse proxy (Caddy/Traefik) in the README.
  - Detect `x-forwarded-proto` or `APP_URL` to decide on `secure`.
  - Log a startup warning when `APP_URL` is `http://` with a non-localhost host.
- **Effort:** S.

### INF-28. Initial sync pull is unbounded
- **Severity:** Medium. **Status:** CONFIRMED (static: no `take` in `src/app/api/sync/pull/route.ts`). The performance impact is SUSPECTED.
- **Evidence:** about 12 `findMany({ serverSeq: { gt: cursor } })` queries without limits, returned in one JSON body.
- **Impact:** a slow or failed first sync on mobile networks, and high memory use on the server.
- **Fix:** paginate with a `limit`, return `nextCursor`, and loop on the client. This shares the fix with INF-08.
- **Effort:** M.

### INF-29. Logout ignores the outbox and leaves local data and caches behind
- **Severity:** Medium. **Status:** CONFIRMED (static).
- **Location:** `src/app/more/page.tsx:47-59`.
- **Evidence:**
  - Logout clears the React Query cache and the `hardmoney_active_user` localStorage key, then navigates away.
  - It never checks `outbox` for pending mutations, as PRD §1 requires ("logging out with a non-empty outbox requires explicit confirmation").
  - It doesn't clear SW caches, which hold user-visited HTML.
- **Impact:** offline-entered transactions can be stranded if a different user signs in on the device. A shared device keeps the previous user's cached shell.
- **Fix:** count pending outbox rows, and if any exist, show a confirm dialog offering "Sync now" or "Log out anyway". Clear SW caches on logout.
- **Effort:** S.

### INF-30. Playwright runs `fullyParallel` while every test truncates the shared database
- **Severity:** Medium. **Status:** config CONFIRMED; flakiness SUSPECTED.
- **Location:** `playwright.config.ts:5-6`, `src/app/api/test/[...slug]/route.ts:54-56` (`TRUNCATE ... CASCADE`).
- **Evidence:** with `workers: 2` on CI, one worker's reset wipes the other's data mid-test. The server clock, Gemini queue, push outbox and rate limiters are also process-global.
- **Fix:** use `workers: 1` until tests are isolated, or give each worker its own schema and server.
- **Effort:** M.

### INF-31. `middleware.ts` uses a convention deprecated in Next 16
- **Severity:** Low. **Status:** CONFIRMED (build warning; `docs/01-app/02-guides/upgrading/version-16.md:596-621`).
- **Fix:** `npx @next/codemod@canary middleware-to-proxy .`. That renames the file to `src/proxy.ts` and the export to `proxy`. Proxy runs on Node, which is fine for `jose`.
- **Effort:** S.

### INF-32. A cron secret containing multibyte characters causes an uncaught 500
- **Severity:** Low. **Status:** CONFIRMED (node reproduction).
- **Location:** `src/app/api/v1/cron/tick/route.ts:14-15`.
- **Evidence:** the code compares string lengths and then calls `timingSafeEqual` on byte buffers. With `"ébc"` against `"abc"`, the string lengths are equal and the call throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` outside the try block.
- **Fix:** compare `sha256(provided)` with `sha256(expected)` using `timingSafeEqual`.
- **Effort:** S.

### INF-33. Dead code and dead CSS
- **Severity:** Low. **Status:** CONFIRMED.
- **Evidence:**
  - `src/lib/db/dexie.ts` defines a second Dexie DB (`hardmoney-<userId>`, v1) that nothing imports. The real DB is `hardmoney_<userId>` in `src/lib/db/index.ts`, at v6.
  - `animate-in fade-in slide-in-from-*` classes are used in 7 files, but no animation plugin is installed. The built CSS (`.next/static/chunks/*.css`) has 0 matches for `animate-in` or `slide-in-from`, so those entrance animations never run.
  - `/api/users/search` has no caller in `src/`.
- **Fix:** delete `dexie.ts` and the unused route. Either add `tw-animate-css` or remove the classes.
- **Effort:** S.

### INF-34. Default push target `/transactions` is not a route
- **Severity:** Low. **Status:** CONFIRMED (the build route list has no `/transactions`).
- **Location:** `public/sw.js:130,146,157`.
- **Fix:** use `/`, or the URL from the payload only.
- **Effort:** S.

### INF-35. Dependency and engine hygiene
- **Severity:** Low. **Status:** CONFIRMED.
- **Evidence:**
  - No `engines` field or `.nvmrc`. `@types/node ^20` doesn't match Node 24.
  - `@prisma/client ^6.19.3` is a range while `prisma 6.19.3` is exact, and the two must stay in lockstep.
  - `pnpm-workspace.yaml` allow-lists `workerd`, which has 0 matches in `pnpm-lock.yaml`.
  - The editor artifact `.antigravity/extensions.json` is tracked in git.
  - `playwright.config.ts` uses `npx` instead of `pnpm exec`.
  - There's no `typecheck` script.
- **Fix:** add `engines` and `.nvmrc`, pin `@prisma/client`, drop `workerd`, gitignore `.antigravity/`, and add `"typecheck": "tsc --noEmit"`.
- **Effort:** S.

### INF-36. Reduced-motion support covers view transitions only
- **Severity:** Low. It's an accessibility issue, which matters more for a mobile PWA. **Status:** CONFIRMED (static).
- **Location:** `src/app/globals.css:322-328`, `src/components/pwa-manager.tsx:156`.
- **Evidence:**
  - The `prefers-reduced-motion` block disables only `::view-transition-*` animations. Tailwind `transition-*`, `active:scale-95` and `animate-spin` stay on.
  - The update button's icon spins forever (`animate-spin`) even though nothing is loading.
- **Fix:** add a global reduced-motion rule (`*, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }`) and only spin the icon while reloading.
- **Effort:** S.

### INF-37. Webhook E2E tests still always send the browser session cookie
- **Severity:** Low (the earlier middleware bug is fixed, but there's no regression guard). **Status:** CONFIRMED.
- **Evidence:**
  - `tests/e2e/s14-sms-ingress.spec.ts` makes 44 `page.request.post` calls, all after registering.
  - `s14`, `s15` and `s16` use `request.newContext` 0 times.
  - The autoAuth fixture (`tests/e2e/fixtures.ts:14-35`) injects a session cookie into every context.
- **Fix:** add one cookie-less test through `playwright.request.newContext()`, the way an Apple Shortcut would call the webhook.
- **Effort:** S.

---

## 3. PRD / PLAN gap table

**Legend**
- **Done:** implemented roughly to spec.
- **Partial:** implemented with gaps.
- **Diverges:** a different approach than the spec.
- **Missing:** not built.
- **Broken:** built but doesn't work in production.
- **Stub:** fake or placeholder.
- **Extra:** built but not in the spec.

My area is infra, so domain internals (CC, FD and loan math, UI detail) were spot-checked by grep and file reads. Rows that I didn't verify in depth say so in the notes.

### 3.1 Architecture, stack and deployment (PRD §1, PLAN Step 0)

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Next.js App Router + TypeScript | PRD §1 | Next 16.4.3, React 19.3, React Compiler, Cache Components | Done | `middleware` convention is deprecated (INF-31). |
| tRPC for internal data and sync, with superjson | PRD §1 | REST route handlers (47 API routes) + axios + React Query | Diverges | No bigint transport (relevant to INF-07). Record the decision as an ADR. |
| Shared `packages/finance-core` (pure, no I/O) | PRD §1, PLAN Step 0 | `src/lib/finance-core/*` inside the app | Partial | Pure and shared by client and server; just not a separate package. |
| Monorepo `apps/web`, `apps/worker` | PLAN Step 0 | Single app | Missing | |
| Tailwind + Radix/shadcn + Lucide | PRD §1 | Tailwind v4 + Lucide; custom components | Partial | No Radix/shadcn, so accessible primitives (dialog focus traps etc.) are hand-rolled. |
| Dexie IndexedDB + outbox queue | PRD §1, §2.6 | `src/lib/db/index.ts` (v1-v6) + `src/lib/sync/client.ts` | Done | A second, dead Dexie module also exists (INF-33). |
| Dexie numbered migrations, with tests | PRD §1, §6 | 6 versions | Partial | No migration tests (INF-17). |
| pg-boss worker process/container | PRD §1, PLAN Step 11 | None | Missing | INF-02. |
| `POST /api/v1/cron/tick` protected by `CRON_SECRET` | PRD §1 | Yes; 503 if unset; timing-safe compare | Done | Nothing schedules it (INF-02). Multibyte edge case (INF-32). |
| Advisory-lock catch-up on auth/sync | PRD §2.7 | None | Missing | |
| Serwist/Workbox service worker | PRD §1, PLAN Step 20 | Hand-written `public/sw.js` | Diverges | No build-asset precache; update flow unreachable (INF-11). |
| Web App Manifest (standalone) | PRD §1 | `public/manifest.json` | Done | No `id`/`scope`/`screenshots`; `theme_color` dark only. |
| Web Push (VAPID) daily reminders | PRD §1, PLAN Step 20 | Mock subscription, in-memory outbox, no sender | Stub | INF-06, INF-19. |
| iOS "install to Home Screen" caveat | PRD §1 | `src/app/more/preferences/page.tsx:463-474` | Done | |
| `@google/genai` + Zod Structured Outputs | PRD §1 | Raw REST `fetch`; Zod parse afterwards | Partial | No `responseSchema`; key in URL (INF-05). |
| Gemini model configurable, default `gemini-2.5-flash` | PRD §1 | `gemini-settings` route + developer page | Done | |
| Auth.js; Credentials + Argon2id | PRD §1 | Custom jose JWT (7 d) + Argon2id + `sessionVersion` | Diverges | Works. Password minimum is 6 characters. |
| Optional OAuth providers | PRD §1 | None | Missing | |
| `ALLOW_REGISTRATION` flag | PRD §1 | `register/page.tsx:12`, `api/auth/register/route.ts:26` | Done | |
| Offline session: expiry pauses sync only | PRD §1 | Sync client handles 401; middleware redirects online navigations | Partial | Not verified end to end; S21-12 missing. |
| Per-user namespaced local DB | PRD §1, Subsystem 6 | `hardmoney_<userId>` | Done | |
| Logout with non-empty outbox needs confirmation | PRD §1 | None | Missing | INF-29. |
| Gemini key encrypted per user (AES-256-GCM) | PRD §1, §6 | `src/lib/encryption.ts` | Partial | Rotation is broken (INF-04). |
| Webhook key shown once, hash stored | PRD §1 | `api/user/webhook-key` + developer page | Done | PRD wants prefix lookup; the code does a full-hash lookup with no index (INF-26). |
| Settings: timezone, currency, withholding default, auto-post mode, reminder time | PRD §1, §5.1 | Preferences and developer pages | Partial | Timezone is stored, but the jobs and most UI use `Asia/Colombo`. |
| Docker Compose `web` + `worker` + `postgres` | PRD §1 | Compose with a missing Dockerfile, no worker | Broken | INF-01, INF-13. |
| Required env validated (`DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `APP_URL`, VAPID) | PRD §1 | Fail-fast for `AUTH_SECRET` and the encryption key only | Partial | `APP_URL` and VAPID private key unused; build-time coupling (INF-18, INF-24). |
| README: first run, backup, upgrades | PRD §1, §6 | None | Missing | INF-14. |
| CI pipeline | PLAN Step 0 | None | Missing | INF-15. |
| Test API gated by `E2E_MODE` | PLAN A.2 | Plus `NODE_ENV` and an `E2E_SECRET` header | Done | Fixed since run 1. |

### 3.2 Cross-cutting conventions (PRD §2)

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Integer minor units in code | §2.1 | Yes | Done | |
| Postgres `BIGINT` for money | §2.1 | `INTEGER` (int4) | Diverges | High risk (INF-07). |
| Rates in basis points | §2.1 | `*Bps` fields | Done | |
| Half-up rounding; final period absorbs remainder | §2.1 | finance-core with golden-vector tests | Done | Spot-checked (unit tests pass). |
| Single currency in v1, no FX | §2.1, §8 | `Account.currency`, `Transaction.destinationAmountMinor`, `exchangeRateMicros` (migration `20261023062609`) | Diverges | FX scope added beyond v1. Make sure stats and budgets handle mixed currencies (domain audit). |
| Calendar dates in the user's timezone | §2.2 | `Asia/Colombo` hard-coded (14 occurrences in 7 files) | Partial | Wrong for non-Colombo users (INF-10). |
| Date-only fields as `DATE` | §2.2 | `DateTime` | Diverges | Spot-checked. |
| Short-month clamping | §2.2 | `addMonthsClamped`, `getEffectiveDayOfMonth` | Done | Spot-checked. |
| Ledger-derived balances; caches not authoritative | §2.3 | `ledger.ts`; `balanceCacheMinor` | Done | |
| Flag semantics (`excludeFromBalance/Stats/Budget`) | §2.4 | Present throughout | Done | Spot-checked. |
| Soft deletes with tombstones | §2.5 | `deletedAt` | Done | |
| `serverSeq` from one Postgres sequence on every write | §2.6 | Runtime-created sequence + fallback; no transactions | Partial | INF-08. |
| Push idempotent by `mutationId`, per-mutation auth | §2.6 | `AppliedMutation` check + role checks | Partial | Not atomic (INF-08). |
| Pull by cursor incl. tombstones + role sanitization | §2.6, Subsystem 6 | `sync/pull` with contributor filtering (lines 25-235) | Partial | Unpaginated (INF-28). |
| Deterministic UUIDv5 system IDs | §2.7 | uuidv5 for FD/loan; `snap_`/`stmt_`/`inst_` strings elsewhere | Partial | Deterministic but not UUIDv5. |
| `BankSms.dedupeKey` = sha256(user+sender+receivedAt+raw) | §2.7 | Yes | Done | `receivedAt` not normalized; race returns 500 (INF-26). |
| Catch-up style jobs | §2.7 | Catch-up loops exist in `cron-runner` | Partial | Logic exists, never scheduled (INF-02). |

### 3.3 Subsystem 1: Bank SMS pipeline

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Webhook reachable without a session, `x-api-key` auth | Step 1 | `/api/v1/webhooks` is in `PUBLIC_PATHS` | Done | Fixed since run 1 (INF-37 for the test guard). |
| Zod payload validation (max length, ISO timestamp) | Step 1 | `IngressPayloadSchema` | Done | |
| Per-key rate limit | Step 1 | In-memory, 5 per 10 s, checked after auth | Partial | INF-26. |
| Duplicate returns `200 DUPLICATE` | Step 1 | Yes | Done | Race returns 500 (INF-26). |
| 202 + durable queue with retry/backoff | Step 1 | 202 + `setTimeout`; no retry | Partial | INF-09. |
| Raw SMS never logged | §6 | Logged in full outside E2E | Broken | INF-03. |
| Template parser registry + per-bank corpus | Step 2 | `template-parser.ts`, 18 unit tests, real-world S14-14..18 | Done | Corpus is inline samples; grow it from real messages. |
| Gemini fallback only when no template and a key exists | Step 2 | `worker.ts` | Done | `.env.example` sets mock (INF-05). |
| Mask account numbers beyond last 4 before Gemini | Step 2 | `mask-numbers.ts` (3 tests) | Done | Raw text still kept in memory (INF-05). |
| Validation gate | Step 2 | `worker.ts` `VALIDATION_FAILED` paths | Done | Spot-checked. |
| Posting policy `AUTO_VALIDATED` / `ALWAYS_REVIEW_GEMINI` | Step 2 | `smsAutoPostMode` | Done | |
| Account resolution by sender + last4 | Step 3 | `account-matcher.ts` | Done | Spot-checked. |
| Two-way ±2 h dedupe with merge prompt | Step 3 | `possibleDuplicateOfTransactionId`, merge and dismiss routes | Done | Spot-checked. |
| Channel to ledger routing table | Step 3 | `ingestion.ts` | Done | Spot-checked. |
| ATM transfer to Cash + fee child + fee-SMS dedupe | Step 3 | `feeTransactionId`, ATM handling | Done | Spot-checked. |
| Refund links `reversalOfTransactionId` | Step 3 | Yes | Done | |
| Balance mismatch hint (no auto-adjust) | Step 3 | Accounts pages + ingestion | Done | |
| Review inbox: Post / Ignore / **Link to existing** / edit fields | §5.1 | Post, Ignore, Merge-transfer, Retry | Partial | No "Link to existing transaction" action. |
| SMS Activity log: raw viewer, parsed JSON, parse method, status filter | §5.1 | `/more/sms-activity` | Done | |
| Inter-account transfer SMS auto-merge | not in PRD | `merge-transfer` route, S14-17/18 | Extra | |
| Apple Shortcuts guide + downloadable template | §1, §5.1 | Guide page + unsigned XML `.shortcut` | Broken | INF-12. |
| Settings disclosure that SMS goes to Google | §6 | Text on developer/preferences pages | Done | Spot-checked. |

### 3.4 Subsystem 2: Credit cards and 0% installments

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Statement cycle: billed/unbilled, FIFO, available credit | 2.1 | `finance-core/credit-card.ts` (6 unit tests) | Done | |
| Statement snapshots written by scheduler | 2.1 | `cron-runner.ts` §2 | Partial | Never scheduled (INF-02). |
| Installment onboarding / brand-new / convert-from-swipe | 2.2 | `installment-plan-modal.tsx`, convert in `transaction-edit-modal.tsx` | Done | Spot-checked. |
| Processing fee posting | 2.2 | `processingFee` handling | Done | Spot-checked. |
| Blocked principal and credit-limit blocking | 2.2 | `use-account-portfolio.ts`, accounts pages | Done | |
| Scheduler injects installments (catch-up, deterministic) | 2.2 | `cron-runner.ts:287-360` | Partial | Never scheduled; not UUIDv5. |
| Cancel plan restores original swipe | 2.2 | `CANCELLED` present | Not verified | Domain audit. |
| Early payoff (`CC_INSTALLMENT_PAYOFF` + optional fee) | 2.2 | `early-payoff-modal.tsx` | Done | |
| 1-tap settlement (Full due / Total / Custom), FIFO | 2.3 | `settle-modal.tsx` | Done | |
| Due-date countdown | §5.0 | Accounts pages | Done | |

### 3.5 Subsystems 3-5 and 7: entry, budgets, FDs, loans, calibration

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Embedded arithmetic keypad, safe parser (no `eval`), OS keyboard suppressed | S3 | `calculator.ts` (5 tests), `inputMode="none"` | Done | |
| Split transactions (sum must equal total) | S3 | `isSplit` + split items | Done | |
| Bookmark template chips on entry sheet | S3 | `quick-add-modal.tsx`, `mobile-quick-add.tsx` | Done | |
| Budget spent / available / safe-to-spend daily | S4 | `finance-core/budget.ts`, budget page | Done | |
| Symmetric rollover (surplus and deficit) | S4 | `cron-runner.ts` + budget card chip | Partial | Snapshots are only produced by the unscheduled cron; closed months are rewritten each tick (INF-10). |
| FD `REINVEST_COMPOUND` and `MONTHLY_PAYOUT_TO_ACCOUNT` | S5.1 | `investments.ts` with golden vectors | Done | |
| FD placement posting, monthly payouts by scheduler | S5.1 | Sync push + `cron-runner.ts:396-467` | Partial | Payouts unscheduled; non-atomic (INF-10). |
| FD maturity proceeds (1-tap) and premature closure | S5.1 | `deposit-proceeds`, `close` routes, `fd-close-modal.tsx` | Done | |
| Per-FD withholding tax with user default | S5.1 | `withholdingTaxRateBps`, user default in preferences | Done | |
| Loan schedules (reducing / flat), stored entries | S5.2 | `finance-core/loans.ts` with golden vectors | Done | |
| EMI auto-split, Extra Principal, schedule `OVERRIDDEN` edits | S5.2 | `pay-emi`, `schedule/[entryId]` routes | Done | Spot-checked. |
| Loan disbursement posting; leases as `kind = LEASE` | S5.2 | `LOAN_DISBURSEMENT`, `LEASE` | Done | Screenshot shows a 9.8M disbursement, near the int4 limit (INF-07). |
| "Interest paid" report | S5.2 | Inside `loan-detail-modal.tsx` only | Partial | No cross-loan report. |
| Calibration sheet, `ADJUSTMENT` with `+`/`-` badge | S7 | `calibration-modal.tsx` | Done | |

### 3.6 Subsystem 6 and households

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Roles OWNER / CO_OWNER / CONTRIBUTOR_ADD_ONLY / VIEWER | §3.A | Household routes + page | Done | |
| Email-search add, leave/remove, transfer ownership | §5.1, §8 | `/more/household`, `transfer-ownership` route | Done | `/api/users/search` unused (INF-33). |
| Contributor sanitization (no balances, own txns only) | S6.4 | `sync/pull/route.ts:25-235` | Done | Spot-checked. |
| Revoked members' local data purged on next pull | S6.4 | Not traced | Not verified | Domain/backend audit. |
| Shared household shopping list | not in PRD | `/more/shopping-list`, Dexie v6 | Extra | |

### 3.7 UI/UX spec (PRD §5)

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Design tokens, light/dark, follow system | §5.0 | CSS variables + theme script (`layout.tsx:53`) | Done | |
| Swap income/expense colors | §5.0 | `hardmoney-color-swap` | Done | |
| Mobile bottom nav: Trans., Stats, Budget, Accounts, More | §5.1 | `bottom-nav.tsx` (screenshot `image.png`) | Done | |
| FAB + Quick-Add bottom sheet (type switch, Save, Continue) | §5.0 #8 | `fab.tsx`, `quick-add-modal.tsx` | Done | Spot-checked. |
| Trans. views Daily / Calendar / Monthly / Summary | §5.0 #2 | 4 view components | Done | |
| Default start view configurable | §5.0 #2 | None found | Missing | |
| Month switcher with swipe | §5.0 #1 | `month-switcher.tsx` touch handlers | Done | |
| Top bar Search / Bookmarks / Filter icons | §5.0 #3 | Full-width search field + Filter button (screenshots) | Partial | Layout differs from spec; no Bookmarks icon in bar. |
| Stats: donut + ranked list + Trend (weekly/monthly/yearly) | §5.0 #4 | Donut + list; trend present | Partial | No weekly/yearly comparison found. |
| Budget tab: progress bars, warning/over colors, safe-to-spend | §5.0 #5 | Budget page + cards | Done | |
| Accounts tab: net-worth header + grouped sections + subtotals | §5.0 #6 | `accounts/page.tsx` | Done | |
| More tab incl. Export/Import, System health | §5.0 #7 | Household, Shopping, Preferences, Categories, Bookmarks, Developer, Inbox, SMS Activity, Shortcuts | Partial | No Export/Import, no System health. |
| Desktop collapsible sidebar + Dashboard entry | §5.0 | Collapsible sidebar, 5 items + "New Transaction" | Partial | No Dashboard; `image-desktop.png` shows two add buttons (sidebar plus floating). |
| Desktop multi-card dashboard (net worth, safe-to-spend, cashflow + Adjustments, CC alerts, calendar, SMS log) | §5.1 | Desktop shows the Trans. list | Missing | |
| Respect `prefers-reduced-motion` | §5.0 | View transitions only | Partial | INF-36. |
| WCAG AA contrast in both themes on all screens | §5.0, §6 | Axe on the shell page only (S01-07) | Partial | S21-06 missing. |
| Keyboard-navigable desktop UI | §6 | S06-05 keyboard test exists | Partial | One view covered. |
| Text externalized for i18n | §6 | Inline strings | Missing | |

### 3.8 Non-functional requirements (PRD §6) and PLAN Step 21

| Feature | Spec'd | Implemented | Status | Notes |
| --- | --- | --- | --- | --- |
| Quick-add < 100 ms offline; dashboard from IndexedDB | §6 | Dexie-first data access | Not measured | S21-07 missing. |
| Full JSON export/import + CSV export | §6, Step 21 | None | Missing | Data sovereignty is a headline promise. |
| `pg_dump` backup/restore docs | §6 | None | Missing | INF-14. |
| Structured logs, job run history, System health page | §6 | None | Missing | INF-21, INF-23. |
| Webhook rate limiting, Zod on inputs, role checks | §6 | Present | Partial | In-memory limiter (INF-26). |
| Unit + property tests for finance-core | §6 | Unit golden vectors; no property tests | Partial | INF-17. |
| SMS parser fixtures + mocked Gemini tests | §6 | 18 unit tests + S14/S15 E2E | Done | |
| Sync tests (retries, tombstones, sanitization, Dexie upgrades) | §6 | E2E S03/S19 only | Partial | No unit/integration tests (INF-17). |
| Scheduler tests (catch-up, idempotency, day 31, timezone) | §6 | E2E S11 only | Partial | INF-17. |
| E2E against a production build with worker + Postgres | PLAN A.1 | `next dev`, SW blocked | Diverges | INF-16. |
| Visual snapshot tests | PLAN A.2 | 0 `toHaveScreenshot` | Missing | |

### 3.9 PLAN progress tracker against reality

PLAN marks Steps 0-20 ☑ and Step 21 ☐. Checked against each step's own **Build** list:

| Step | PLAN status | Reality |
| --- | --- | --- |
| 0 Repo, tooling & harness | ☑ | No monorepo, no worker, no CI, compose not buildable. |
| 11 Scheduler & rollover | ☑ | No worker or pg-boss, no advisory lock. The job only runs when called by hand. |
| 14 SMS ingress | ☑ | Works now. Raw SMS logged (INF-03); Shortcut not importable (INF-12). |
| 15 Gemini & inbox | ☑ | No Structured Outputs; "Link to existing" missing. |
| 18 Loans | ☑ | S18-12 and S18-13 not implemented. |
| 20 PWA & push | ☑ | No Serwist; S20-01/02/04/10 missing; push is a stub (INF-06). |
| 21 Export, health, hardening | ☐ | Nothing built; S21-01 to S21-13 missing. |

Because CI doesn't exist and lint is red, PLAN's own Definition of Done (A.4) can't be shown for any step.

---

## 4. Comparison with the earlier run (`audit/2026-10-20/infra-prd.md`, HEAD `f8e719a`)

### 4.1 Command results

| Check | Run 1 | Run 2 (now) | Change |
| --- | --- | --- | --- |
| `pnpm lint` | FAIL: 163 errors, 24 warnings (187 total) | FAIL: 142 errors, 15 warnings (157 total) | 21 fewer errors, 9 fewer warnings. `no-explicit-any` went from 155 to 139; React Compiler `set-state-in-effect` from 6 to 2; `preserve-manual-memoization` from 1 to 0; `no-location-assign` from 1 to 0. `prefer-const` at `calculator.ts:98` is still there. |
| `tsc --noEmit` | PASS | PASS | Unchanged. |
| `vitest run` | PASS: 6 files, 44 tests | PASS: 8 files, 62 tests | 18 new tests (`confirmation-modal`, `transfer-reconciliation`, more parser cases). |
| `pnpm build` (no env) | PASS | **FAIL**: `AUTH_SECRET` required at build time | Regression in build ergonomics. It's a side effect of the SEC-02 fix (INF-18). With a placeholder secret the build passes, with 46 static pages (was 43). |
| Middleware deprecation warning | Present | Present | Unchanged (INF-31). |
| VAPID route prerendered static | Present | Present (output body checked) | Unchanged (INF-19). |

### 4.2 Earlier findings: status now

| Earlier ID | Topic | Status now | Evidence |
| --- | --- | --- | --- |
| SEC-01 | `.env.example` `E2E_MODE=1` exposes test API | **Fixed** | `.env.example:12` is `"0"`; the test route also requires non-production `NODE_ENV` and the `x-e2e-secret` header (`route.ts:14-18`). |
| SEC-02 | `AUTH_SECRET` falls back to a public secret | **Fixed**, with a side effect | Throws in production (`auth.ts:8-10`); `padEnd` removed from app code (still in `tests/e2e/fixtures.ts:6`). Side effect: build-time requirement (INF-18). |
| SEC-03 | Encryption key falls back to a public key; no rotation | **Partly fixed** | Production now requires a key and a keyring exists. The rotation itself is broken (INF-04, reproduced). |
| SEC-04 | Default cron secret, logged, not constant-time | **Fixed** | 503 when unset, `timingSafeEqual`, no debug log, compose forwards it. Minor multibyte edge case (INF-32). |
| SEC-05 | Middleware blocked the SMS webhook | **Fixed** | `/api/v1/webhooks` is in `PUBLIC_PATHS` (`middleware.ts:20`). |
| SEC-06 | Postgres default credentials on 0.0.0.0 | **Still present** | INF-13. |
| SEC-07 | Login brute force, weak password, timing enumeration | **Partly fixed** | Login and register now rate-limited, and login verifies a dummy hash for unknown users. Limiter is spoofable and unbounded (INF-26); minimum password length still 6. |
| SEC-08 | Open redirect via `callbackUrl` | **Partly fixed** | Middleware validates with `/^\/(?![\/\\])/`. `login/page.tsx:13,24` still runs `router.push(callbackUrl)` unvalidated (backend audit's area). |
| SEC-09 | Middleware skips auth for any path with "." | **Fixed** | Replaced by an extension regex (`middleware.ts:33`). |
| SEC-10 | No security headers or CSP | **Still present** | INF-22. |
| SEC-11 | 30-day JWT, no revocation | **Fixed** | 7-day expiry plus `sessionVersion` check (`auth.ts:42-55`). |
| SEC-12 | Gemini raw SMS in memory, key in URL, no schema | **Still present** | INF-05; `.env.example` mock default also still there. |
| SEC-13 | Webhook limiter in memory, unindexed key hash, dedupe race | **Still present** | INF-26. |
| CFG-01 | No Dockerfile or worker; incomplete compose env | **Still present** (slightly better) | `CRON_SECRET` now forwarded. INF-01. |
| CFG-02 | No Prisma migrations | **Partly fixed** | 4 migrations now. Sequence still runtime-created; history was squashed (INF-25); no DB scripts. |
| CFG-03 | `serverSeq` fallback and non-atomic push | **Still present** | 0 `$transaction` in `sync/push`; fallback still in `server-seq.ts:39-45`. INF-08. |
| CFG-04 | VAPID route static with hard-coded key | **Still present** | INF-19. |
| CFG-05 | `.env.example` inconsistent | **Partly fixed** | E2E default fixed; the other drift remains (INF-24). |
| CFG-06 | `middleware.ts` deprecated | **Still present** | INF-31. |
| CFG-07 | Lint red | **Still present**, smaller | 163 → 142 errors (INF-20). |
| CFG-08 | Dependency and engine hygiene | **Still present** | Next bumped 16.4.0 → 16.4.3; `workerd` and `.antigravity` remain (INF-35). |
| CFG-09 | Money columns int4 | **Still present** | Now baked into the `init` migration (INF-07). |
| CFG-10 | Dead Dexie module | **Still present** | INF-33. |
| OPS-01 | Health checks nothing | **Still present** | INF-21. |
| OPS-02 | No scheduler | **Still present** | INF-02. |
| OPS-03 | SMS processing not durable | **Still present** | INF-09. |
| OPS-04 | Push never delivered | **Still present, and worse** | The client now fabricates a mock FCM subscription and shows "Reminders active" (INF-06). |
| OPS-05 | Cron scale and correctness | **Still present** | Plus a newly identified non-atomic FD payout crash loop (INF-10). |
| OPS-06 | No structured logging | **Still present, and worse** | The new verbose ingress logging leaks raw SMS (INF-03, INF-23). |
| OPS-07 | No standalone output | **Still present** | Folded into INF-01. |
| OPS-08 | No README | **Still present** | INF-14. |
| PWA-01 | SW doesn't cache `/_next/` | **Still present** | Plus newly identified: priming writes to the wrong cache name (INF-11). |
| PWA-02 | Auto `skipWaiting`; update flow untested | **Still present** | `sw.js:14` (INF-11). |
| PWA-03 | Cached authenticated HTML shared across users | **Still present** | Logout doesn't clear caches (INF-29). |
| PWA-04 | Shortcut download not usable | **Still present** (form changed) | The `/api/shortcuts/download` route was replaced by a static unsigned XML plist with a placeholder URL (INF-12). |
| TST-01 | No CI | **Still present** | INF-15. |
| TST-02 | E2E on `next dev`, SW blocked | **Still present** | INF-16. |
| TST-03 | `fullyParallel` with global truncation | **Still present** | INF-30. |
| TST-04 | Webhook tests use the session cookie | **Still present** (lower risk now) | INF-37. |
| TST-05 | Planned tests missing | **Still present** | Same 19 IDs missing; implemented IDs went 244 → 247 (S14-14..18 added beyond plan). |
| TST-06 | Unit coverage gaps | **Partly improved** | 44 → 62 tests, but no cron, sync, worker or Dexie tests (INF-17). |
| TST-07 | Test API in production bundle | **Mitigated** | Still compiled into the bundle (`ƒ /api/test/[...slug]`), but returns 404 whenever `NODE_ENV=production`. |

**Gap rows from run 1 that changed**
- GAP-31 (webhook reachable): Broken → Done.
- GAP-43 (reduced motion): Missing → Partial.
- GAP-12 (`ALLOW_REGISTRATION`): unchanged, Done.

The other run-1 gap rows carry over into §3.

**Tally**
- **Fixed:** 6 (SEC-01, 02, 04, 05, 09, 11).
- **Partly fixed or mitigated:** 7 (SEC-03, 07, 08; CFG-02, 05; TST-06, 07).
- **Still present:** 24 (OPS-04 and OPS-06 got worse).
- Run 1 had 37 findings in total.

### 4.3 New in this run (not found or not present in run 1)

| New finding | Why it's new |
| --- | --- |
| INF-03: raw SMS, key prefix and email in production logs | Introduced by commit `da48e4f` after run 1. |
| INF-04: key rotation corrupts new ciphertexts | The keyring code is new since run 1; reproduced here. |
| INF-06 (expanded): fabricated client push subscription | Run 1 saw only the server-side outbox. |
| INF-10 (expanded): FD payout written without a transaction | Missed in run 1. |
| INF-11 (expanded): `hardmoney-v4` vs `hardmoney-v5` cache mismatch | The cache version bumped since run 1. |
| INF-18: build fails without `AUTH_SECRET` | Side effect of the SEC-02 fix. |
| INF-25: migration history squashed | Commit `8486714`, after run 1. |
| INF-27: secure cookie on plain-HTTP LAN installs | Missed in run 1. |
| INF-28: unpaginated pull as its own finding | Run 1 mentioned it only inside CFG-03. |
| INF-29: logout ignores the outbox and caches | Run 1 had it as GAP-11. |
| INF-32: multibyte cron secret causes a 500 | New compare code. |
| INF-33 (partly new): `animate-in` classes generate no CSS | Checked against the built CSS. |
| INF-34: SW default URL `/transactions` | Missed in run 1. |
| INF-36: reduced-motion covers view transitions only | Missed in run 1. |
| Gap rows: FX/multi-currency divergence, shopping list (Extra), inter-account transfer merge (Extra), default start view missing | Product changes since run 1. |

### 4.4 Missed or out of scope in both runs
- `pnpm audit` (known CVEs) wasn't run either time.
- Playwright hasn't been executed in either run, so it's unknown whether the E2E suite is actually green.
- Run 1 recorded SEC-07 and SEC-08 as fully open. Both are now partial: login has a limiter and a dummy-hash timing guard, and middleware validates the callback. The client-side `router.push(callbackUrl)` in `login/page.tsx` was in the code during run 1 too and is still unvalidated.

---

## 5. What I couldn't verify
- Runtime behavior that needs Postgres or a browser: offline cold start on iOS (INF-11), the FD crash loop (INF-10), sync races (INF-08), E2E flakiness (INF-30), the secure-cookie failure on a LAN (INF-27) and the iOS Shortcut import (INF-12).
- Docker image build: no Dockerfile exists and the daemon wasn't running.
- Domain-level correctness of the CC, FD, loan, budget and household logic. The gap table rows marked "Spot-checked" or "Not verified" belong to the domain and backend audits.

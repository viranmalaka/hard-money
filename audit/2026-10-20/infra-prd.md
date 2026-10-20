# Hard Money audit: Infra, Config, Tooling, Tests, Build + PRD/PLAN gap analysis

Audit date: 2026-10-20. Read-only. Repo HEAD `f8e719a` ("fix: improve PWA service worker, theme handling, and E2E test reliability"). Working tree was clean.

Scope: `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.mts`, `playwright.config.ts`, `package.json`, `.npmrc`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.env.example`, `.gitignore`, `docker-compose.yml`, `prisma/schema.prisma`, `src/middleware.ts`, `src/app/api/health`, `src/app/api/test/[...slug]`, `src/app/api/v1/cron/tick`, `src/app/api/v1/webhooks/sms-ingress`, `src/app/api/push/*`, `src/app/api/shortcuts/download`, `src/lib/{auth,encryption,prisma,server-log,server-seq,server-clock,test-sync-hook}.ts`, `src/lib/jobs/cron-runner.ts`, `src/lib/push/outbox.ts`, `src/lib/sms/{worker,gemini-provider}.ts`, `src/lib/db/{index,dexie}.ts`, `public/sw.js`, `public/manifest.json`, `tests/**`, `PRD.md`, `PLAN.md`. Next.js 16 behavior checked against `node_modules/next/dist/docs/` (middleware→proxy, partialPrefetching, turbopack rules, output standalone).

Status labels: CONFIRMED = verified by reading code or running a command. SUSPECTED = strong inference that needs a runtime check.
Effort: S < half a day, M = 1-3 days, L = more than 3 days.

---

## 0. Commands run and results

`node_modules` was absent from the repo. To keep the workspace untouched I exported `HEAD` with `git archive` into `/tmp/hm-audit`, installed there, ran the checks, and then deleted the copy. No DB, no secrets, no migrations were used.

| Command (run in `/tmp/hm-audit`) | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (pnpm 12.6.0 via corepack, Node 24.21.0) | OK, 432 packages. Lockfile matches the manifest. Note: the first attempt was killed by the tool timeout during `@prisma/client` postinstall; the retry succeeded in 8.7 s. |
| `pnpm lint` | **FAILED, exit 1. 187 problems: 163 errors, 24 warnings.** 155 × `@typescript-eslint/no-explicit-any`, 6 × `react-hooks/set-state-in-effect` (React Compiler), 1 × `react-hooks/preserve-manual-memoization` ("Compilation Skipped"), 1 × `prefer-const`, 19 × `no-unused-vars`, 4 × `exhaustive-deps`, 1 × `@next/next/no-location-assign-relative-destination`. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0, no output. |
| `pnpm test` (vitest run) | **PASS**: 6 files, 44 tests, 562 ms. |
| `pnpm build` (no env vars, no DB) | **PASS**, exit 0. Turbopack, Cache Components + Partial Prefetching on. One warning: `The "middleware" file convention is deprecated. Please use "proxy" instead.` 43 static pages. `/api/push/vapid-public-key` and `/api/shortcuts/download` were prerendered as **static** (○), see CFG-04. |
| `pnpm audit` | Not run. The temp copy was gone by then and I chose not to re-run a network audit. |
| Playwright | Not run. It needs a live Postgres and a dev server, which this audit isn't allowed to use. |

Lint errors by file (errors only): `src/app/api/test/[...slug]/route.ts` 27, `src/app/api/sync/push/route.ts` 18, `src/lib/sms/worker.ts` 10, `src/lib/jobs/cron-runner.ts` 10, `src/lib/sms/ingestion.ts` 9, `tests/e2e/s19-household.spec.ts` 9, `tests/e2e/s07-transaction-lifecycle.spec.ts` 8, `tests/e2e/s06-trans-views.spec.ts` 7, `src/app/api/loans/[id]/pay-emi/route.ts` 7, `src/app/api/loans/[id]/schedule/[entryId]/route.ts` 6, `src/app/api/loans/[id]/route.ts` 5, `src/components/pwa-manager.tsx` 4, `src/app/api/sync/pull/route.ts` 4, plus about 20 other files with 1-4 each.

React Compiler errors (these make the compiler skip or de-optimize the component):
- `src/app/budget/page.tsx:106` "Compilation Skipped: Existing memoization could not be preserved"
- `src/app/more/inbox/page.tsx:125`, `src/app/more/page.tsx:142` and `:167`, `src/app/more/sms-activity/page.tsx:51`, `src/components/account/fd-close-modal.tsx:27`, `src/components/account/loan-detail-modal.tsx:86`: setState called synchronously inside an effect
- `src/lib/finance-core/calculator.ts:98` prefer-const
- `src/app/more/shortcuts/page.tsx:9` uses `window.location.href` for internal navigation

---

## 1. How this area works today

### 1.1 Build and toolchain
- One Next.js 16.4.0 app (App Router, Turbopack, React 19.3, React Compiler on, `cacheComponents` + `partialPrefetching` on). Tailwind v4 is loaded through `@tailwindcss/turbopack` as a Turbopack rule for `*.css`. This is valid per the local `turbopack.md` docs.
- PLAN asked for a monorepo (`apps/web`, `apps/worker`, `packages/finance-core`). That wasn't built. Finance math lives in `src/lib/finance-core/*` inside the app.
- pnpm 12.6.0 is pinned via `packageManager`. `pnpm-workspace.yaml` is used only for `allowBuilds` (postinstall allow-list). Most dependencies use `^` ranges; `next`, `react`, `react-dom`, `prisma`, `eslint-config-next` and `babel-plugin-react-compiler` are exact.
- Prisma 6.19.3 with Postgres. **There are no migrations** (`prisma/migrations` is missing). The global `serverSeq` Postgres sequence is created lazily at runtime by `src/lib/server-seq.ts`.
- ESLint 9 flat config (`next/core-web-vitals` + `next/typescript`). Vitest 5 runs `tests/unit/**/*.test.ts`. Playwright 1.64 runs `tests/e2e`.

### 1.2 Runtime topology (as built)
- **web** is the only process. Everything runs inside the Next server:
  - SMS ingestion: `POST /api/v1/webhooks/sms-ingress` → `setTimeout(processBankSms)` in the same process.
  - Scheduled jobs: `runCronTick()` in `src/lib/jobs/cron-runner.ts`. Nothing calls it on a schedule. It runs only when someone POSTs `/api/v1/cron/tick` or the E2E `/api/test/tick`.
  - Push reminders: `enqueuePushNotification` pushes into an in-memory array (`src/lib/push/outbox.ts`). Nothing is ever sent.
- **postgres**: `docker-compose.yml` defines a `postgres:16-alpine` service and a `web` service built from a `Dockerfile` that **doesn't exist**.
- There is no `worker` process, no pg-boss, no advisory lock and no job history.

### 1.3 Request pipeline
- `src/middleware.ts` (deprecated name in Next 16, still works) verifies the `hardmoney_session` HS256 JWT. It skips paths starting with `/_next`, `/api/health` or `/api/test`, and any path containing `.`. Its public list is `/login`, `/register`, `/offline`, `/api/auth`, `/api/health`, `/api/test`, `/api/v1/cron`. Other `/api/*` requests get 401 and pages redirect to `/login?callbackUrl=`.
- Each route handler also calls `getSessionUser()`. The ones that don't are login, logout, health and vapid-public-key; webhook, cron and test use their own auth.

### 1.4 Routes in scope

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /api/health` | public | Returns `{status, now, uptime}`. No DB or worker check. |
| `POST/GET /api/test/*` | `E2E_MODE=1` only, otherwise 404 | Actions: reset (TRUNCATE all tables), clock, seed, tick, pause-worker, process-sms, gemini, clear-logs, fail-mutation, push-outbox, push-subscriptions, gemini-requests, logs, snapshot (dumps all users' data). |
| `POST /api/v1/cron/tick` | `CRON_SECRET` (default `"optional-cron-secret-token"`) | Runs budget snapshots, CC statements, installments, FD payouts and push reminders for **all users**. Logs the secret. |
| `POST /api/v1/webhooks/sms-ingress` | `x-api-key` (sha256 lookup) **plus the middleware session check** | In-memory rate limit of 5 per 10 s. Inline processing. |
| `GET /api/push/vapid-public-key` | session (via middleware) | Statically prerendered at build. Falls back to a hard-coded key. |
| `POST /api/push/subscribe`, `unsubscribe`, `settings` | session | Store subscriptions and reminder settings. Nothing ever uses them to deliver push. |
| `GET /api/shortcuts/download` | session | Static JSON file named `.shortcut`. Not a real Apple Shortcut. |

### 1.5 Tests
- **Unit (Vitest)**: 44 tests across calculator, credit-card, encryption, finance-core (ledger, money, budget, FD and loan helpers), mask-numbers and the SMS template parser. There are no unit or integration tests for `cron-runner`, `sync/push`, `sync/pull`, `sms/worker`, `sms/ingestion`, role sanitization or Dexie migrations.
- **E2E (Playwright)**: 21 spec files, 244 test IDs against 261 planned. It runs on `next dev` (not a production build), with service workers blocked, against one shared DB that every test resets.
- **CI**: none. There's no `.github/` or any other pipeline.

---

## 2. Findings: Infra, Config, Security posture of the platform

### SEC-01. Self-host using `.env.example` exposes the unauthenticated test API: full DB wipe and data dump
- Severity: **Critical**. Status: CONFIRMED (code path).
- Location: `.env.example:12` (`E2E_MODE="1"`), `docker-compose.yml:35` (`E2E_MODE: ${E2E_MODE:-0}`), `src/middleware.ts:14,25` (`/api/test` public and skipped), `src/app/api/test/[...slug]/route.ts:14,22-60,580+`.
- Evidence: the documented setup is to copy `.env.example`, and it ships `E2E_MODE="1"`. Docker Compose reads `.env` for `${E2E_MODE}` interpolation, so `cp .env.example .env && docker compose up` gives `E2E_MODE=1` in production. Then anyone can call:
  - `POST /api/test/reset`, which runs `TRUNCATE TABLE "User", "Account", … CASCADE`
  - `GET /api/test/snapshot`, which returns every user's accounts and transactions
  - `seed`, which upserts users and API key hashes
  - `clock`, which shifts server time and therefore scheduler behavior

  None of these need a session.
- Impact: total data loss or disclosure on any instance configured from the example file.
- Fix:
  - Set `E2E_MODE="0"` in `.env.example` and move test settings into a separate `.env.test`.
  - Hard-fail the test route when `NODE_ENV === "production"`, unless an explicit `ALLOW_TEST_API_IN_PROD` is set for the CI production build.
  - Drop the `/api/test` bypass from the middleware, or require a random `E2E_TOKEN` header.
  - Log a loud startup warning when E2E mode is on.
- Effort: S.

### SEC-02. Missing `AUTH_SECRET` silently falls back to a public secret, so session JWTs can be forged
- Severity: **Critical**. Status: CONFIRMED.
- Location: `src/lib/auth.ts:6-7`, `src/middleware.ts:4-5`, `docker-compose.yml:30` (`AUTH_SECRET: ${AUTH_SECRET}`, no default and no required marker), `.env.example:3`.
- Evidence: `process.env.AUTH_SECRET || "insecure-dev-auth-secret-minimum-32-characters-long"`. Compose passes an empty string when the var is unset, and empty is falsy, so the public default is used. The secret is also `padEnd(32,"0")`, so short secrets are accepted. The repo's own tests forge tokens this way (`tests/e2e/fixtures.ts:6-7`, `tests/e2e/s19-household.spec.ts:5-6`).
- Impact: an attacker can mint a JWT for any `userId` and take over any account (finance data, household, keys).
- Fix:
  - Validate env at boot with zod (e.g. `src/lib/env.ts` imported from `instrumentation.ts`) and refuse to start in production when `AUTH_SECRET` is missing, shorter than 32 bytes, or equal to the example value.
  - In compose, use `${AUTH_SECRET:?AUTH_SECRET is required}`.
  - Remove the `padEnd`.
- Effort: S.

### SEC-03. Missing `APP_ENCRYPTION_KEY` falls back to a public key, so Gemini API keys are effectively unencrypted
- Severity: **Critical**. Status: CONFIRMED.
- Location: `src/lib/encryption.ts:3-12`, `docker-compose.yml:31`, `.env.example:4`.
- Evidence: `DEFAULT_KEY = "0123456789abcdef…"`, used when the env var is unset or empty. Any non-64-hex value is silently SHA-256 derived. The versioned prefix is always `v1`, and there's no key-rotation path even though PRD §1/§6 requires rotation.
- Impact: anyone with DB read access (a backup or `pg_dump`) can decrypt every user's Gemini key.
- Fix:
  - Require a 64-hex key in production, using the same env validation as SEC-02.
  - Support `APP_ENCRYPTION_KEYS="v2:<hex>,v1:<hex>"`: decrypt by prefix, encrypt with the newest key, and add a re-encrypt script.
  - In compose, use `${APP_ENCRYPTION_KEY:?…}`.
- Effort: M.

### SEC-04. Cron endpoint: well-known default secret, never configured by compose, and the secret is logged
- Severity: **High**. Status: CONFIRMED.
- Location: `src/app/api/v1/cron/tick/route.ts:5,10-14`, `docker-compose.yml:28-35` (no `CRON_SECRET`), `.env.example:9`.
- Evidence:
  - `const configuredSecret = process.env.CRON_SECRET || "optional-cron-secret-token"`.
  - `console.log("CRON DEBUG:", { configuredSecret, authHeader, cronSecretHeader })` prints the real secret and every caller's header to stdout on each call.
  - Compose doesn't forward `CRON_SECRET`, so Docker deployments always use the public default.
  - Comparison is not constant-time.
- Impact: anyone can trigger the all-user job. It is O(budgets × all transactions), so it doubles as a DoS lever and can force premature or duplicated scheduler side effects. Log aggregation also leaks the secret.
- Fix:
  - Delete the debug log.
  - If `CRON_SECRET` is unset, return 404 or 503 (PRD says "optional", meaning the external trigger is optional, not that a default is fine).
  - Use `crypto.timingSafeEqual` and forward `CRON_SECRET` in compose.
- Effort: S.

### SEC-05. Middleware blocks the SMS webhook for real clients; tests mask it by sending the browser session cookie
- Severity: **Critical** (core feature broken in production). Status: CONFIRMED by code. The live failure is SUSPECTED until an E2E run without cookies confirms it.
- Location: `src/middleware.ts:8-16,48-51`, `tests/e2e/s14-sms-ingress.spec.ts:58-75` (uses `page.request`, which shares the logged-in context's cookies).
- Evidence: `/api/v1/webhooks/...` isn't in `PUBLIC_PATHS` and isn't skipped. An Apple Shortcut sends no `hardmoney_session` cookie, so middleware returns `401 {"error":"Unauthorized"}` before the handler's `x-api-key` check runs. Every S14/S15/S16 webhook test posts through `page.request` right after `app.auth.register`, so the session cookie is attached and the bug is hidden.
- Impact: the whole automated SMS pipeline (PRD feature #6) can't receive messages from iOS.
- Fix:
  - Add `/api/v1/webhooks` to `PUBLIC_PATHS`.
  - Add a regression test that uses a fresh `request.newContext()` with no cookies.
- Effort: S.

### SEC-06. Default Postgres credentials exposed on the host network
- Severity: **High**. Status: CONFIRMED.
- Location: `docker-compose.yml:7-11`.
- Evidence: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}` and `ports: "5432:5432"`, which binds 0.0.0.0. The healthcheck hard-codes `-U postgres` (line 15), so it breaks if `POSTGRES_USER` is changed.
- Impact: a self-hosted box (VPS or NAS) exposes the finance DB to the LAN or internet with a default password.
- Fix:
  - Remove the `ports` mapping, or bind to `127.0.0.1:5432:5432`.
  - Require `POSTGRES_PASSWORD` with `:?`.
  - Use `pg_isready -U $${POSTGRES_USER}` in the healthcheck.
- Effort: S.

### SEC-07. No brute-force protection on login; weak password policy; timing-based user enumeration
- Severity: **High**. Status: CONFIRMED.
- Location: `src/app/api/auth/login/route.ts:13-40`, `src/app/api/auth/register/route.ts:13` (`min(6)`).
- Evidence:
  - No rate limiting or lockout.
  - When the user doesn't exist, the handler returns before hashing, so response time differs from a wrong password.
  - Minimum password length is 6.
- Impact: credential stuffing or brute force against a self-hosted, internet-facing finance app.
- Fix:
  - Add a per-IP plus per-email limiter, persisted in Postgres or at least LRU in memory.
  - Always run `verify` against a dummy hash.
  - Require at least 10 characters, and optionally a zxcvbn check.
- Effort: M.

### SEC-08. Open redirect through `callbackUrl`
- Severity: **Medium**. Status: CONFIRMED.
- Location: `src/middleware.ts:61-63`, `src/app/login/page.tsx:10,46`.
- Evidence: `callbackUrl.startsWith("/")` accepts `//evil.example`, and `new URL("//evil.example", request.url)` resolves off-site. The login page calls `router.push(callbackUrl)` without validation.
- Impact: phishing redirect after a legitimate login.
- Fix: accept only values matching `^/(?!/|\\)`, or parse with the request origin and compare origins.
- Effort: S.

### SEC-09. Middleware skips auth for any path containing "."
- Severity: **Medium** (defense in depth). Status: CONFIRMED (code); exploitability SUSPECTED low because handlers re-check the session.
- Location: `src/middleware.ts:26`.
- Evidence: `pathname.includes(".")` returns `NextResponse.next()`. Example: `/accounts/abc.def` or any `[id]` containing a dot bypasses the redirect.
- Impact: page-level protection can be bypassed. Today every API handler re-checks the session (verified: only login, logout, health and vapid-public-key lack `getSessionUser`), so this is latent.
- Fix: match a static-file extension allowlist (`/\.(png|svg|ico|js|json|webmanifest|txt)$/`) or rely on `config.matcher`.
- Effort: S.

### SEC-10. No security headers or CSP; `X-Powered-By` exposed
- Severity: **Medium**. Status: CONFIRMED.
- Location: `next.config.ts` (no `headers()`, no `poweredByHeader: false`).
- Impact: no clickjacking protection (`frame-ancestors`), no HSTS, no `Referrer-Policy` or `Permissions-Policy`. This matters for a finance PWA that stores data in IndexedDB.
- Fix: add `headers()` with CSP (nonce or strict-dynamic), `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and set `poweredByHeader: false`.
- Effort: M (CSP tuning).

### SEC-11. Session model: 30-day bearer JWT with no revocation
- Severity: **Medium**. Status: CONFIRMED.
- Location: `src/lib/auth.ts:34-41`, `src/app/api/auth/logout/route.ts:4-8`.
- Evidence: logout only deletes the cookie. A stolen token stays valid for 30 days. Password change can't invalidate sessions, and there's no `tokenVersion`.
- Fix: add `User.sessionVersion` (claim checked in `getSessionUser`), or a server-side session table. Rotate on password change and logout-all.
- Effort: M.

### SEC-12. Gemini integration: production memory retention of raw SMS, API key in the URL, no structured-output schema
- Severity: **High**. Status: CONFIRMED.
- Location: `src/lib/sms/gemini-provider.ts:13-23,53-59,60,93-104,108-110`.
- Evidence:
  - Every call, including real production calls, pushes `{rawMessage, maskedMessage}` into a global array that is never cleared outside the test API. That's an unbounded memory leak and keeps unmasked SMS in process memory.
  - The key is passed as `?key=` in the URL, where it can leak into proxy or egress logs. The `x-goog-api-key` header is preferred.
  - `generationConfig` sets only `responseMimeType`. No `responseSchema` is sent, so PRD §1 "Zod-based Structured Outputs" isn't met.
  - `!options.userApiKey` falls into the mock path, which throws "No mock Gemini response queued" in production instead of returning `NO_GEMINI_KEY`.
  - The thrown error includes the full Gemini response body.
- Fix:
  - Capture requests only when `E2E_MODE==="1"`.
  - Send the key in a header and include `responseSchema` (derived from `BankSmsSchema` via `z.toJSONSchema`).
  - Branch explicitly on a missing key.
  - Truncate error bodies.
  - Consider `@google/genai` as PRD specifies.
- Effort: M.

### SEC-13. Webhook hardening gaps
- Severity: **Medium**. Status: CONFIRMED.
- Location: `src/app/api/v1/webhooks/sms-ingress/route.ts:8-10,33-36,43-56,72-101`, `prisma/schema.prisma` (`apiKeyHash` has no index or unique constraint).
- Evidence:
  - The rate limiter is an in-memory `Map`, so it resets on restart, isn't shared across instances and never evicts keys.
  - Invalid keys aren't rate limited at all: each attempt costs a full-table `findFirst` because `apiKeyHash` is unindexed.
  - PRD asks for prefix lookup plus hash verification. The code hashes the full key with unsalted SHA-256. That's acceptable for high-entropy keys, but the lookup isn't indexed.
  - Dedupe is check-then-insert. Concurrent duplicate deliveries hit the `dedupeKey` unique constraint and return 500 instead of `200 DUPLICATE`.
  - `dedupeKey` uses the raw `receivedAt` string, so the same instant in a different ISO format bypasses dedupe.
- Fix:
  - Add `@@unique([apiKeyHash])` (or `@unique`).
  - Catch Prisma `P2002` and return DUPLICATE.
  - Normalize `receivedAt` with `new Date(x).toISOString()` before hashing.
  - Add an IP-level limiter for failed auth and a DB-backed limiter.
- Effort: S-M.

### CFG-01. `docker-compose.yml` references a Dockerfile that doesn't exist; no worker service; incomplete env
- Severity: **Critical** (for the stated open-source, self-hosted product). Status: CONFIRMED.
- Location: `docker-compose.yml:20-38`; repo root has no `Dockerfile` or `.dockerignore`.
- Evidence:
  - `build: { context: ., dockerfile: Dockerfile }` makes `docker compose up` fail immediately.
  - There's no `worker` service (PRD §1 and PLAN Step 0 require `web`, `worker`, `postgres`).
  - These env vars aren't forwarded: `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `GEMINI_PROVIDER`.
  - There's no `web` healthcheck and no migration or `prisma db push` step.
- Impact: the primary deployment path in PRD §1 doesn't work.
- Fix:
  - Add a multi-stage Dockerfile: pnpm fetch/install with `--frozen-lockfile`, `prisma generate`, `next build` with `output: "standalone"`, running as a non-root `node` user.
  - Add `.dockerignore`.
  - Add a `migrate` one-shot service (`prisma migrate deploy`) that `web` depends on with `service_completed_successfully`.
  - Add a `worker` service (or document the external-cron alternative, see OPS-02).
  - Forward all env vars and add a `web` healthcheck hitting `/api/health`.
- Effort: M.

### CFG-02. No Prisma migrations; schema bootstrap is implicit and the sequence is created at runtime
- Severity: **High**. Status: CONFIRMED.
- Location: `prisma/` (only `schema.prisma`), `src/lib/server-seq.ts:13-22`, `package.json` scripts (no `db:*`).
- Evidence: there's no `prisma/migrations`, so upgrades can't be applied safely or reviewed. `global_server_seq` is created via `CREATE SEQUENCE IF NOT EXISTS` on the first failure, from inside a request.
- Impact: self-hosters can't upgrade without `db push` (which risks data loss). Schema drift between installs. PRD §1 also requires a README covering upgrades.
- Fix:
  - `prisma migrate dev --name init` to baseline. Put the sequence in a SQL migration.
  - Add scripts `db:migrate` (`prisma migrate deploy`), `db:generate`, `db:seed`.
  - Document the upgrade flow.
- Effort: M.

### CFG-03. `serverSeq` can go backwards or be committed out of order, so clients silently miss rows
- Severity: **High**. Status: CONFIRMED (logic); the missed-row scenario is SUSPECTED under concurrency.
- Location: `src/lib/server-seq.ts:5-43`, `src/app/api/sync/push/route.ts:113` (seq drawn outside any `$transaction`), `src/app/api/sync/pull/route.ts:52-174` (`serverSeq > cursor`, `maxSeq`).
- Evidence:
  1. On any `nextval` error, the code falls back to a separate `SyncSequence` row that starts at 1, which is far below existing cursors. Rows written with those seqs are never pulled by existing clients.
  2. The sequence value is drawn before the write commits. A concurrent pull can see seq N+1 committed while N is still in flight, advance the cursor past N, and never fetch N. This is the classic "sequence gap" race of cursor sync.
  3. Push applies the mutation and then upserts `AppliedMutation` (line 1164) without a transaction. A crash between them re-applies on retry, and two concurrent retries both pass the `findUnique` at line 93.
- Impact: permanent client/server divergence. Balances on devices become wrong with no error.
- Fix:
  - Remove the fallback and fail loudly.
  - Wrap each mutation plus `AppliedMutation` insert (unique on id) in `prisma.$transaction`.
  - On pull, only return rows with `serverSeq <= (SELECT min in-flight)`. A simple approach: take a `pg_advisory_xact_lock` for writers, or pull up to `pg_snapshot_xmin`-safe watermarks. Simplest: pull up to `max(serverSeq) - safetyWindow` and re-pull overlap.
  - Add `take` pagination.
- Effort: L.

### CFG-04. VAPID public key route prerendered at build; runtime env ignored; hard-coded fallback key
- Severity: **High**. Status: CONFIRMED (build output shows `○ /api/push/vapid-public-key`).
- Location: `src/app/api/push/vapid-public-key/route.ts:3-8`, `next.config.ts:6` (`cacheComponents: true`).
- Evidence: the GET handler reads no request data, so Next 16 prerenders it as static at build. In a Docker build where VAPID vars aren't set, the shipped key is the hard-coded `BEl62iUYgUivxIkv…` sample key, whatever the runtime env says. `VAPID_PRIVATE_KEY` is never read anywhere.
- Fix:
  - Make the route dynamic (`await connection()` from `next/server`, or read `headers()`).
  - Fail with 503 when the key is unset.
  - Never ship a fallback.
- Effort: S.

### CFG-05. `.env.example` is incomplete and inconsistent with the code
- Severity: **Medium**. Status: CONFIRMED.
- Location: `.env.example:1-21`; env vars referenced in code (`grep process.env`).
- Evidence:
  - Documented but unused: `APP_URL`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  - Dangerous defaults for production: `E2E_MODE="1"`, `GEMINI_PROVIDER="mock"` (disables real Gemini for everyone), dev secrets.
  - Missing: `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (used by compose), `PLAYWRIGHT_TEST_BASE_URL`.
  - No comments on which vars are required, or how to generate keys (`openssl rand -hex 32`, `npx web-push generate-vapid-keys`).
- Fix: split into `.env.example` (production-safe placeholders like `AUTH_SECRET=` with generation instructions) and `.env.test.example`, and add zod env validation.
- Effort: S.

### CFG-06. `middleware.ts` is a deprecated convention in Next 16
- Severity: **Low**. Status: CONFIRMED (build warning; `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:588-613`).
- Fix: `mv src/middleware.ts src/proxy.ts` and rename the export to `proxy`. Proxy runs on the Node runtime, and jose is fine there. Rename the matcher config accordingly.
- Effort: S.

### CFG-07. Lint gate is red (163 errors), and React Compiler is skipping components
- Severity: **Medium**. Status: CONFIRMED (`pnpm lint`).
- Evidence: see §0. `react-hooks/preserve-manual-memoization` in `src/app/budget/page.tsx:106` means the compiler bails out of that component. Six `set-state-in-effect` errors cause cascading renders in More, Inbox, SMS activity, FD close and loan detail. 155 `any`s hide type errors in money-critical code: `sync/push` 18, `cron-runner` 10, `sms/worker` 10, `sms/ingestion` 9, `loans/*` 22.
- Fix:
  - Type the Prisma calls (most `(prisma as any)` casts are unnecessary since the models exist).
  - Replace effect-driven state init with derived state or `key` resets.
  - Make `pnpm lint` part of CI with `--max-warnings=0`.
- Effort: M.

### CFG-08. Dependency and engine hygiene
- Severity: **Low**. Status: CONFIRMED.
- Location: `package.json`.
- Evidence:
  - Most runtime deps use `^` ranges (`@prisma/client ^6.19.3` alongside an exact `prisma 6.19.3`; these must stay in lockstep).
  - No `engines.node`, and no `.nvmrc`. `@types/node ^20` while local Node is 24.
  - No `typecheck`, `db:*`, `lint:fix` or `test:all` scripts.
  - `test:e2e` doesn't start Postgres.
  - `playwright.config.ts:43` uses `npx next dev` instead of `pnpm exec`.
  - `pnpm-workspace.yaml` allow-lists `workerd`, which isn't in the lockfile (0 matches), so it's a stale entry.
  - `.antigravity/extensions.json` is an editor artifact committed to the repo.
- Fix:
  - Pin `@prisma/client` exactly to match `prisma`.
  - Add `"engines": {"node": ">=22 <25"}` and `.nvmrc`.
  - Add `typecheck: "tsc --noEmit"`.
  - Remove `workerd`, and gitignore `.antigravity/`.
- Effort: S.

### CFG-09. Money columns are `Int` (int4), not `BIGINT` as PRD §2.1 requires
- Severity: **High**. Status: CONFIRMED.
- Location: `prisma/schema.prisma`: every `*Minor` field (30 fields, e.g. `Account.openingBalanceMinor`, `Transaction.amountMinor`, `Loan.originalPrincipalMinor`, `FixedDeposit.principalAmountMinor`) is `Int`.
- Evidence: Postgres int4 tops out at 2,147,483,647 minor units, which is LKR 21,474,836.47. A typical Sri Lankan housing loan, lease or large FD (e.g. LKR 25,000,000 = 2.5e9 minor) overflows and Prisma throws on write.
- Impact: users with realistic loans, FDs or net worth can't record them, and `balanceCacheMinor` or aggregates can overflow.
- Fix:
  - Migrate the `*Minor` columns to `BigInt` (Postgres `bigint`).
  - Serialize as number when `Number.isSafeInteger`, or as a string. PRD calls for superjson; a custom JSON replacer also works.
  - Add an overflow test.
- Effort: M-L (touches every API and Dexie mapping).

### CFG-10. Dead or duplicate Dexie schema module
- Severity: **Low**. Status: CONFIRMED.
- Location: `src/lib/db/dexie.ts` (DB name `hardmoney-<userId>`, version 1, unused: 0 importers) versus `src/lib/db/index.ts` (DB name `hardmoney_<userId>`, versions 1-5, 21 importers).
- Impact: confusion. If anyone imports the wrong module, they get a second, divergent IndexedDB.
- Fix: delete `src/lib/db/dexie.ts`.
- Effort: S.

---

## 3. Findings: Ops, observability, jobs

### OPS-01. Health check doesn't check anything
- Severity: **Medium**. Status: CONFIRMED.
- Location: `src/app/api/health/route.ts:4-11`.
- Evidence: returns `ok` without touching Postgres, the sequence, or job freshness. Playwright `webServer.url` and any orchestrator treat a server with a dead DB as healthy.
- Fix: split into `/api/health/live` (process) and `/api/health/ready` (`SELECT 1`, last cron run age, PENDING SMS count). Return 503 on failure. Don't leak internals publicly; a summary is enough.
- Effort: S.

### OPS-02. No scheduler: installments, statements, FD payouts, budget close and reminders never run unless something calls the cron URL
- Severity: **Critical**. Status: CONFIRMED.
- Location: `src/lib/jobs/cron-runner.ts:34` (only callers are `api/v1/cron/tick/route.ts:24` and `api/test/[...slug]/route.ts:495`), `docker-compose.yml` (no worker), no README.
- Evidence: there's no pg-boss, no worker container, no in-process interval, and no catch-up on login or sync. PRD §2.7 requires catch-up "when a user authenticates and syncs, guarded by a Postgres advisory lock". None of that is documented.
- Impact on a default deployment:
  - CC installments are never billed and plans never complete.
  - Statements never snapshot.
  - FD interest is never paid.
  - Budget rollover snapshots never close.
  - Reminders never fire.
- Fix:
  - Minimum: a `worker` service in compose that calls `runCronTick` every N minutes (or `curl` the tick with `CRON_SECRET`), and document it.
  - Proper: pg-boss per PRD, with `pg_try_advisory_lock` around `runCronTick`, and an opportunistic catch-up after `sync/pull`.
- Effort: M.

### OPS-03. SMS processing isn't durable: stuck `PROCESSING` and orphaned `PENDING` rows are never retried
- Severity: **High**. Status: CONFIRMED.
- Location: `src/app/api/v1/webhooks/sms-ingress/route.ts:101-108`, `src/lib/sms/worker.ts:22-31,272-306`.
- Evidence:
  - Processing is `setTimeout(…,0)` in the request process.
  - `processAllPendingBankSms` is only called from the test API.
  - If the process restarts after insert, or a throw happens after the `PROCESSING` claim, the row stays `PENDING` or `PROCESSING` forever. `attempts` and `nextRetryAt` are never used for backoff.
  - `PROCESSING` isn't a PRD status, and the UI may not display it.
- Impact: lost SMS transactions with no signal to the user.
- Fix:
  - Have the cron or worker sweep `PENDING`, plus `PROCESSING` older than T, with `attempts < max` and exponential `nextRetryAt`. Move to `FAILED` after the max.
  - Use pg-boss per PRD.
- Effort: M.

### OPS-04. Push reminders are never delivered (in-memory mock outbox in production)
- Severity: **High** (the feature is advertised but non-functional). Status: CONFIRMED.
- Location: `src/lib/push/outbox.ts:1-32`, `src/lib/jobs/cron-runner.ts:514-547`; no `web-push` dependency in `package.json`.
- Evidence:
  - `enqueuePushNotification` appends to a module array and nothing sends it.
  - The reminder condition `userTime >= configuredTime` fires on every tick after the time, with no once-per-day guard, so the array grows without bound.
  - The VAPID private key is unused.
- Fix:
  - Add `web-push` (pinned).
  - Send to each `PushSubscription` and delete it on 404 or 410.
  - Persist `lastReminderSentOn` (date in the user's timezone) to fire once a day.
  - Keep the in-memory outbox only for E2E.
- Effort: M.

### OPS-05. Cron runner scalability and correctness
- Severity: **High**. Status: CONFIRMED.
- Location: `src/lib/jobs/cron-runner.ts:51-160` (budgets), 123 (snapshot id), 238 and 301 (statement and installment ids), 14-21 and 528.
- Evidence:
  - For every budget it loads all of that user's transactions (O(B×T)), then calls `getNextServerSeq()` and upserts each month on every tick. That rewrites `serverSeq` even when nothing changed, which forces every client to re-pull all snapshots each tick.
  - Closed-month snapshots are overwritten with the current `monthlyLimitMinor`. PRD §3.F says "closed months keep their snapshot".
  - Dates are always `Asia/Colombo`, not `User.timezone` (PRD §2.2). Only the reminder block reads `u.timezone`.
  - Deterministic IDs are `snap_…`, `stmt_…` and `inst_…` strings, not UUIDv5 as PRD §2.7 specifies. They're still deterministic.
  - There's no lock, so concurrent ticks race.
  - No job-run history is recorded (PRD §6 Observability).
- Fix:
  - Scope queries by month range and category.
  - Only upsert when values change.
  - Preserve the historic limit for closed months.
  - Compute boundaries per user timezone.
  - Wrap in an advisory lock.
  - Write a `JobRun` table (job, startedAt, finishedAt, ok, error, counts).
- Effort: M-L.

### OPS-06. No structured logging or observability; ad-hoc console interception
- Severity: **Medium**. Status: CONFIRMED.
- Location: `src/lib/server-log.ts:29-72`, `src/lib/prisma.ts:10`, scattered `console.*`.
- Evidence:
  - There's no logger, request ID or log levels.
  - `server-log.ts` monkey-patches `console.*` into an unbounded global array. It's only installed once the test API imports it, so the S14-12 "raw SMS never logged" test only covers code paths run after the first `reset`.
  - There's no error reporting (e.g. Sentry or OTel) and no `instrumentation.ts`.
  - PRD §6 requires structured logs, job run history and a "System health" page.
- Fix:
  - Add `pino` (pinned) with a redaction list (`rawMessage`, `rawSms`, `apiKey`, `authorization`, `x-api-key`, `cookie`).
  - Add `instrumentation.ts` with `onRequestError`.
  - Make the E2E capture a pino destination rather than a console monkey-patch.
- Effort: M.

### OPS-07. Production build isn't standalone; no reproducible container build
- Severity: **Medium**. Status: CONFIRMED.
- Location: `next.config.ts` (no `output: "standalone"`).
- Fix: `output: "standalone"`, then copy `public` and `.next/static` in the Dockerfile per `output.md`. Pin the base image digest.
- Effort: S.

### OPS-08. No README or self-hosting docs (first run, backup and restore, upgrades, cron, HTTPS)
- Severity: **High** (PRD §1, §6, Step 21). Status: CONFIRMED (no `README.md`).
- Fix: write a README covering requirements, env generation, `docker compose up`, migrations, cron or worker setup, `pg_dump`/`pg_restore`, upgrade steps, HTTPS reverse proxy (secure cookies need HTTPS), Apple Shortcut setup, and the Gemini privacy disclosure.
- Effort: M.

---

## 4. Findings: PWA and offline infrastructure

### PWA-01. Service worker never caches `/_next/` assets, so offline cold start can't work
- Severity: **High**. Status: CONFIRMED (code). The user-visible failure is SUSPECTED because the browser HTTP cache may partially mask it.
- Location: `public/sw.js:59-66`.
- Evidence: the fetch handler returns early for `/_next/`. Cached HTML documents reference hashed JS and CSS chunks that aren't in Cache Storage, so after the HTTP cache is evicted, an offline launch renders a dead shell. PRD §6: "works fully offline from cold start". PLAN S20-01/S20-02 (offline reload with data) aren't implemented as tests.
- Fix: precache the build manifest. Serwist (`@serwist/next`) per PRD does this. Or add cache-first for `/_next/static/*`, which is immutable.
- Effort: M.

### PWA-02. Hand-rolled SW versioning; no build-tied invalidation; update flow untested
- Severity: **Medium**. Status: CONFIRMED.
- Location: `public/sw.js:2` (`CACHE_VERSION = "hardmoney-v4"` manual), `:14` (unconditional `skipWaiting()` in install, which contradicts the "New version available — reload" prompt flow), `src/components/pwa-manager.tsx:11` (SW registered only in production, while E2E runs `next dev` and blocks SWs).
- Impact: stale HTML can be served after deploys. An immediate takeover can mix old HTML with new chunks. S20-04 isn't tested.
- Fix: Serwist with revisioned precache. Remove the auto `skipWaiting`; prompt the user instead.
- Effort: M.

### PWA-03. Cached authenticated HTML shared across users on one device
- Severity: **Low**. Status: SUSPECTED.
- Location: `public/sw.js:77-85`.
- Evidence: navigations are cached with network-first, keyed by URL and not by user. Pages are client-rendered from IndexedDB, so leakage is limited to shell HTML (user name if SSR'd). Logout doesn't clear caches.
- Fix: clear caches on logout, and avoid caching responses with `Set-Cookie` or `Cache-Control: private`.
- Effort: S.

### PWA-04. Apple Shortcut download isn't a usable Shortcut
- Severity: **High** (onboarding for feature #6 is broken). Status: CONFIRMED.
- Location: `src/app/api/shortcuts/download/route.ts:4-36`.
- Evidence: it returns a hand-written JSON blob with `.shortcut` extension and the placeholder URL `https://your-domain.com/...`. Real `.shortcut` files are signed plists, and iOS can't import this. The route is also prerendered static, so it can't embed the instance URL even if fixed.
- Fix: publish an iCloud Shortcut link with import questions (URL, key), or generate an unsigned plist and document the "Allow untrusted shortcuts" path. Fill in `APP_URL` dynamically.
- Effort: M.

---

## 5. Findings: Testing and CI

### TST-01. No CI pipeline
- Severity: **High**. Status: CONFIRMED (no `.github/`, no other CI config).
- Evidence: PLAN Step 0 requires "lint → typecheck → vitest → playwright (web, mobile) → upload traces". Today lint fails and nothing enforces the regression gate that PLAN's Definition of Done depends on.
- Fix: add a GitHub Actions workflow with a Postgres service, `pnpm install --frozen-lockfile`, lint, `tsc --noEmit`, vitest, `prisma migrate deploy`, `next build`, Playwright on `web` and `mobile` (sharded), and artifact upload.
- Effort: M.

### TST-02. E2E runs against `next dev`, not a production build, and service workers are blocked
- Severity: **High**. Status: CONFIRMED.
- Location: `playwright.config.ts:15` (`serviceWorkers: "block"`), `:42-47` (`npx next dev`, `reuseExistingServer: true` always).
- Evidence: PLAN A.1 says tests run against `next build && next start` with web, worker and a throw-away Postgres. Dev mode hides build-only issues: static prerendering of env-reading routes (CFG-04), Cache Components behavior, React Compiler output and the SW (only registered in production). `reuseExistingServer: true` lets tests silently run against a developer's server with a different env.
- Fix:
  - CI project with `command: "pnpm build && pnpm start"` and `reuseExistingServer: !process.env.CI`.
  - A dedicated PWA project with `serviceWorkers: "allow"`.
  - Pass `env: { E2E_MODE: "1", GEMINI_PROVIDER: "mock", … }` explicitly in `webServer`.
- Effort: M.

### TST-03. `fullyParallel` with global DB truncation is racy on CI
- Severity: **Medium**. Status: CONFIRMED (config); flakiness SUSPECTED.
- Location: `playwright.config.ts:5-6`; every spec calls `testApi.reset()` (TRUNCATE all tables) in `beforeEach`.
- Evidence: CI uses `workers: 2` with `fullyParallel: true`. One worker's reset wipes the other's data mid-test. Server clock, rate limits, the Gemini queue and the push outbox are also process-global.
- Fix: `workers: 1` until tests are isolated, or move to per-worker databases or schemas (`DATABASE_URL` with `?schema=w${workerIndex}`) and per-worker server instances.
- Effort: M.

### TST-04. Webhook E2E tests don't exercise real client conditions
- Severity: **High**. Status: CONFIRMED.
- Location: `tests/e2e/s14-sms-ingress.spec.ts`, `s15-*.spec.ts`, `s16-*.spec.ts` (all use `page.request` with the session cookie).
- Impact: this is what masks SEC-05.
- Fix: use `playwright.request.newContext({ baseURL })` with no storage state for all webhook calls.
- Effort: S.

### TST-05. Planned tests missing or weakened
- Severity: **Medium**. Status: CONFIRMED (automated diff of `S##-##` IDs in PLAN.md against `test("S##-##` in `tests/e2e`).
- Evidence: 261 planned, 244 implemented.
  - Missing: S18-12, S18-13 (loan offline sync), S20-01, S20-02, S20-04, S20-10 (SW offline reload, offline navigation, update flow, WebKit offline smoke), and all of S21-01…S21-13 (export/import, health, full a11y sweep, perf, journeys, expired-session).
  - Every "visual snapshot" test (S01-08, S04-11, S05-16, S06-15, S09-11, S10-11, S13-15, S17-12) was swapped for computed-style checks; `toHaveScreenshot` appears 0 times.
  - Axe only runs in `s01-app-shell.spec.ts`.
  - S18 IDs were renumbered against PLAN, so traceability is broken.
  - Tests hard-code `http://localhost:3000` instead of using `baseURL`.
- Fix: implement the missing IDs (prioritize S20-01/02 and S21-12), restore screenshot baselines, extend axe to every screen, and realign the S18 numbering.
- Effort: L.

### TST-06. Unit and integration coverage gaps on money-critical server code
- Severity: **High**. Status: CONFIRMED.
- Evidence: Vitest covers the pure helpers (44 tests). There are no unit or integration tests for:
  - `src/lib/jobs/cron-runner.ts`: catch-up, idempotency, day-31 clamp, timezone boundary. PRD §6 "Scheduler tests".
  - `src/app/api/sync/push|pull`: idempotent retries, tombstones, role sanitization, conflict. PRD §6 "Sync tests".
  - `src/lib/sms/ingestion.ts` (±2 h one-to-one matching, ATM fee child, fee-SMS dedupe) and `worker.ts`.
  - Dexie migration upgrades (PRD §1, §6).
  - Property-based invariants (PRD §6: "sum of splits equals total", "billed + unbilled = outstanding"). No `fast-check`.
  - The SMS fixture corpus beyond a few inline samples.
  - No coverage reporting configured in `vitest.config.mts`.
- Fix:
  - Add a Vitest integration project with a Testcontainers or compose Postgres for cron, sync and ingestion.
  - Add `fast-check` property tests in finance-core.
  - Use `fake-indexeddb` for Dexie migration tests.
  - Enable `coverage` with thresholds on `src/lib/finance-core` and `src/lib/jobs`.
- Effort: L.

### TST-07. Test API surface ships in the production bundle
- Severity: **Medium**. Status: CONFIRMED (build output lists `ƒ /api/test/[...slug]`).
- Evidence: gated only by a runtime env check (see SEC-01). The `x-disable-e2e-mode` header trick is test-only scaffolding living in production code.
- Fix: exclude the route at build time unless `E2E_BUILD=1`, e.g. via `pageExtensions` or a build-time guard that throws in `NODE_ENV=production` without an explicit flag.
- Effort: S.

---

## 6. PRD / PLAN gap analysis

Legend: ✅ implemented and roughly per spec · 🟡 partial or divergent · ❌ missing. Severity reflects impact on a "production-ready" release. My area was infra and tooling, so feature-level correctness inside UI or business logic was only spot-checked; other audit reports cover those internals.

### 6.1 Architecture and stack (PRD §1, PLAN Step 0)

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-01 | tRPC for internal data and sync (PRD §1, PLAN Step 3 `sync.push/pull`) | 🟡 diverges | REST route handlers (`src/app/api/sync/push/route.ts`, `pull/route.ts`, about 40 REST routes). No tRPC, no superjson, so no bigint transport. | Low (an architectural choice, but document it as an ADR) |
| GAP-02 | Shared `packages/finance-core` monorepo with `apps/web` and `apps/worker` | 🟡 | `src/lib/finance-core/*` inside the app. Pure, no I/O, and shared by client and server, which meets the intent. | Low |
| GAP-03 | pg-boss worker process plus advisory-lock catch-up on login/sync (PRD §1, §2.7; PLAN Step 11) | ❌ | See OPS-02 and OPS-03. | Critical |
| GAP-04 | Serwist/Workbox service worker (PRD §1, PLAN Step 20) | 🟡 | Hand-written `public/sw.js`. Doesn't precache build assets (PWA-01). | High |
| GAP-05 | `@google/genai` with Zod Structured Outputs (PRD §1) | 🟡 | Raw REST `fetch`, no `responseSchema` (SEC-12). Zod validation happens after the fact. | Medium |
| GAP-06 | Auth.js (NextAuth); optional OAuth via env (PRD §1) | 🟡 | Custom jose JWT plus Argon2id (`src/lib/auth.ts`). No OAuth. Argon2id params (19 MiB, t=2) meet the OWASP minimum. | Medium |
| GAP-07 | Docker Compose `web`, `worker`, `postgres` plus README (PRD §1) | ❌ | CFG-01, OPS-08. | Critical |
| GAP-08 | Required env: `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `APP_URL`, VAPID | 🟡 | Present in `.env.example`, but not validated. `APP_URL` and `VAPID_PRIVATE_KEY` are unused (CFG-05). | High |
| GAP-09 | CI workflow (PLAN Step 0) | ❌ | TST-01. | High |
| GAP-10 | Offline session: expired session must not block usage, only pause sync (PRD §1) | 🟡 | Middleware redirects any page navigation with an expired or invalid JWT to `/login` (`src/middleware.ts:48-57`) while online. Offline works only through the SW HTML cache. | Medium (SUSPECTED UX break) |
| GAP-11 | Logout with a non-empty outbox requires confirmation (PRD §1) | ❌ | `src/app/more/page.tsx:229-239`: logout just POSTs and navigates. There's no outbox check. IndexedDB `hardmoney_<userId>` and SW caches remain on the device. | Medium |
| GAP-12 | `ALLOW_REGISTRATION` | ✅ | `src/app/api/auth/register/route.ts:23`, `src/app/register/page.tsx:12`. | — |
| GAP-13 | Gemini key encrypted with a versioned prefix and rotation support (PRD §1, §6) | 🟡 | Encrypted with `v1:` only. No rotation path, and a default key (SEC-03). | High |
| GAP-14 | Webhook key shown once, hash only, prefix lookup | 🟡 | Shown once, hash stored. The lookup is by full hash without an index (SEC-13). | Low |

### 6.2 Cross-cutting conventions (PRD §2)

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-15 | Money as Postgres BIGINT (§2.1) | ❌ | All `*Minor` are `Int` (CFG-09). | High |
| GAP-16 | Single currency validated against `defaultCurrency` (§2.1) | Not verified | No validation found in the config or tooling scope. Defer to the domain audit. | — |
| GAP-17 | Calendar dates in the user's timezone (§2.2) | 🟡 | `Asia/Colombo` is hard-coded in 15 places across 8 files (`cron-runner.ts`, `finance-core/credit-card.ts`, `quick-add-modal.tsx`, `calendar-view.tsx`, `calibration-modal.tsx`, `api/auth/*`, `more/page.tsx`). `User.timezone` is editable but only the reminder job reads it. | High for non-Colombo users |
| GAP-18 | Date-only fields stored as `DATE` (§2.2) | 🟡 | Schema uses `DateTime` and string date fields. Not fully reviewed. | Low |
| GAP-19 | `serverSeq` from a single Postgres sequence on every write (§2.6) | 🟡 | Implemented but unsafe (CFG-03). | High |
| GAP-20 | Deterministic UUIDv5 IDs (§2.7) | 🟡 | FD payouts use uuidv5. Budget, statement and installment rows use `snap_`/`stmt_`/`inst_` string IDs (`cron-runner.ts:123,238,301`). | Low |
| GAP-21 | `BankSms.dedupeKey` = sha256(userId+sender+receivedAt+raw) (§2.7) | ✅ | Matches, except `receivedAt` isn't normalized (SEC-13). | Low |
| GAP-22 | Catch-up on authenticate and sync with an advisory lock (§2.7) | ❌ | OPS-02. | High |
| GAP-23 | Audit stamps `updatedByUserId` | ✅ | Present on `Transaction`. | — |

### 6.3 Schema (PRD §3) and client stores (Subsystem 6)

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-24 | `Transaction.fixedDepositId`, `loanId`, `localCreatedAt` (§3.D) | 🟡 | Not on `Transaction` (`schema.prisma:139-187`). FD and loan links go through `FixedDepositPayout.transactionId` and `LoanPayment.transactionId`. `FD_PLACEMENT`, `FD_MATURITY` and `LOAN_DISBURSEMENT` rows have no back-link. | Medium |
| GAP-25 | `Budget.householdId` (exactly one of user or household) (§3.F) | ❌ | `Budget` only has `userId` plus `@@unique([userId, categoryId])` (`schema.prisma:237-257`). There are no household budgets. The unique key also ignores `deletedAt`, so a soft-deleted budget blocks re-creating one for that category (SUSPECTED; depends on whether delete is soft or hard). | Medium |
| GAP-26 | `BankSms.status` enum (§3.E) | 🟡 | Adds an undocumented `PROCESSING` state with no recovery (OPS-03). | Medium |
| GAP-27 | `HouseholdMember` / `Household` tombstone and `serverSeq` for sync purge | Not verified | Household models have no `serverSeq` or `deletedAt` (`schema.prisma:55-74`). Purge-on-revoke must be special-cased. Defer to the household audit. | — |
| GAP-28 | Dexie stores: `transactionSplitItems`, `bankSmsLogs`, `households`, `householdMembers` (Subsystem 6.1) | 🟡 | `src/lib/db/index.ts` v5 has none of these stores. Split items are presumably embedded. | Low-Medium |
| GAP-29 | Dexie migration tests (PRD §1, §6) | ❌ | v2 is a no-op upgrade and there are no tests (TST-06). | Medium |
| GAP-30 | `TransactionSplitItem.category onDelete: Cascade` | Risk | `schema.prisma:218`: a hard delete of a category would delete split rows and break the "sum of splits = total" invariant. Categories are soft-deleted today, so this is latent. | Low |

### 6.4 Subsystems (PRD §4)

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-31 | S1: webhook reachable by Apple Shortcuts | ❌ (broken) | SEC-05. | Critical |
| GAP-32 | S1: respond 202 and enqueue to a durable queue with retry/backoff | 🟡 | 202 yes. The queue is `setTimeout`, with no retry (OPS-03). | High |
| GAP-33 | S1: rate limit per key | 🟡 | In-memory only (SEC-13). | Medium |
| GAP-34 | S1: no server-wide Gemini fallback key; no key leads to `NEEDS_REVIEW/NO_GEMINI_KEY` | 🟡 | Mock path entered when `!userApiKey` (`gemini-provider.ts:60`). Correct routing depends on `worker.ts` checking for a key first. Not fully traced. | Medium (SUSPECTED) |
| GAP-35 | S1: inbox "Link to existing transaction" action (PRD §5.1) | ❌ | No such action or string in `src/` (grep for "Link to existing"/"linkExisting" returned nothing). Inbox routes are only `ignore`, `post`, `retry`. | Medium |
| GAP-36 | S2: scheduler-generated installments and statements | 🟡 | The logic exists in `cron-runner.ts`, but never runs in a default deployment (OPS-02). | Critical (operational) |
| GAP-37 | S2: "Convert to 0% Installment" and cancel-plan restore | Not verified | `convert` strings exist in `transaction-edit-modal.tsx` and `daily-view.tsx`; `CANCELLED` appears in account pages. Defer to the CC audit. | — |
| GAP-38 | S4: closed-month snapshots preserved | ❌ | Overwritten each tick with the current limit (OPS-05). | Medium |
| GAP-39 | S5: FD monthly payouts by the scheduler | 🟡 | Implemented in cron but never scheduled (OPS-02). | High |
| GAP-40 | S6: per-mutation authorization and pull sanitization | Not verified | Exists in `sync/push` and `pull` (1,188 and 350 lines). Defer to the sync audit. The infra-level atomicity issues are in CFG-03. | — |

### 6.5 UI/UX spec (PRD §5) items found while tracing config and routes

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-41 | Desktop sidebar has "same five destinations plus Dashboard"; desktop multi-card dashboard (Net Worth, Safe-to-Spend, Cashflow with Adjustments, CC alerts, calendar, SMS log) (§5.0, §5.1) | ❌ | `src/components/navigation/sidebar.tsx:53-57` has 5 items and no Dashboard. No dashboard route exists (no "dashboard" match in `src/`). Net worth appears only in `src/app/accounts/page.tsx`. | High |
| GAP-42 | More → Export/Import, Settings "System health" page (§5.0 item 7, §6; PLAN Step 21 ☐) | ❌ | No export or import routes or UI, no health page. PLAN tracker marks Step 21 ☐. | High |
| GAP-43 | Respect `prefers-reduced-motion` (§5.0) | ❌ | No `prefers-reduced-motion` / `motion-reduce` anywhere in `src/`. | Low |
| GAP-44 | List virtualization for 1,000+ rows (PLAN S06-12, S21-07 with 5,000 rows) | ❌ | No virtualization library or implementation found. S06-12 tests 1,000 rows. 5,000 rows is untested. | Medium (SUSPECTED perf) |
| GAP-45 | Text externalized for localization (§6) | ❌ | Strings are inline in JSX across pages. | Low |
| GAP-46 | iOS install caveat for push (§1, PLAN S20-08) | 🟡 | S20-08 tests that a "Notifications & Reminders section" is displayed, not the iOS-only caveat. Push isn't actually delivered anyway (OPS-04). | Medium |
| GAP-47 | Apple Shortcuts setup guide and **download template** (§1, §5.1) | 🟡 | Guide page exists (`src/app/more/shortcuts/page.tsx`). The template isn't importable (PWA-04). | High |
| GAP-48 | WCAG AA verified in both themes on all screens (§5.0, §6; PLAN S21-06) | 🟡 | Axe runs only on the shell (S01-07). Full validation also needs manual testing with assistive tech. | Medium |

### 6.6 Non-functional (PRD §6) and PLAN Step 21

| ID | Requirement | Status | Evidence | Severity |
| --- | --- | --- | --- | --- |
| GAP-49 | JSON/CSV export and import with ID preservation | ❌ | Nothing in `src/` (S21-01…04 missing). | High (data sovereignty is a headline promise) |
| GAP-50 | `pg_dump` backup/restore documented | ❌ | No README. | High |
| GAP-51 | Structured logs, job run history, system health page | ❌ | OPS-06, OPS-05, GAP-42. | Medium |
| GAP-52 | Raw SMS never in logs | 🟡 | Ingress route is careful. The Gemini provider retains raw SMS in memory and throws errors containing the upstream body (SEC-12). There's no redaction layer. | Medium |
| GAP-53 | Performance: quick-add < 100 ms; 5,000-row Trans. tab interactive < 3 s | Not measured | S21-07 is missing. | Medium |
| GAP-54 | Scheduler tests, sync tests, property tests, SMS fixture corpus | ❌ / 🟡 | TST-06. | High |
| GAP-55 | E2E against a production build with worker and Postgres | ❌ | TST-02. | High |
| GAP-56 | Security regression: forged mutations, expired session, rate limits (S21) | 🟡 | Forged mutations are covered in S19. Expired-session-offline (S21-12) is missing. | Medium |

### 6.7 PLAN progress tracker vs. reality

PLAN marks Steps 0-20 ☑ and Step 21 ☐. Against each step's own **Build** list:

- Step 0: no monorepo, no worker, no CI, compose not runnable.
- Step 11: no `apps/worker`/pg-boss and no advisory lock.
- Step 14: webhook unreachable without a session (SEC-05). Shortcut file not importable.
- Step 15: no Structured Outputs.
- Step 20: no Serwist, SW offline cold start not proven (S20-01/02/04/10 missing), push not delivered.

By PLAN's own Definition of Done (A.4: "Full earlier suite still green", run in CI), none of the steps can be proven closed, because there's no CI and lint fails.

---

## 7. Prioritized remediation order

1. **Ship-blockers (S effort, do first):** SEC-01 (E2E default plus test-API prod guard), SEC-02/SEC-03 (env validation, no default secrets), SEC-04 (cron secret and log), SEC-05 plus TST-04 (webhook public path and cookie-less test), SEC-06 (Postgres exposure), CFG-04 (dynamic VAPID route).
2. **Make self-hosting real (M):** CFG-01 (Dockerfile, migrate service, worker), CFG-02 (migrations), OPS-02/OPS-03 (scheduler plus SMS sweep with locks), OPS-08 (README with backup and upgrade), OPS-01 (readiness check).
3. **Data integrity (M-L):** CFG-03 (atomic push, safe pull watermark, no seq fallback), CFG-09 (BIGINT money), OPS-05 (cron correctness and per-user timezone, GAP-17).
4. **Quality gates (M):** TST-01 (CI), CFG-07 (lint to zero, React Compiler errors), TST-02/TST-03 (prod-build E2E, isolation), TST-06 (scheduler, sync and ingestion integration tests).
5. **Feature gaps (M-L):** GAP-49/42 (export/import, system health), GAP-41 (desktop dashboard), OPS-04 (real web push), PWA-01/02 (Serwist), PWA-04 (Shortcut), SEC-07/SEC-10/SEC-11 (auth hardening, headers, revocation), SEC-12 (Gemini hardening), GAP-11 (logout safety).

## 8. What I could not verify
- I didn't run Playwright (it needs Postgres and a dev server). The live 401 on the webhook (SEC-05), the offline cold-start failure (PWA-01) and the parallel-reset flakiness (TST-03) are inferred from code and config.
- Feature internals owned by other audit areas (sync role sanitization, CC math, installments, FD and loan math, UI behavior) were only spot-checked for this gap table and are marked "Not verified" where applicable.
- `pnpm audit` (known CVEs) wasn't run.

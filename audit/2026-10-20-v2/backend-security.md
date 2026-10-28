# Hard Money: Backend, API and Security Audit (second run)

- **Date:** 2026-10-20 (second audit run of the day)
- **Commit audited:** `0c401ec` ("feat: add confirmation modal component and integrate into account actions"). The working tree is clean apart from untracked screenshots in `audit/`.
- **Scope:** every route under `src/app/api/**` (48 route files), `src/middleware.ts`, `src/lib/{auth,authorization,rate-limit,encryption,server-seq,server-log,prisma}.ts`, `src/lib/sms/*`, `src/lib/push/outbox.ts`, `src/lib/jobs/cron-runner.ts`, `src/lib/sync/client.ts` (how the client reacts to API errors), `public/sw.js`, `public/manifest.json`, `prisma/schema.prisma`, `next.config.ts`, `docker-compose.yml` and `.env.example`.
- **Mode:** read-only. I changed no source, made no commits, did not touch the database and started no dev server.

Labels used below:
- **CONFIRMED:** the code path is unambiguous, or I verified it by running something.
- **SUSPECTED:** likely, but it depends on runtime or deployment details I could not exercise.
- **Effort:** S = under 2 hours, M = half a day to 2 days, L = more than 2 days or a redesign.

---

## 0. Commands run and results

| Command | Result |
|---|---|
| `pnpm lint` | **Fails** (exit 1): 157 problems, 142 errors and 15 warnings. 139 are `@typescript-eslint/no-explicit-any`. 12 API route files have lint errors, mostly `(prisma as any)` casts in `sync/push`, `loans/*`, `fixed-deposits/*`, `push/*` and `test/[...slug]`. |
| `pnpm exec tsc --noEmit` | Passes (exit 0). |
| `pnpm exec vitest run` | Passes: 8 files, 62 tests. No unit test covers a route handler, `authorization.ts`, `rate-limit.ts` or the sync push authorization rules. |
| `pnpm build` (no env) | **Fails.** `src/lib/auth.ts:9` throws `AUTH_SECRET must be configured with at least 32 bytes in production` during "Collecting page data". The fail-closed secret check works, but it also means the build itself needs the runtime secret. |
| `AUTH_SECRET=<throwaway 48 chars> pnpm build` | Passes. The build prints `The "middleware" file convention is deprecated. Please use "proxy" instead.` The route table marks `/api/push/vapid-public-key` as `○ (Static)`, which means it is prerendered at build time (see SEC-016). Every other API route is `ƒ (Dynamic)`. The build regenerated the Prisma client and `.next/`; no tracked file changed (`git status` checked afterwards). |
| `node -e` with the middleware `callbackUrl` regex and `new URL()` | `/%09/evil.com` and `/%0a/evil.com` pass the regex and resolve to `https://evil.com/` (see SEC-010). `//evil.com` and `/\evil.com` are correctly rejected. |
| `node -e` decoding the fallback VAPID key | The hardcoded key decodes to **64 bytes**. A P-256 public key for Web Push must be 65 bytes (uncompressed point), so the fallback key is not valid (see SEC-016). |
| Read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` and `.../file-conventions/middleware.md` | Confirms `middleware.ts` is deprecated in Next 16 and renamed to `proxy.ts`. `middleware` still runs on the Edge runtime; `proxy` runs on Node.js only. |
| Read `.../next-config-js/proxyClientMaxBodySize.md` | When middleware/proxy is present, request bodies are buffered up to 10 MB by default. That is the only body-size limit for these route handlers. |

---

## 1. How this area works today

### 1.1 Stack and modules

- Next.js 16.4.3 App Router with `cacheComponents`, `partialPrefetching` and `reactCompiler` enabled (`next.config.ts`). All server logic lives in Route Handlers under `src/app/api`. There are no Server Actions.
- Prisma 6.19 on PostgreSQL. Four migrations exist in `prisma/migrations/`. The global sync sequence `global_server_seq` is still created at runtime by `src/lib/server-seq.ts:19` when it is missing.
- The client is offline-first. Dexie stores data per user (`hardmoney-<userId>`, `src/lib/db/dexie.ts:149`). Most writes go through an outbox to `POST /api/sync/push`. Reads come from `GET /api/sync/pull?cursor=N`, which returns every row with `serverSeq > cursor`. A small set of REST routes handles operations that need server logic: loan EMI payment, FD closure, SMS inbox actions, households, settings and push.
- Authorization helpers live in `src/lib/authorization.ts`: `assertCanWriteAccount`, `authorizeLoan` and `authorizeFixedDeposit`. The sync push route mostly does its own per-entity checks inline.

### 1.2 Authentication and sessions

1. **Register** (`POST /api/auth/register`): zod validates name (≤100), email (≤254) and password (6 to 128 characters). An in-memory rate limit allows 5 per hour per IP and per email. The route then creates the user, a default household, the OWNER membership and the default categories as separate statements, signs a JWT and sets the cookie. `ALLOW_REGISTRATION=false` closes sign-ups.
2. **Login** (`POST /api/auth/login`): zod validates the input. The in-memory rate limit allows 10 per 15 minutes per IP and per email. An Argon2id verify runs against a dummy hash when the user does not exist, so timing does not reveal whether an email is registered. On success the route sets `hardmoney_session`: `httpOnly`, `sameSite=lax`, `secure` only when `NODE_ENV=production`, `path=/`, `maxAge` 7 days.
3. **Token:** an HS256 JWT signed with `AUTH_SECRET`, valid for 7 days. Its payload includes `userId`, `email`, `name` and `sessionVersion`. `verifySessionToken` (`src/lib/auth.ts:51`) re-reads `User.sessionVersion` and rejects stale tokens. In production a missing, short or default `AUTH_SECRET` throws at module load.
4. **Logout** (`POST /api/auth/logout`): increments `sessionVersion`, which signs the user out on **every** device, and deletes the cookie.
5. **Session** (`GET /api/auth/session`): returns the DB user, or 401.
6. **Middleware** (`src/middleware.ts`) runs on the Edge runtime for every path except `_next/static`, `_next/image` and `favicon.ico`. It skips `/_next`, `/api/health`, `/api/test`, `/manifest.json`, `/sw.js` and image extensions. It only checks the JWT signature and expiry, **not** `sessionVersion`. Without a valid token it returns 401 JSON for `/api/*` and redirects pages to `/login?callbackUrl=<path>`. These paths are public: `/login`, `/register`, `/offline`, `/api/auth/*`, `/api/health`, `/api/test/*`, `/api/v1/cron/*` and `/api/v1/webhooks/*`. A signed-in user who opens `/login` or `/register` is redirected to `callbackUrl` when it matches `^/(?![/\\])`.
7. **Machine authentication:**
   - SMS webhook: `x-api-key` is SHA-256 hashed and looked up with `user.findFirst({ apiKeyHash })`. Keys look like `hm_live_` followed by 48 hex characters and are generated by `POST /api/user/webhook-key`.
   - Cron: `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`, compared with `timingSafeEqual`. The route returns 503 when `CRON_SECRET` is unset.
   - Test harness: POST needs `NODE_ENV !== production`, `E2E_MODE=1` and the `x-e2e-secret` header. GET only needs `E2E_MODE=1` (see SEC-008).

### 1.3 Authorization model

The PRD §3.A role matrix defines four roles:
- **OWNER and CO_OWNER:** full access to shared data.
- **CONTRIBUTOR_ADD_ONLY:** can add transactions to shared accounts and sees only their own transactions. Account balances are hidden from them, and they have no access to FDs, loans or budgets.
- **VIEWER:** read-only, including shared FDs and loans.

Rules are enforced in four places:

| Place | Rule |
|---|---|
| `assertCanWriteAccount` | Allows the account owner, or any household member who is not a VIEWER when the account is `SHARED_HOUSEHOLD`. CONTRIBUTOR passes. |
| `authorizeLoan` / `authorizeFixedDeposit` | Allows the owner, or any member of `householdId`. `write` mode only excludes VIEWER, so **CONTRIBUTOR passes for both read and write**. |
| `sync/push` inline checks | Per entity and op, against `userHouseholdRoleMap`. Coverage is uneven, and the details are in the findings. |
| `sync/pull` | Filters by `userId`, `householdId ∈ memberships` and role. Contributors get only `createdByUserId = self` transactions, and their shared accounts have zeroed balances. Contributors receive no FDs or loans. |

### 1.4 Sync engine

- **Push:** the client sends the whole pending outbox in one request. The server sorts mutations by entity priority. For each mutation it checks idempotency (`AppliedMutation` by `mutationId`), then checks every account reference field with `assertCanWriteAccount`, then applies the entity handler. `CREATE` is implemented as `upsert` by client-supplied ID. A mutation that throws is returned as `rejected` with `err.message`.
- **Pull:** 14 parallel `findMany` calls with no `take`. The new cursor is the highest `serverSeq` seen.
- **serverSeq:** comes from `nextval('global_server_seq')`, usually before and outside the write's transaction.

### 1.5 SMS pipeline, cron and push

- **SMS:**
  1. `POST /api/v1/webhooks/sms-ingress` authenticates the API key, then applies a per-key, in-memory limit of 5 requests per 10 seconds.
  2. It validates with zod, dedupes by `sha256(user:sender:receivedAt:raw)`, stores a `BankSms` row as PENDING and returns 202.
  3. `setTimeout(processBankSms)` runs the template parser and falls back to Gemini using the user's own encrypted key (`src/lib/sms/gemini-provider.ts`).
  4. Review actions run under `/api/sms/inbox/[id]/{post,ignore,retry,merge-transfer}`.
- **Cron:** `POST /api/v1/cron/tick` calls `runCronTick()`, which handles budget snapshots, credit-card statements, installment billing, FD payouts and maturity, and push reminders.
- **Push:**
  - `POST /api/push/subscribe` upserts a subscription by `endpoint`.
  - The cron "sends" reminders by appending to an in-memory array (`src/lib/push/outbox.ts`). No Web Push library is installed and `VAPID_PRIVATE_KEY` is never read.
  - The client (`src/app/more/preferences/page.tsx:139-145`) registers a **fake** subscription (see SEC-007).
  - `public/sw.js` has `push` and `notificationclick` handlers that would work if a real push arrived.

### 1.6 Route inventory (all 48 route files)

"Session" means `getSessionUser()` (JWT plus `sessionVersion` check) inside the handler, behind the middleware gate.

| Route | Methods | AuthN | AuthZ / ownership | Input validation | Findings |
|---|---|---|---|---|---|
| `/api/auth/login` | POST | public | n/a | zod (no password max) | SEC-010, SEC-015, SEC-029 |
| `/api/auth/register` | POST | public | `ALLOW_REGISTRATION` | zod (min 6) | SEC-013, SEC-015, SEC-023 |
| `/api/auth/logout` | POST | session (optional) | self | none needed | SEC-018 |
| `/api/auth/session` | GET | session | self | n/a | none |
| `/api/health` | GET | public (skipped by middleware) | n/a | n/a | SEC-033 |
| `/api/test/[...slug]` | POST, GET | public path; POST needs non-prod, `E2E_MODE` and secret; **GET needs only `E2E_MODE=1`** | none | none | SEC-008 |
| `/api/v1/cron/tick` | POST | `CRON_SECRET` | n/a | n/a | SEC-027 |
| `/api/v1/webhooks/sms-ingress` | POST | `x-api-key` | key's owner | zod | SEC-005, SEC-026 |
| `/api/households` | GET, POST | session | membership | POST: `name` only, untyped | SEC-024 |
| `/api/households/[id]/members` | POST | session | OWNER/CO_OWNER; CO_OWNER role needs OWNER | zod | SEC-023, SEC-024 |
| `/api/households/[id]/members/[memberId]` | PATCH, DELETE | session | OWNER/CO_OWNER, or self for leave | zod (PATCH) | SEC-024 |
| `/api/households/[id]/transfer-ownership` | POST | session | current owner | untyped `newOwnerId` | SEC-024 |
| `/api/loans` | GET, POST | session | GET: owner only; POST: `assertCanWriteAccount` on disbursement account | **none** | SEC-011, SEC-012, SEC-032 |
| `/api/loans/[id]` | GET, PATCH | session | `authorizeLoan` (CONTRIBUTOR allowed) | PATCH: partial | SEC-004, SEC-011, SEC-012 |
| `/api/loans/[id]/close` | POST | session | `authorizeLoan` write | n/a | SEC-004 |
| `/api/loans/[id]/pay-emi` | POST | session | `authorizeLoan` write and `assertCanWriteAccount` | partial | SEC-004, SEC-013 |
| `/api/loans/[id]/schedule/[entryId]` | PATCH | session | `authorizeLoan` write | **none** (types) | SEC-004, SEC-012 |
| `/api/fixed-deposits/[id]` | PATCH | session | **owner only** (`userId`) | partial | SEC-011, SEC-012, SEC-032 |
| `/api/fixed-deposits/[id]/close` | POST | session | `authorizeFixedDeposit` write and `assertCanWriteAccount` | `actualProceedsMinor` any number | SEC-004, SEC-012, SEC-013 |
| `/api/fixed-deposits/[id]/deposit-proceeds` | POST | session | same as close; maturity check | n/a | SEC-004, SEC-013 |
| `/api/transactions` | POST | session | `assertCanWriteAccount` on source; destination checked only for TRANSFER | partial | SEC-012 |
| `/api/transactions/[id]` | PATCH, DELETE | session | household role or owner; **removed creator still allowed** | PATCH: `Number(amountMinor)` | SEC-012, SEC-024 |
| `/api/transactions/[id]/merge` | POST | session | `userId` | n/a | SEC-013 |
| `/api/transactions/[id]/dismiss-duplicate` | POST | session | `userId` | n/a | none |
| `/api/transactions/[id]/raw-sms` | GET | session | `userId` | n/a | none |
| `/api/sms/activity` | GET | session | `userId` | status passthrough | SEC-020 |
| `/api/sms/inbox` | GET | session | `userId` | n/a | SEC-020 |
| `/api/sms/inbox/[id]/post` | POST | session | `userId` on SMS and accounts | partial (`type` free text) | SEC-012, SEC-013 |
| `/api/sms/inbox/[id]/ignore` | POST | session | `userId` | n/a | none |
| `/api/sms/inbox/[id]/retry` | POST | session | `userId` | n/a | SEC-026 |
| `/api/sms/inbox/[id]/merge-transfer` | POST | session | `userId` on SMS, transaction and accounts | partial | SEC-013 |
| `/api/sync/pull` | GET | session | role-filtered | cursor unvalidated | SEC-019, SEC-020 |
| `/api/sync/push` | POST | session | inline, **incomplete** | **none** (no schema) | SEC-001, SEC-002, SEC-003, SEC-009, SEC-019, SEC-020, SEC-021, SEC-031 |
| `/api/push/subscribe` | POST | session | self, **rebinds by endpoint** | zod (URL plus strings) | SEC-007, SEC-025 |
| `/api/push/unsubscribe` | POST | session | self | zod | none |
| `/api/push/settings` | GET, POST | session | self | zod (`HH:mm` regex allows `99:99`) | SEC-030 |
| `/api/push/vapid-public-key` | GET | session | n/a | n/a | SEC-016 |
| `/api/shopping-list/count` | GET | session | membership | n/a | none |
| `/api/user/settings` | GET, PATCH | session | self | zod (loose) | SEC-030 |
| `/api/user/gemini-settings` | GET, PATCH | session | self | manual (loose) | SEC-017, SEC-030 |
| `/api/user/webhook-key` | GET, POST | session | self | n/a | none |
| `/api/user/accounts` | GET | session | self | n/a | none |
| `/api/user/categories` | GET | session | self | n/a | none |
| `/api/users/search` | GET | session | **any user can look up any email** | n/a | SEC-023 |

---

## 2. Summary by severity

| Severity | Count | IDs |
|---|---|---|
| Critical | 2 | SEC-001, SEC-002 |
| High | 6 | SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008 |
| Medium | 17 | SEC-009 to SEC-025 |
| Low | 10 | SEC-026 to SEC-035 |
| **Total** | **35** | |

### 2.1 What this means for the installed mobile PWA

People use this app mostly as a home-screen PWA. These backend issues show up directly for them:

- **Reminders never arrive:** the toggle says "Reminders active", but the app registers a fake subscription and the server never sends anything (SEC-007).
- **Sessions expire silently:** the session dies after exactly 7 days. When it does, the sync engine treats the 401 as "idle", so the app keeps working offline and shows no error. New entries pile up in the outbox and nothing prompts the user to sign in again. Signing out on one phone also signs out the partner's other devices (SEC-018).
- **Double taps duplicate money:** a double tap or a flaky-network retry on "Pay EMI", "Close FD" or "Post SMS" can record the money movement twice (SEC-013).
- **Raw errors reach the user:** many inputs reach Prisma unvalidated. Users then see raw Prisma error strings as sync rejection reasons, or get a bare 500 (SEC-012, SEC-021).

---

## 3. Findings

### 3.1 Authorization and IDOR

#### SEC-001: Loan schedule entries and loan payments in sync push have no authorization
- **Severity:** Critical · CONFIRMED · **Effort:** S
- **File:** `src/app/api/sync/push/route.ts:1241-1310`
- **Evidence:**
  ```ts
  } else if (entityLower === "loanscheduleentry") {
    if (mutation.op === "CREATE") {
      await (prisma as any).loanScheduleEntry.upsert({ where: { id: mutation.id },
        create: { loanId: payload.loanId, ... }, update: { principalComponentMinor: ..., status: payload.status, deletedAt: null } });
    } else if (mutation.op === "UPDATE") {
      await (prisma as any).loanScheduleEntry.updateMany({ where: { id: mutation.id }, data: {...} });
    } else if (mutation.op === "DELETE") { ...updateMany({ where: { id: mutation.id }, data: { deletedAt: new Date() } }) }
  } else if (entityLower === "loanpayment") {
    await (prisma as any).loanPayment.upsert({ where: { id: mutation.id }, create: { loanId: payload.loanId, ... }, update: {} });
  ```
  The generic pre-check at `:117-129` only looks at account fields. Nothing checks that `payload.loanId`, or the loan behind an existing entry, belongs to the caller or to one of the caller's households.
- **Impact:** any signed-in user who knows a loan ID or schedule entry ID can do the following to **any** loan:
  - create schedule rows;
  - change principal and interest splits;
  - mark installments PAID or SCHEDULED;
  - soft-delete or undelete entries;
  - add `LoanPayment` rows that reduce the outstanding principal shown by `GET /api/loans` and `/api/loans/[id]`.

  VIEWERs and removed members already hold loan IDs in IndexedDB from earlier pulls. A VIEWER can therefore rewrite a shared loan's schedule, which the PRD forbids.
- **Recommended fix:**
  - For CREATE, load the parent loan with `authorizeLoan(user, payload.loanId, "write")`, after first tightening that helper to OWNER/CO_OWNER (SEC-004).
  - For UPDATE and DELETE, scope the `where` to entries whose loan the caller may write, for example `where: { id, loan: { OR: [{ userId }, { householdId: { in: writableHouseholdIds } }] } }`. Reject when `count === 0`.
  - Reject `loanPayment` CREATE for loans the caller cannot write.
  - Add role × entity × op integration tests.

#### SEC-002: `CREATE` upserts let any user overwrite other users' rows (accounts, transactions, templates, installment plans, FDs, loans, shopping items)
- **Severity:** Critical · CONFIRMED · **Effort:** M
- **Files** (all in `src/app/api/sync/push/route.ts`):

  | Entity | Line |
  |---|---|
  | account | `:224` |
  | transaction | `:478` |
  | template | `:706` |
  | installment plan | `:870` |
  | FD | `:974` |
  | loan | `:1133` |
  | shopping list item | `:152` |
- **Evidence:** every handler does `upsert({ where: { id: mutation.id }, create: { userId: user.id, ... }, update: { ...payload fields..., deletedAt: null } })`. There is no ownership check before it. For example, the account handler only checks a role when `payload.householdId` is present (`:212-223`), and the transaction handler only checks the referenced account. The `update` branch runs whenever the ID already exists, whoever owns the row. Categories are the exception: they load the row and check `userId` first (`:362-366`).
- **Impact:** an attacker sends `op: "CREATE"` with a victim's existing ID and gets the `update` branch:
  - **Accounts:** a household VIEWER sends `{entity:"account", op:"CREATE", id:<sharedAccountId>, payload:{openingBalanceMinor: 0, accessScope:"PRIVATE"}}` with no `householdId`. The role check is skipped, so the VIEWER can rewrite the shared account's opening balance, scope, sender IDs and archived flag. The update also forces `currency` to `"LKR"`, which silently converts USD accounts.
  - **Transactions:** the attacker can rewrite amount, type, note, flags and dates, and undelete the row (`deletedAt: null`). If `accountId` is left out, the transaction stays on the victim's account.
  - **Predictable IDs:** some IDs can be derived without seeing the row. Examples are `${loanId}-disbursement` and `${fdId}-placement`, and `uuidv5("<fdId>:MATURITY:PRINCIPAL", "6ba7b810-…")`, whose namespace is public.
  - **FDs and loans:** full overwrite of principal, rate, tenure, status and closure, plus undelete.
  - **Shopping items:** `householdId` is reassigned to the attacker's household, which moves the item out of the victim's list.

  This bypasses every UPDATE-path role check in the same file.
- **Recommended fix:**
  - Treat CREATE as insert-only. Use `create`, and on P2002 load the existing row.
  - If the existing row belongs to the caller, or to a household where the caller has the right role, run it through the same authorization as UPDATE. Otherwise return `rejected("conflict")`.
  - Factor one `authorize(entity, op, existingRow, user, roleMap)` policy module that mirrors the PRD matrix, and use it in all three ops.

#### SEC-003: Sync push lets non-members edit and delete household transactions
- **Severity:** High · CONFIRMED · **Effort:** S
- **File:** `src/app/api/sync/push/route.ts:558-646` (UPDATE), `:647-701` (DELETE)
- **Evidence:**
  ```ts
  if (existingTx) {
    if (existingTx.householdId) {
      const role = userHouseholdRoleMap.get(existingTx.householdId);
      if (role === "VIEWER") { reject }
      if (role === "CONTRIBUTOR_ADD_ONLY") { ...own-only check... }
      // role === undefined (caller is not a member) → falls through and is allowed
    } else if (existingTx.userId !== user.id) { reject }
  }
  await prisma.transaction.updateMany({ where: { id: mutation.id }, data: {...} });
  ```
- **Impact:** a user who is not a member of the household (for example a removed member, who still has every shared transaction ID cached locally) can modify or soft-delete any shared transaction. The PRD (S19-10) says "her pushes are rejected" after removal. The account, FD and loan handlers in the same file reject an undefined role correctly; only transactions miss it.
- **Recommended fix:** in both branches, reject when `existingTx.householdId && !role && existingTx.userId !== user.id`. Also decide whether the original creator should keep write access after leaving. The PRD says no, so reject even when `existingTx.userId === user.id` if the membership is gone.

#### SEC-004: CONTRIBUTOR_ADD_ONLY can read and write shared loans and FDs through REST
- **Severity:** High · CONFIRMED · **Effort:** S
- **Files:**
  - `src/lib/authorization.ts:16-38`
  - Callers: `src/app/api/loans/[id]/route.ts:16,48`, `loans/[id]/close/route.ts:18`, `loans/[id]/pay-emi/route.ts:41`, `loans/[id]/schedule/[entryId]/route.ts:27`, `fixed-deposits/[id]/close/route.ts:21`, `fixed-deposits/[id]/deposit-proceeds/route.ts:23`
- **Evidence:**
  ```ts
  if (!member || (mode === "write" && member.role === "VIEWER")) return null;
  return loan;
  ```
  Any membership row allows read, and anything except VIEWER allows write. The PRD matrix says contributors never see FDs or loans ("never synced"). Sync pull follows that rule by using `fullReadHouseholdIds`. Sync push UPDATE also requires OWNER/CO_OWNER (`:1176-1186`). The REST helpers do not.
- **Impact:** a contributor who learns a loan or FD ID can:
  - read the full loan, schedule and payments with `GET /api/loans/[id]`;
  - re-amortize the loan (`PATCH`) or override schedule rows;
  - pay EMIs or close the loan;
  - close or mature shared FDs, crediting the proceeds into a shared account.

  How a contributor gets the ID: IDs leak through shared transaction notes, the predictable `…-disbursement` and `…-placement` transaction IDs (SEC-002), and earlier membership as CO_OWNER or VIEWER.
- **Recommended fix:** treat CONTRIBUTOR as no access in both helpers. Allow read for OWNER, CO_OWNER and VIEWER, and write for OWNER and CO_OWNER only. Add unit tests for `authorization.ts`.

### 3.2 Secrets, logging and test surfaces

#### SEC-005: The SMS webhook writes full raw bank SMS bodies and user emails to production logs
- **Severity:** High · CONFIRMED · **Effort:** S
- **File:** `src/app/api/v1/webhooks/sms-ingress/route.ts:34-39, 56, 86-95, 128, 172`. Introduced by commit `da48e4f` ("add detailed logging …").
- **Evidence:**
  ```ts
  const isE2E = process.env.E2E_MODE === "1";
  if (isE2E) {
    console.log(`[SMS-INGRESS] Request body (E2E mode):`, { ...body, rawSms: "[REDACTED FOR E2E TEST]" });
  } else {
    console.log(`[SMS-INGRESS] Request body:`, JSON.stringify(body, null, 2));
  }
  console.log(`[SMS-INGRESS] [Auth OK] Authenticated user: ${user.id} (${user.email || user.name || "unnamed"})`);
  ```
  The PRD says `rawMessage` is "never written to application logs" (PRD.md:296, 795).
  - Redaction only happens in E2E mode. The E2E log-secrecy test therefore passes, while production logs every SMS: balances, partial account and card numbers, merchant names, and OTPs when users forward all SMS.
  - Line 38 also logs the first 10 characters of the API key, which are the fixed `hm_live_` prefix plus 2 random hex characters. That leak is minor.
  - Line 172 echoes `error.message` to the caller.
- **Impact:** every bank SMS ends up in stdout and in any log aggregator or hosting log retention. This contradicts a stated product guarantee and widens the blast radius of a log-access compromise to the users' full financial SMS history.
- **Recommended fix:**
  - Remove the body log.
  - Log only `{ smsId, userId, sender, length, status }`.
  - Drop the email and key-prefix logs.
  - Return a generic 500 message.
  - Make the E2E log test run without the E2E-only redaction path, so it tests what production does.

#### SEC-006: Gemini provider keeps every raw, unmasked SMS in process memory in production
- **Severity:** High (privacy, memory) · CONFIRMED · **Effort:** S
- **File:** `src/lib/sms/gemini-provider.ts:21-22, 52-58`
- **Evidence:** `globalGemini.__capturedGeminiRequests!.push({ sender, rawMessage: options.rawMessage, maskedMessage, model, timestamp })` runs on every call, whatever the environment. The array is only cleared by the test harness. It stores `rawMessage` before masking. The real `fetch` (`:98`) has no timeout, and the user's Gemini key travels in the query string (`?key=`).
- **Impact:**
  - Memory grows without bound with every SMS that falls back to Gemini.
  - Unmasked financial SMS sit in the heap, where heap dumps and crash reports can capture them.
  - `GET /api/test/gemini-requests` returns them when `E2E_MODE=1` (SEC-008).
  - A slow Gemini response hangs the request. This matters most for `POST /api/sms/inbox/[id]/retry`, which waits synchronously for the worker.
- **Recommended fix:**
  - Capture only when `E2E_MODE === "1"`, and store only the masked text.
  - Add `signal: AbortSignal.timeout(15_000)`.
  - Send the key with the `x-goog-api-key` header.

#### SEC-007: Web push is mocked in production: the client registers a fake subscription and the server never sends anything
- **Severity:** High (core PWA feature is non-functional and the UI misreports it) · CONFIRMED · **Effort:** M
- **Files:**
  - `src/app/more/preferences/page.tsx:139-145`
  - `src/app/api/push/subscribe/route.ts:32-51`
  - `src/lib/jobs/cron-runner.ts:513-548`
  - `src/lib/push/outbox.ts:13-24`
  - `package.json` (no `web-push`)
- **Evidence:**
  ```ts
  subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/test-${Math.random().toString(36).slice(2, 9)}`,
    keys: { p256dh: "BMo9aW7-test-p256dh-key-mock", auth: "mockAuthKey123" },
  };
  ```
  The client never calls `pushManager.subscribe()` and never fetches `/api/push/vapid-public-key`, and nothing in `src/` references `applicationServerKey`. On the server, the cron appends to an in-memory array that nothing ever drains or sends. `VAPID_PRIVATE_KEY` is never read.
- **Impact:**
  - Users get "Reminders active" after granting notification permission, and no notification ever arrives.
  - Each save inserts another fake `PushSubscription` row, because the endpoint is random each time.
  - The in-memory outbox grows by one entry per enabled user on every cron tick after their reminder time, because there is no "already sent today" tracking. It is never freed.
- **Recommended fix:**
  - Client: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the key from the API, then post `subscription.toJSON()`.
  - Server: add a pinned `web-push` dependency, send with the VAPID keys, delete subscriptions on 404/410, and persist `lastReminderSentOn` per user.
  - Remove the in-memory outbox outside E2E.
  - Until delivery exists, do not show "Reminders active".

#### SEC-008: `GET /api/test/*` is unauthenticated whenever `E2E_MODE=1` and dumps every user's data
- **Severity:** High (conditional on a misconfiguration, with catastrophic impact) · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/test/[...slug]/route.ts:565-571` (GET guard), `:589-649` (snapshot); `src/middleware.ts:16,30` (public and skipped)
- **Evidence:** POST was hardened at `:14-19`: it requires not-production, `E2E_MODE=1` and a matching `x-e2e-secret`. GET only checks:
  ```ts
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") { return 404 }
  ```
  - `snapshot` returns all accounts, transactions, budgets, FDs, loans and **all `bankSms` rows with raw messages** for every user.
  - `push-subscriptions` returns every endpoint and key.
  - `gemini-requests` returns raw SMS (SEC-006).
  - `logs` returns captured console output.

  Middleware skips `/api/test` entirely.
- **Impact:** a staging or self-hosted box that runs with `E2E_MODE=1`, for example to use the mock Gemini provider, exposes the whole database to anonymous callers. `.env.example` and `docker-compose.yml` now default `E2E_MODE` to `0`, which lowers the likelihood.
- **Recommended fix:**
  - Apply the POST guard (non-production plus secret) to GET.
  - Better: exclude the route from production builds entirely, for example by mounting it only when a build-time flag is set.
  - Log a startup warning whenever `E2E_MODE=1`.

### 3.3 Medium-severity findings

#### SEC-009: Household and attribution injection through sync push
- **Severity:** Medium · CONFIRMED · **Effort:** S
- **Files** (all in `src/app/api/sync/push/route.ts`):
  - `:313-315`: account UPDATE `householdId`
  - `:417-441`: transaction CREATE `txHouseholdId`
  - `:494`: `createdByUserId`
  - `:528-541`, `:631-644`: split items
- **Evidence:**
  - **Account UPDATE:** `householdId: payload.accessScope === "SHARED_HOUSEHOLD" ? payload.householdId : null`. There is no membership or role check on the new `householdId`. The role check at `:274` covers the account's *current* household only.
  - **Transaction CREATE:** `let txHouseholdId = payload.householdId || null;`. This value is only overridden when the referenced account has a `householdId`. For the caller's own private account, the client value is stored.
  - **Attribution:** `createdByUserId: payload.createdByUserId || user.id`.
  - **Split items:** split item `categoryId` is never checked.
- **Impact:**
  - Anyone who knows a household ID can make their own account appear as a shared account in that household. Pull includes `householdId ∈ memberships AND accessScope = SHARED`.
  - They can push transactions into that household's feed.
  - They can attribute transactions to another user ("added by Wife").
  - A contributor can set `createdByUserId` to someone else, so the row disappears from their own view and appears as the other member's.
- **Recommended fix:**
  - Require OWNER/CO_OWNER of the *target* household on account UPDATE.
  - Always derive `transaction.householdId` from the account and ignore the payload.
  - Force `createdByUserId = user.id` on CREATE.
  - Validate `categoryId` values against the caller's visible categories.

#### SEC-010: Open redirect after login (tab/newline bypass in middleware; no validation in the login page)
- **Severity:** Medium · CONFIRMED (verified with node) · **Effort:** S
- **Files:** `src/middleware.ts:68-71`; `src/app/login/page.tsx:13, 24`
- **Evidence:**
  - Middleware accepts `callbackUrl` when it matches `/^\/(?![\/\\])/`. `/login?callbackUrl=/%09/evil.com` decodes to `"/\t/evil.com"`. That value passes the regex, and `new URL()` strips the tab, giving `https://evil.com/` (verified).
  - The login page calls `router.push(callbackUrl)` on any string, including `https://evil.com`. Next blocks `javascript:` URLs (`node_modules/next/dist/client/lib/javascript-url.js`) but not external origins.
- **Impact:** a phishing link on the real domain sends the user to an attacker page right after a genuine login. A typical lure is a fake "Session expired, re-enter password" page. In an installed PWA the external page opens inside the app's own window chrome or an in-app browser, which makes the lure more convincing.
- **Recommended fix:** use one helper in both places: `const u = new URL(cb, origin); if (u.origin !== origin) cb = "/"; else cb = u.pathname + u.search;`. Reject any value containing control characters.

#### SEC-011: Unbounded `tenureMonths` lets one request create millions of rows
- **Severity:** Medium (DoS by any signed-in user) · CONFIRMED · **Effort:** S
- **Files:**
  - `src/app/api/loans/route.ts:96-104, 144-160`
  - `src/app/api/loans/[id]/route.ts:52, 62-65, 87-101`
  - `src/app/api/fixed-deposits/[id]/route.ts:18, 22`
  - sync push loan and FD CREATE: `src/app/api/sync/push/route.ts:1142, 984`
- **Evidence:** `POST /api/loans` only checks `tenureMonths > 0`. It then calls `generateAmortizationSchedule(…, tenureMonths, …)` and runs `getNextServerSeq(tx)` plus `loanScheduleEntry.create` once per row, all inside one interactive transaction. `{ "tenureMonths": 10000000 }` is a 30-byte body. The loan PATCH route does the same.
- **Impact:** one request can pin a DB connection and the Node event loop for minutes and fill the sequence and the table. Repeated calls take the instance down.
- **Recommended fix:** validate with zod: `tenureMonths: z.number().int().min(1).max(600)`, principal as a positive safe integer, rate as 0 to 10000 bps, and dates as ISO strings. Batch schedule inserts with `createMany`.

#### SEC-012: REST money routes accept unvalidated types and values (500s, negative and float amounts, free-text enums)
- **Severity:** Medium · CONFIRMED · **Effort:** M
- **Evidence by route:**

  | Route | Problem |
  |---|---|
  | `src/app/api/loans/route.ts:82-96` | No schema. `kind` and `calculationType` are free text. `annualInterestRateBps` may be undefined (NaN rows). `originalPrincipalMinor: "5"` passes the truthiness check and then 500s in Prisma. `paymentDueDay` is only checked when provided. |
  | `src/app/api/loans/[id]/route.ts:50-56` | `calculationType`, `rate` and `residual` come from the body unchecked. |
  | `src/app/api/loans/[id]/schedule/[entryId]/route.ts:47-55` | `interestComponentMinor` and `principalComponentMinor` are untyped: strings give NaN and then a 500, and negatives are accepted. There is no status check, so a PAID installment can be overridden and its history rewritten. `newEmi` is computed and never used. |
  | `src/app/api/fixed-deposits/[id]/route.ts:36-37` | `principalAmountMinor` and `annualInterestRateBps` are written as given. `withholdingTaxRateBps` has no upper bound. `bankName` has no length cap. |
  | `src/app/api/fixed-deposits/[id]/close/route.ts:32-34` | `actualProceedsMinor` is any number. A negative or fractional value creates a negative or fractional INCOME transaction. |
  | `src/app/api/transactions/[id]/route.ts:60` | `amountMinor: Number(body.amountMinor)`: NaN or floats give a 500, and negatives are accepted. `categoryId` is unchecked. |
  | `src/app/api/transactions/route.ts:75, 79` | `categoryId` is unchecked: another user's category is accepted, and a missing one fails the FK with a 500. An invalid `transactionDate` gives a 500. `toAccountId` is stored without a check when `type !== "TRANSFER"`. |
  | `src/app/api/sms/inbox/[id]/post/route.ts:35-36, 105-110` | `body.amountMinor` may be fractional. `body.type` is free text. `categoryId` is unchecked. |
  | `src/app/api/households/route.ts:64`, `transfer-ownership/route.ts:16-17` | `body.name.trim()` throws on non-strings (500). `newOwnerId` is untyped. |
- **Impact:**
  - Corrupted ledgers: negative income, fractional minor units, and unknown `type` values that the ledger code ignores.
  - Unhandled 500s, which the PWA shows as "Request failed" with no guidance.
  - Rewritten PAID loan history.
- **Recommended fix:**
  - Give each route a zod schema. Use `.int().positive()` for money, `z.enum` for every enum, ISO datetime for dates, and bounded strings.
  - Reject overrides of PAID entries.
  - Add a shared `withApi()` wrapper that maps `ZodError` to 400 (SEC-021).

#### SEC-013: Double-submit and race conditions on money-moving endpoints
- **Severity:** Medium (financial integrity; very likely on mobile networks) · CONFIRMED · **Effort:** M
- **Files and evidence:**

  | File | Problem |
  |---|---|
  | `src/app/api/loans/[id]/pay-emi/route.ts:45-62, 72-77, 108` | The loan, entry status and `ACTIVE` checks run **outside** the `$transaction`. Two concurrent requests for the same `scheduleEntryId` both pass and create two EMI transactions and two `LoanPayment` rows. There is no idempotency key. The route also uses `new Date()` instead of `getServerNow()`. |
  | `src/app/api/fixed-deposits/[id]/close/route.ts:29, 54-124` and `deposit-proceeds/route.ts:30, 51-131` | The `status === "CLOSED"` check is followed by 2 or 3 separate writes with no transaction. Deterministic transaction IDs make a second concurrent call fail with an unhandled P2002 (500). A crash between the principal transaction and the FD update leaves the FD ACTIVE, and every retry then 500s forever on the same ID, so the user can never close it. |
  | `src/app/api/sms/inbox/[id]/post/route.ts:23-29, 113-143` | There is no `status === "NEEDS_REVIEW"` check, so the same SMS can be posted any number of times, each time creating a new transaction. The transaction create and the SMS update are not atomic. |
  | `src/app/api/sms/inbox/[id]/merge-transfer/route.ts:94-113` | There is no status check, the two updates are not atomic, and a user transaction can be repurposed repeatedly. |
  | `src/app/api/households/[id]/members/route.ts:78-100` and `src/app/api/auth/register/route.ts:62-99` | Check-then-create, so a concurrent duplicate gives a P2002 500. Registration creates the user, household, member and categories without a transaction, so a failure part-way leaves a user without a household who also cannot re-register. |
- **Impact:** double taps, and the PWA retrying after a timeout, produce duplicate EMI debits, duplicate FD credits and duplicate SMS-posted expenses. A crash can also leave an FD stuck so it can never be closed.
- **Recommended fix:**
  - Claim the row first inside one `$transaction`, for example `updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "PAID" } })` and proceed only if `count === 1`. Apply the same pattern to FD status and SMS status.
  - Accept an `Idempotency-Key` header on the REST money routes.
  - Catch P2002 and return 409.
  - Wrap registration in `$transaction`.

#### SEC-014: No security headers (CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy)
- **Severity:** Medium · CONFIRMED · **Effort:** S
- **Files:** `next.config.ts` (no `headers()`), `src/middleware.ts` (sets none)
- **Evidence:** nothing in the repo sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`.
- **Impact:**
  - The web version can be framed, which enables clickjacking of "Delete account" and member-management actions.
  - Nothing limits the damage of any future XSS, and that damage would include reading the per-user IndexedDB ledger.
  - The first request on a new network can be downgraded unless the host adds HSTS.
- **Recommended fix:** add `headers()` in `next.config.ts` with:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - a CSP with `frame-ancestors 'none'` and `connect-src 'self'` plus the push service origins

  Check the CSP against Next's inline runtime scripts (nonce support) before enforcing it.

#### SEC-015: In-memory rate limiter is spoofable, per-instance, unbounded, and lets anyone lock a victim out
- **Severity:** Medium · CONFIRMED · **Effort:** M
- **Files:** `src/lib/rate-limit.ts:1-12`; `src/app/api/auth/login/route.ts:28-37`; `src/app/api/auth/register/route.ts:35-59`
- **Evidence:**
  - The IP key comes from `x-forwarded-for` (first entry), which the client controls unless a trusted proxy overwrites it.
  - The limiter is a module-level `Map`. Entries are reset but never deleted.
  - Counting happens before the password check, and every attempt counts, including successful ones.
- **Impact:**
  - A random `X-Forwarded-For` per request bypasses the IP limit, so credential stuffing across many emails is not limited at all.
  - Ten wrong guesses lock the real user out for 15 minutes. This is a cheap, repeatable denial of service against a known email.
  - Random keys grow the `Map` without bound (memory DoS).
  - With more than one instance, each instance has its own counters.
- **Recommended fix:**
  - Read the client IP only from the platform's trusted header, or from `request.ip` behind a configured proxy.
  - Store counters in Postgres or Redis with a TTL.
  - Count failures only, and prefer exponential back-off per email over a hard lockout.
  - Prune expired buckets.
  - Cap concurrent Argon2 operations.
  - Add `.max(128)` to the login password schema (`login/route.ts:13`); today any length reaches Argon2.
  - Raise the register minimum from 6 to at least 10 characters (`register/route.ts:17`).

#### SEC-016: VAPID public key is baked in at build time and the fallback key is invalid
- **Severity:** Medium · CONFIRMED (build output and node decode) · **Effort:** S
- **File:** `src/app/api/push/vapid-public-key/route.ts:3-9`
- **Evidence:**
  - `pnpm build` lists `○ /api/push/vapid-public-key` as Static. Next prerenders the GET handler, so the response contains whatever `VAPID_PUBLIC_KEY` was at **build** time. Docker builds normally do not have runtime secrets.
  - The fallback `"BEl62iUY…UED850="` decodes to 64 bytes. A P-256 application server key must be 65 bytes, so `pushManager.subscribe` would reject it.
  - `docker-compose.yml` does not pass `VAPID_*` to the container at all.
- **Impact:** once SEC-007 is fixed, push subscription will fail, or will use a key that does not match the server's private key, unless the key is present at build time. The failure is silent.
- **Recommended fix:**
  - Call `await connection()` (from `next/server`) in the handler so it renders at request time. Alternatively, inject the key into the client at runtime.
  - Remove the fallback.
  - Fail fast in production when `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is missing.

#### SEC-017: Encryption key rotation is broken: ciphertext has no key ID, so a reordered keyring makes Gemini keys unreadable
- **Severity:** Medium · CONFIRMED · **Effort:** S
- **File:** `src/lib/encryption.ts:23, 32, 48-52`
- **Evidence:**
  - `encryptAesGcm` encrypts with the **first** keyring entry but always writes the 4-part `v1:iv:tag:ct` format, with no key ID.
  - `decryptAesGcm` maps every 4-part value to `kid = "current"`.
  - With `APP_ENCRYPTION_KEYS="new:<hex>,current:<old>"`, new values are encrypted with `new` and decrypted with `current`, so the auth tag fails. When no `current` entry exists, decryption throws `Unknown encryption key id`.
  - The 5-part `v2:<kid>:…` format is parsed but never produced.
- **Impact:** the first attempt to rotate keys makes stored Gemini API keys undecryptable. The settings page then shows `••••****`, and the SMS worker's Gemini fallback fails for every user.
- **Recommended fix:** write `v2:<kid>:<iv>:<tag>:<ct>` using the first entry's key ID. Keep reading `v1` with `current`. Add a unit test that rotates keys.

#### SEC-018: Session lifecycle does not fit an offline-first PWA
- **Severity:** Medium · CONFIRMED · **Effort:** M
- **Files:** `src/lib/auth.ts:45`; `src/app/api/auth/login/route.ts:72-79`; `src/app/api/auth/logout/route.ts:7-8`; `src/lib/sync/client.ts:41-44, 73-76`; `src/middleware.ts:44-50`
- **Evidence:**
  - The JWT and cookie expire after exactly 7 days, with no sliding renewal.
  - When push or pull returns 401, `syncNow` calls `onStateChange("idle")` and returns. The client shows no error and no re-login prompt, and outbox items stay pending.
  - Logout increments `sessionVersion`, which signs the user out on **every** device.
  - Middleware checks only the signature, so revoked tokens still load app pages, and only API calls fail.
  - There is no password change, password reset or account deletion endpoint.
- **Impact:** a week after login, the installed app keeps working offline and shows "idle". The user keeps adding transactions that never reach the server or the partner's phone, with no visible cue. Signing out of an old tablet also signs out the user's phone. A stolen cookie cannot be revoked without signing out everywhere.
- **Recommended fix:**
  - Re-issue the token when it is past half-life on authenticated requests (sliding session), or add a refresh token.
  - Surface 401 from sync as a "Signed out, sign in to sync N pending changes" banner.
  - Support per-device sessions (a `Session` table with `jti`) so logout revokes one device, and offer "log out everywhere" as a separate action.
  - Add password change and reset flows that bump `sessionVersion`.

#### SEC-019: The sync cursor can permanently skip rows, because serverSeq is allocated before commit
- **Severity:** Medium (High for data correctness) · CONFIRMED by design · **Effort:** L
- **Files:** `src/lib/server-seq.ts:10`; `src/app/api/sync/push/route.ts:117`; `src/app/api/sync/pull/route.ts:174-216`; every writer that calls `getNextServerSeq()` before its write
- **Evidence:** suppose request A takes seq 100 and request B takes seq 101, and B commits first. A device that pulls between the two commits receives 101 and sets its cursor to 101. Row 100 commits later and is never returned to that device, because pull filters `serverSeq > cursor`.
- **Impact:** devices silently diverge under concurrent writes. Concurrent writes are routine here: two household members syncing at once, or cron writing while a user syncs. The partner's phone can permanently miss a transaction.
- **Recommended fix:** return a safe watermark instead of `max(serverSeq)`. One option is to lag the cursor behind the oldest in-flight sequence using `pg_snapshot_xmin(pg_current_snapshot())` together with a `txid` column. Another is to allocate the sequence inside the same transaction and have pull exclude rows newer than N seconds. Offer a "full resync" escape hatch.

#### SEC-020: Unbounded sync push/pull and SMS lists, and crash-prone parsing
- **Severity:** Medium · CONFIRMED · **Effort:** M
- **Files:** `src/app/api/sync/pull/route.ts:13, 45-172`; `src/app/api/sync/push/route.ts:58-85, 116`; `src/app/api/sms/activity/route.ts:25-39`; `src/app/api/sms/inbox/route.ts:11-17`
- **Evidence:**
  - `BigInt(searchParams.get("cursor"))` throws on `abc` or `1.5`, giving a 500.
  - The pull runs 14 `findMany` calls with no `take`.
  - Push accepts any number of mutations up to the 10 MB proxy buffer, processes them sequentially with 3 to 8 queries each, and has no schema.
  - The sort comparator calls `a.entity.toLowerCase()` outside `try`, so one mutation without `entity` makes the whole batch 500. The same applies to `mutation.entity.toLowerCase()` at `:116`, which is inside `try` but is reached after the sort.
  - Unknown entities (for example `creditcardstatement`) match no handler and are recorded as applied and `accepted`.
  - SMS activity returns every row, including `rawMessage`, in one response.
- **Impact:**
  - First sync for a long-lived user downloads everything at once. This is slow on mobile data and can exceed memory on low-end phones.
  - A single large push is a cheap DoS.
  - Malformed client data blocks the whole outbox.
  - Silently "accepted" unknown mutations are lost.
- **Recommended fix:**
  - Validate the cursor (`/^\d+$/`).
  - Paginate the pull with `take` plus `hasMore`.
  - Cap push at about 200 mutations per request.
  - Validate each mutation with a zod discriminated union before sorting, and reject unknown entities.
  - Paginate the SMS lists.

#### SEC-021: Internal error messages and full financial payloads leak to clients and logs
- **Severity:** Medium · CONFIRMED · **Effort:** M
- **Files:** `src/app/api/sync/push/route.ts:1327-1333`; `src/app/api/v1/webhooks/sms-ingress/route.ts:172`; `src/app/api/test/[...slug]/route.ts:643-646`; most routes have no `try/catch`
- **Evidence:**
  - `console.error("Mutation failed:", mutation, err)` logs the full mutation, including amounts, notes and account last-4 digits.
  - `reason: err.message` returns raw Prisma messages, with model and field names, to the client. `src/lib/sync/client.ts:53-56` stores that message in the outbox, and the UI shows it.
  - The other routes have no common error shape, and Prisma errors (P2002, invalid dates) become bare 500s.
- **Impact:**
  - Information disclosure about the schema.
  - Sensitive data in logs, which contradicts PRD §795.
  - Mobile users see messages like "Invalid `prisma.transaction.upsert()` invocation" instead of something they can act on.
- **Recommended fix:** add a `withApi(handler)` wrapper that does the following:
  - maps zod errors to 400, P2002 to 409 and P2025 to 404, and anything else to a 500 with a generic message and a request ID;
  - logs only the request ID, `mutationId`, `entity`, `op` and the error code;
  - returns stable `{ error, code }` bodies that the client can turn into friendly text.

#### SEC-022: `docker-compose.yml` publishes Postgres on every interface with default credentials, and its Dockerfile is missing
- **Severity:** Medium (High if deployed as-is) · CONFIRMED · **Effort:** S
- **File:** `docker-compose.yml:7-11, 21-23, 28-37`
- **Evidence:**
  - `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}` and `ports: "5432:5432"` publish the database on all interfaces.
  - `dockerfile: Dockerfile` does not exist in the repo.
  - `VAPID_*`, `GEMINI_PROVIDER` and `APP_ENCRYPTION_KEYS` are not passed to the `web` container.
  - `AUTH_SECRET` and `CRON_SECRET` are passed as `${VAR}` without `:?`. The app fails closed for `AUTH_SECRET` at startup, but compose itself gives no error.
- **Impact:** on a VPS, the financial database is reachable from the internet with `postgres/postgres`. The compose stack cannot be built.
- **Recommended fix:**
  - Bind Postgres to `127.0.0.1`, or do not publish it at all.
  - Require the password with `${POSTGRES_PASSWORD:?}`.
  - Add a Dockerfile using `output: "standalone"`.
  - Pass every required variable with `:?`.

#### SEC-023: Any user can test whether any email is registered and learn the owner's name and ID
- **Severity:** Medium · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/users/search/route.ts:18-35`; `src/app/api/households/[id]/members/route.ts:62-75`; `src/app/api/auth/register/route.ts:61-70`; `ALLOW_REGISTRATION` defaults to `true` (`.env.example`, `docker-compose.yml:33`)
- **Evidence:**
  - `GET /api/users/search?email=` returns `{ id, name, email }` for any exact match, with no rate limit. No client code calls this route.
  - Member add returns 404 "User not found" for unknown emails and accepts raw `userId` values.
  - Register returns 409 "already exists". The login timing equalization at `login/route.ts:44-46` does not help, because the other routes reveal the same information directly.
- **Impact:** with open registration, anyone can create an account and enumerate which emails use a finance app, together with real names. This feeds phishing and makes the forced-membership behaviour (SEC-024) easier to aim.
- **Recommended fix:**
  - Delete `users/search`, which is unused.
  - Rate-limit member add.
  - Accept only email, not raw `userId`, from the client.
  - Consider a generic response for registration ("check your email").
  - Default `ALLOW_REGISTRATION` to `false` for a household deployment.

#### SEC-024: Household membership edge cases
- **Severity:** Medium · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/households/[id]/members/[memberId]/route.ts:113-140`; `src/app/api/households/[id]/members/route.ts:94-100`; `src/app/api/transactions/[id]/route.ts:31, 95`; `src/app/api/households/[id]/transfer-ownership/route.ts:16-52`
- **Evidence:**
  - **CO_OWNER removal:** a CO_OWNER can DELETE another CO_OWNER. The only blocked target is `OWNER`. PATCH on the same file blocks CO_OWNER changing CO_OWNER (`:61-63`), so the two methods disagree.
  - **Forced membership:** members are added "directly (no acceptance step)", as the PRD specifies. Anyone who knows an email can therefore push their household into the victim's account, and its shared accounts and transactions then sync to the victim's phone.
  - **Removed members keep edit rights:** `transactions/[id]` PATCH and DELETE allow `!member && tx.userId === user.id`, so a removed member can still edit shared transactions they created. The PRD says pushes from removed members are rejected.
  - **Transfer ownership:** `newOwnerId` is untyped. Self-transfer is accepted. A missing owner membership row throws P2025 (500).
  - **Household POST:** no length cap on `name` and no per-user household cap.
- **Impact:** a CO_OWNER can remove peers, which is a lateral takeover. Unwanted shared data can be pushed onto a user's phone. Removed members can still alter shared history.
- **Recommended fix:**
  - Mirror the PATCH rule in DELETE.
  - Add an accept/decline step, or at least a "leave and block" option and a notification.
  - Reject writes from non-members even when they created the row.
  - Validate the transfer-ownership and household bodies with zod.

#### SEC-025: Push subscriptions can be rebound across users and are not validated
- **Severity:** Medium (Low until real delivery exists) · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/push/subscribe/route.ts:6-51`; `public/sw.js:155-170`
- **Evidence:**
  - `upsert({ where: { endpoint }, update: { userId: session.userId, … } })` hands an existing endpoint to whoever posts it.
  - `endpoint: z.string().url()` accepts `http:` and internal hosts.
  - The `p256dh` and `auth` values are never length- or format-checked.
  - There is no cap on subscriptions per user.
  - Subscribing silently sets `pushRemindersEnabled: true`.
  - In the service worker, `notificationclick` opens `event.notification.data.url` without checking that it is same-origin.
- **Impact:**
  - Once delivery exists (SEC-007), the server will POST to attacker-chosen URLs, which is SSRF towards internal services.
  - Someone who learns another user's endpoint can steal or silence that user's reminders.
  - The subscription table can be filled without limit.
  - A forged push could open an external phishing page.
- **Recommended fix:**
  - Require `https:` and allowlist the push-service hosts (FCM, Mozilla autopush, Apple, WNS).
  - Check that `p256dh` decodes to 65 bytes and `auth` to 16 bytes (base64url).
  - Allow a rebind only when the existing row has the same `userId`.
  - Cap subscriptions at about 10 per user.
  - In `sw.js`, open only same-origin paths: `new URL(url, self.location.origin).origin === self.location.origin`.

### 3.4 Low-severity findings

#### SEC-026: SMS webhook hardening gaps
- **Severity:** Low · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/v1/webhooks/sms-ingress/route.ts:46-72, 118-145`; `src/app/api/sms/inbox/[id]/retry/route.ts:33`; `prisma/schema.prisma:19`; `src/lib/sms/account-matcher.ts:31-33`
- **Evidence:**
  - **Rate limiting:** there is no limit before authentication, and invalid keys always cost a DB query. `apiKeyHash` has neither `@unique` nor an index.
  - **Dedupe race:** the dedupe check-then-create races into a P2002 500.
  - **receivedAt:** any parseable date is accepted, including far-future dates. A future date then suppresses balance hints for every later SMS ("newer SMS" check).
  - **Retry:** `retry` runs Gemini synchronously, with no limit, using the user's own key.
  - **Matcher wildcard:** the matcher treats an empty `bankSenderIds` entry as a wildcard (`"X".includes("")`).
- **Recommended fix:**
  - Add an IP limit before the lookup.
  - Make `apiKeyHash` `@unique`.
  - Catch P2002 and return DUPLICATE.
  - Bound `receivedAt` to within ±7 days of now.
  - Rate-limit retry.
  - Ignore sender IDs shorter than 3 characters.

#### SEC-027: Cron endpoint edge cases
- **Severity:** Low · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/v1/cron/tick/route.ts:14-15`; `src/lib/jobs/cron-runner.ts:52-90, 513-548`
- **Evidence:**
  - **Compare crash:** the length check compares JavaScript string lengths, but `timingSafeEqual` compares byte lengths. A header with multi-byte characters and the same string length makes `timingSafeEqual` throw outside the `try`, giving a 500 instead of a 401.
  - **Cost:** each tick loads all of a user's transactions for every budget and walks every month since the first one, so the cost grows without bound.
  - **Locking:** there is no lock against overlapping ticks.
- **Recommended fix:**
  - Compare `Buffer.byteLength` values, or compare SHA-256 digests of both values.
  - Take `pg_try_advisory_lock` per tick.
  - Restrict the work to the current and previous month.

#### SEC-028: `middleware.ts` is deprecated in Next 16, and the Edge gate does not check session revocation
- **Severity:** Low · CONFIRMED (build warning and bundled docs) · **Effort:** S
- **File:** `src/middleware.ts`
- **Evidence:**
  - The build warns: `The "middleware" file convention is deprecated. Please use "proxy" instead.`
  - The middleware duplicates the secret logic from `auth.ts` and checks only the JWT signature, not `sessionVersion`.
  - Under Next 16, `proxy.ts` runs on Node.js. That would let it reuse `verifySessionToken`, though it would then hit the database on every navigation.
- **Recommended fix:**
  - Run `npx @next/codemod@canary middleware-to-proxy .`.
  - Import a single shared secret module.
  - Decide whether page navigations should check `sessionVersion`. A cheap option is a short-TTL cache.

#### SEC-029: CSRF relies on `SameSite=Lax` alone, and JSON is parsed regardless of Content-Type
- **Severity:** Low · SUSPECTED (depends on the deployment domain) · **Effort:** S
- **Files:** every mutating route (`request.json()`); cookie set at `src/app/api/auth/login/route.ts:72-79`
- **Evidence:**
  - Nothing checks `Origin` or `Sec-Fetch-Site`.
  - `request.json()` parses `text/plain` bodies, which cross-site forms can send.
  - `Lax` blocks cookies on cross-site POSTs, but not on requests from sibling subdomains, which count as same-site.
  - `secure` depends on `NODE_ENV`, so staging over HTTP sends the cookie in clear text.
- **Recommended fix:**
  - In middleware or proxy, reject state-changing `/api/*` requests whose `Origin` is not `APP_URL`. Exempt the webhook and cron routes.
  - Require `Content-Type: application/json`.
  - Name the cookie `__Host-hardmoney_session`.
  - Derive `secure` from `APP_URL` starting with `https:`.

#### SEC-030: Settings endpoints accept invalid values
- **Severity:** Low · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/user/settings/route.ts:6-11, 38-46`; `src/app/api/user/gemini-settings/route.ts:58-73`; `src/app/api/push/settings/route.ts:8`
- **Evidence:**
  - `timezone` can be any string. Cron then silently falls back to "20:00" at `cron-runner.ts:536`.
  - `defaultWithholdingTaxRateBps` allows negatives, floats and values above 10000.
  - `name` has no maximum length.
  - `smsAutoPostMode` and `geminiModel` can be any non-empty string. A typo in the mode silently means auto-post.
  - The reminder time regex `^\d{2}:\d{2}$` accepts `99:99`.
- **Recommended fix:**
  - Validate the timezone with `Intl.supportedValuesOf("timeZone")`.
  - Use `z.number().int().min(0).max(10000)` for the tax rate.
  - Use `z.enum([...])` for the mode, and `^gemini-[\w.-]{1,40}$` for the model.
  - Use `^([01]\d|2[0-3]):[0-5]\d$` for the reminder time.
  - Cap `name` at 100 characters.

#### SEC-031: Global idempotency keys, and fixture code that remains in sync push
- **Severity:** Low · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/sync/push/route.ts:97-104, 1313-1323` (idempotency), `:830-869` (installment plan auto-create), `:763-777` (budget auto-creates "Budgeted Category")
- **Evidence:**
  - **Idempotency:** `AppliedMutation` is keyed by `mutationId` alone. Another user's mutation with the same ID counts as already applied. The idempotency row is written after the effects and outside any transaction.
  - **Fixture code:** installment plan CREATE still contains the "Apex Visa Platinum" auto-create block, with a 500,000.00 limit. The generic account check now makes the account branch unreachable, because a non-existent account fails `assertCanWriteAccount`. The "General" and "Budgeted Category" auto-creates are still reachable and accept a client-chosen ID.
- **Recommended fix:**
  - Use a composite `(userId, mutationId)` key.
  - Wrap each mutation and its idempotency row in one `$transaction`.
  - Delete the fixture auto-creates and reject missing references.

#### SEC-032: Inconsistent household access across REST routes
- **Severity:** Low (functional) · CONFIRMED · **Effort:** S
- **Files:** `src/app/api/loans/route.ts:17-18` (GET lists owner loans only); `src/app/api/fixed-deposits/[id]/route.ts:14` (PATCH is owner-only); compare with sync push FD UPDATE, which allows OWNER and CO_OWNER
- **Impact:** a CO_OWNER can close a shared FD (`authorizeFixedDeposit`) but cannot edit it through REST. The loan list hides shared loans that the detail route would return.
- **Recommended fix:** route all three through the corrected helpers from SEC-004.

#### SEC-033: The health endpoint checks no dependencies and exposes the test clock
- **Severity:** Low · CONFIRMED · **Effort:** S
- **File:** `src/app/api/health/route.ts:4-11`
- **Evidence:** the endpoint returns `ok` without touching the DB. It publishes `uptime` and `getServerNow()`, which reflects the overridable test clock.
- **Recommended fix:** run `SELECT 1` with a timeout, return 503 on failure, and drop `uptime`.

#### SEC-034: Logout leaves the financial ledger and cached pages on the device
- **Severity:** Low (personal phones), Medium (shared devices) · CONFIRMED · **Effort:** S
- **Files:** `src/app/more/page.tsx:48-55`; `src/lib/db/dexie.ts:148-175`; `public/sw.js:75-85`
- **Evidence:**
  - Logout clears React Query and `localStorage.hardmoney_active_user`.
  - The per-user Dexie database `hardmoney-<userId>` stays on the device, holding every transaction, balance, FD and loan in plain IndexedDB.
  - The service worker keeps cached navigations.
  - Pending outbox items from the logged-out user also stay behind.
- **Recommended fix:**
  - On explicit logout, warn about unsynced items, then `Dexie.delete("hardmoney-<id>")` and clear `caches`.
  - Offer "keep data on this device" for single-user phones.

#### SEC-035: Lint fails, and nothing tests the authorization layer
- **Severity:** Low (process) · CONFIRMED (commands run) · **Effort:** M
- **Evidence:**
  - `pnpm lint` reports 142 errors. Most are `any` casts in the security-relevant routes, and `(prisma as any)` turns off type checking exactly where the authorization bugs above live.
  - The 62 Vitest tests cover finance math, parsing, encryption and one modal, but no route or authorization helper.
  - The Playwright suite `s19-household.spec.ts` exists but was not run (it needs a server and a database).
- **Recommended fix:**
  - Remove the `as any` casts. The Prisma client already types these models.
  - Add route-level tests: Vitest with a test database, or Playwright API tests in the CI gate. Cover role × entity × op, the cross-user ID cases in SEC-001 to SEC-004, and double-submit cases.

---

## 4. Recommended remediation order

1. **Same day:**
   - SEC-001, SEC-002 and SEC-003: sync push authorization. Load the row, authorize it, then write. Never upsert blindly.
   - SEC-004: tighten `authorizeLoan` and `authorizeFixedDeposit`.
   - SEC-005 and SEC-006: stop logging and holding raw SMS.
   - SEC-008: lock down the test GET routes.
2. **This week:**
   - SEC-011 and SEC-012: zod on every REST body.
   - SEC-013: atomic claims and idempotency keys.
   - SEC-009, SEC-010, SEC-014, SEC-015, SEC-022, SEC-024.
3. **Before advertising reminders:** SEC-007, SEC-016 and SEC-025, which together deliver real Web Push.
4. **Data correctness:** SEC-019 and SEC-020 (sync watermark, pagination and schema), SEC-017 (key IDs in ciphertext).
5. **PWA session experience:** SEC-018 (sliding sessions and a visible "signed out, N changes pending" state), SEC-034.
6. **Cleanup:** SEC-021, SEC-023 and SEC-026 to SEC-035.

---

## 5. Comparison with earlier run

I audited the code first and wrote sections 1 to 4 before reading `audit/2026-10-20/backend-security.md`, which uses IDs F-001 to F-059.

Some of that report's evidence does not match the current code: it quotes a 30-day JWT, a `padEnd` secret, a default cron secret, a `/api/shortcuts/download` route and no `migrations/` folder. It also could not run lint, typecheck or build, because `node_modules` was missing at the time. The "looks fixed" column below compares its claims with the code at `0c401ec`.

### 5.1 Earlier findings still present

| Earlier ID | Earlier title (short) | Now | Notes |
|---|---|---|---|
| F-001 | Loan schedule/payment without authorization | **SEC-001** | Unchanged. |
| F-002 | CREATE upserts overwrite others' rows | **SEC-002** | Still present for account, transaction, template, installment plan, FD, loan, and now shopping items. Category is fixed (see 5.2). |
| F-003 | Transaction CREATE/UPDATE/DELETE holes | **SEC-003**, **SEC-009** | The non-member fall-through, `createdByUserId` spoofing and household injection through `payload.householdId` remain. The "post into any private account" part is fixed by the generic `assertCanWriteAccount` pre-check. |
| F-006 | "Apex Visa Platinum" fixture | **SEC-031** (downgraded) | The code is still there. The account branch is now unreachable; the category auto-creates are still reachable. |
| F-007 | Test backdoor | **SEC-008** (narrowed) | POST is fixed. GET is still open whenever `E2E_MODE=1`. |
| F-013 | Account scope change half-applied | **SEC-009** (changed) | UPDATE now writes `householdId`, but without a membership check on the target household. The transaction now inherits the household only when the account is SHARED, which fixes the private-leak half. |
| F-014 | CO_OWNER lateral actions | **SEC-024** (narrowed) | Adding a CO_OWNER and PATCHing a CO_OWNER now require OWNER, and zod was added. DELETE of a CO_OWNER by a CO_OWNER is still allowed. |
| F-015 | Leaving or removal doesn't touch resources | **SEC-024** (partly) | Removed creators can still edit their shared transactions through REST and sync. Role-downgrade re-sanitization is unchanged (not re-verified at runtime). |
| F-016 | Open redirect | **SEC-010** | The middleware regex was added, but the tab and newline bypass works (verified). The login page still has no validation. |
| F-017 | Weak password policy | Partly fixed; noted under SEC-015 | Register now caps the password at 128 characters and the name at 100, but the minimum is still 6. Login has no maximum, so any length reaches Argon2. Recommendation: minimum 10 characters, maximum 128 on login too. |
| F-018 | Registration not atomic | **SEC-013** | Unchanged. |
| F-019 | Email enumeration | **SEC-023** | Login timing is fixed with a dummy verify. `users/search`, member add and the register 409 still reveal registered emails. |
| F-026 | CSRF relies on Lax | **SEC-029** | Unchanged. |
| F-027 | `secure` by NODE_ENV, no security headers | **SEC-014**, **SEC-029** | Unchanged. |
| F-029 | `middleware.ts` deprecated | **SEC-028** | Unchanged. Now confirmed by the build warning. |
| F-030 | pay-emi double payment | **SEC-013** (narrowed) | The PAID-entry check, the `ACTIVE` check and the `not: "PAID"` soft-delete filter were added. The race (reads outside the transaction, no idempotency key) and the `new Date()` usage remain. |
| F-031 | Schedule override PATCH | **SEC-012** | Unchanged: no types and PAID entries can be overridden. |
| F-032 | FD close/proceeds non-atomic | **SEC-013**, **SEC-012** | The maturity check and `deletedAt` filter (through `authorizeFixedDeposit`) were added. The writes are still non-atomic, and negative or fractional `actualProceedsMinor` is still accepted. |
| F-033 | SMS post replay | **SEC-013** | Unchanged. |
| F-034 | Sync cursor skips rows | **SEC-019** | Unchanged. |
| F-035 | Unbounded pull/push, bad cursor 500 | **SEC-020** | Unchanged. |
| F-036, F-037 | Cron cost and locking | **SEC-027** | Unchanged. Not re-verified in detail. |
| F-038 | Push reminders never delivered | **SEC-007**, **SEC-016** | Still not delivered. The static prerender, which the earlier run SUSPECTED, is now CONFIRMED by the build output. |
| F-039 | `setTimeout` worker | (out of my area's new findings; still present at `sms-ingress/route.ts:152`) | Unchanged. |
| F-040 | Gemini keeps raw SMS in memory | **SEC-006** | Unchanged. |
| F-041 | Gemini settings accept anything | **SEC-030** | Unchanged. |
| F-042 | Settings timezone and tax | **SEC-030** | Unchanged. |
| F-043 | Push endpoint SSRF and rebind | **SEC-025** | Unchanged. |
| F-044, F-045 | Error messages and payload logging | **SEC-021** | Unchanged. |
| F-046 | docker-compose | **SEC-022** | Partly fixed: `CRON_SECRET` is now passed and `E2E_MODE` defaults to 0. Postgres exposure, default credentials and the missing Dockerfile remain. |
| F-048, F-049 | Webhook rate limit, index and dedupe race | **SEC-026** | The limit is still per-process and post-auth, `apiKeyHash` is unindexed, and the dedupe race remains. |
| F-050, F-051, F-052 | Unknown entities, global idempotency, non-atomic push | **SEC-020**, **SEC-031** | Unchanged. |
| F-054 | Empty sender ID wildcard | **SEC-026** | Unchanged. |
| F-056 | Health without dependency checks | **SEC-033** | Unchanged. |
| F-057, F-058 | Household creation limits, transfer-ownership edge cases | **SEC-024** | Unchanged. |
| F-059 | Dead endpoints | **SEC-023** (`users/search`) | `loans` POST and `transactions` POST/PATCH are still unused by the client but now have authorization. `users/search` is still unused and still enumerates emails. |

### 5.2 Earlier findings that look fixed

| Earlier ID | What changed in the code |
|---|---|
| F-004 | Sync push now runs `assertCanWriteAccount` on `accountId`, `toAccountId`, `fundingAccountId`, `linkedPayoutAccountId`, `linkedDisbursementAccountId` and `linkedSettlementAccountId` for every non-account entity (`sync/push/route.ts:117-129`). |
| F-005 | Category CREATE loads the existing row and rejects non-owned and system rows (`:362-366`), and requires OWNER/CO_OWNER for `householdId` (`:368-371`). |
| F-008 | `POST /api/transactions` uses `assertCanWriteAccount`, integer and positive amount checks, and a type enum (`transactions/route.ts:30-37`). |
| F-009 | pay-emi checks the account with `assertCanWriteAccount` (`pay-emi/route.ts:43-44`). |
| F-010 | FD close and deposit-proceeds check `targetAccountId` (`close/route.ts:40-42`, `deposit-proceeds/route.ts:39-41`). |
| F-011 | `POST /api/loans` checks the disbursement account and assigns `serverSeq` to every row (`loans/route.ts:109-111, 116, 145, 165`). Validation is still missing (SEC-011, SEC-012). |
| F-012 | Shared loans and FDs are reachable through `authorizeLoan` and `authorizeFixedDeposit`, but these are now too permissive (SEC-004). |
| F-020 | `AUTH_SECRET` fails closed in production (`auth.ts:7-10`, `middleware.ts:5-8`), and `padEnd` is gone. Confirmed: the build fails without it. |
| F-021 | The encryption keyring throws in production when no key is configured (`encryption.ts:14`) and requires 64 hex characters. The rotation format is still broken (SEC-017, new). |
| F-022 | Cron returns 503 when `CRON_SECRET` is unset, uses `timingSafeEqual`, and the debug log is gone. A minor byte-length edge remains (SEC-027). |
| F-023 | `/api/v1/webhooks` is in `PUBLIC_PATHS` (`middleware.ts:20`). |
| F-024 | Login and register have rate limits. The limiter itself is weak (SEC-015, new). |
| F-025 | The JWT now lasts 7 days, `sessionVersion` is checked on every API call, logout revokes, and `/api/auth/session` returns 401 when the user is missing. Remaining PWA problems are in SEC-018. |
| F-028 | The middleware static skip now matches only image extensions (`middleware.ts:33`). |
| F-047 | `prisma/migrations/` now has 4 migrations. The runtime `CREATE SEQUENCE` fallback remains (`server-seq.ts:19`), and no migration creates `global_server_seq`. |
| F-055 | `/api/shortcuts/download` no longer exists. The Shortcuts page still shows the placeholder URL `https://your-domain.com/...` (`src/app/more/shortcuts/page.tsx:121`), which is a UI issue. |

F-053 (SMS balance hints don't sync) is in the SMS domain and I did not re-verify it in this pass.

### 5.3 Missed by the earlier run, or new since then

| New ID | Why it is new |
|---|---|
| SEC-004 | A regression introduced by the fix for F-012: the new helpers let CONTRIBUTOR_ADD_ONLY read and write shared loans and FDs. |
| SEC-005 | New since the earlier run: commit `da48e4f` logs raw SMS bodies and user emails in production, and redacts only in E2E mode, which hides the leak from the log-secrecy test. |
| SEC-007 | Missed: the client registers a hardcoded **fake** push subscription. The earlier run noted that the server doesn't deliver, but not that the client never really subscribes. |
| SEC-010 (bypass detail) | The earlier fix recommendation (`^/(?!/\|\\)`) is the regex that now ships. The tab and newline bypass defeats it, which I verified with node. |
| SEC-011 | Missed: unbounded `tenureMonths` gives one-request resource exhaustion in REST and sync. |
| SEC-015 | New, because the rate limiter is new: `X-Forwarded-For` spoofing, unbounded memory, and a victim-lockout DoS. |
| SEC-016 (invalid key) | Missed: the fallback VAPID key is 64 bytes and therefore not a valid P-256 key. |
| SEC-017 | New, because the keyring is new: ciphertext carries no key ID, so rotation breaks decryption. |
| SEC-018 | Missed: the sync client swallows 401 as "idle", so after the 7-day expiry the PWA silently stops syncing. Logout also signs out every device. |
| SEC-024 (removed creator) | Missed: `transactions/[id]` PATCH and DELETE still let a removed member edit shared rows they created. |
| SEC-025 (`sw.js`) | Missed: `notificationclick` opens an unvalidated URL. |
| SEC-002 (shopping items, currency) | Partly missed: shopping-list items are also rebound by CREATE upsert, and the account upsert's update branch silently resets `currency` to LKR. |
| SEC-034 | Missed: logout leaves the per-user Dexie ledger and the service-worker caches on the device. |
| SEC-035 | The command results are new: lint fails with 142 errors; tsc, vitest (62/62) and the build (with a throwaway secret) pass. The earlier run could not run these. |

---

## 6. What I could not verify

- **Live behaviour:** I ran no request against a running server. No dev server and no database are allowed in this audit. The authorization findings come from reading the code, and the code paths are unambiguous.
- **Playwright:** `tests/e2e/s19-household.spec.ts` (forged-write tests) and `s14-sms-ingress.spec.ts` were not run, because they need a server and a database.
- **Proxy and `X-Forwarded-For`:** whether the production host overwrites `X-Forwarded-For` (SEC-015). If a trusted proxy replaces it, the spoofing part does not apply.
- **Client behaviour on downgrade:** client purging after a role downgrade (part of F-015 from the earlier run).
- **CSP compatibility:** whether a strict CSP breaks Next's inline runtime under `cacheComponents` (SEC-014). Test it in report-only mode first.

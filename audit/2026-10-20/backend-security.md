# Hard Money: Backend / API / Security / Authorization Audit

Date: 2026-10-20 · Scope: `src/app/api/**`, `src/middleware.ts`, `src/lib/**` used by routes, `prisma/schema.prisma`, `.env.example`, `docker-compose.yml`, `next.config.ts`
Mode: read-only. No code changes, no DB access, no dev server.

Labels:
- CONFIRMED: the code is unambiguous, or I verified it by running something.
- SUSPECTED: likely, but depends on runtime, build, or client behavior I could not run.

Effort: S = under 2h, M = half a day to 2 days, L = more than 2 days or a redesign.

---

## 0. Commands run and results

| Command | Result |
|---|---|
| `ls node_modules` | **No `node_modules`.** Dependencies are not installed. |
| `pnpm exec tsc --noEmit` / `pnpm lint` | **Not run.** Corepack stopped at an interactive prompt to download pnpm 12.6.0, and the command timed out after 300 s with exit 137. Installing dependencies would change the workspace (and needs the network), so I skipped it as out of scope. Lint, typecheck and build are **unverified**. |
| `pnpm build` | Not attempted for the same reason. |
| `ls node_modules/next/dist/docs` | Missing because of the above. I checked Next.js 16 behavior against the official docs online (nextjs.org: "Renaming Middleware to Proxy", "Route Handlers › With Cache Components"). |
| `git log --all --name-only` + `git ls-files` + `git grep` for key patterns | Only `.env.example` is tracked. No real secrets in history. Test files contain only mock keys (`AIzaSyTestSecretKey1234abcd`). |
| `node -e` semantics checks | `"" \|\| "insecure-dev…"` falls back to the hardcoded secret. `"abc".padEnd(32,"0")` gives `abc000…`. `BigInt("abc")` throws `SyntaxError`. `Number("abc")` is `NaN`. `"100"+"50"` is `"10050"`. `"/accounts/x.y".includes(".")` is `true`. |
| `node -e new URL("//evil.example/phish","https://app.local/login")` | Resolves to `https://evil.example/phish`, which confirms the open redirect (F-016). |
| `ls Dockerfile` | **Does not exist**, but `docker-compose.yml` refers to it. |
| `ls prisma` | Only `schema.prisma`. There is **no `migrations/` directory**. |

---

## 1. How the backend currently works

### 1.1 Stack
- Next.js 16.4 (App Router) with `cacheComponents: true`, `reactCompiler: true`, and Route Handlers under `src/app/api`. There is no tRPC and no Auth.js, although the PRD lists both.
- Prisma 6.19 on PostgreSQL (`prisma/schema.prisma`). The app has no migrations and creates a Postgres sequence `global_server_seq` at runtime (`src/lib/server-seq.ts`).
- Custom auth: Argon2id (`@node-rs/argon2`) password hashes, HS256 JWT (`jose`) in an `httpOnly` cookie `hardmoney_session` that lasts 30 days.
- Clients are offline-first (Dexie). Most writes go through `POST /api/sync/push` (an outbox of mutations), and reads go through `GET /api/sync/pull?cursor=N` (delta by `serverSeq`).
- Background jobs: `runCronTick()` (`src/lib/jobs/cron-runner.ts`) is triggered by `POST /api/v1/cron/tick`. There is no pg-boss or worker process, even though the PRD requires one.
- SMS pipeline: `POST /api/v1/webhooks/sms-ingress` (API-key auth) stores a `BankSms` row. Then `setTimeout` calls `processBankSms`, which runs the template parser, falls back to Gemini, and finishes in `ingestParsedBankSms`.
- Push: subscriptions are stored, but delivery is an **in-memory outbox only** (`src/lib/push/outbox.ts`). Nothing is ever sent.

### 1.2 Auth flow
1. `POST /api/auth/register` validates with zod (password at least 6 characters), then runs `user.create`, `household.create`, `householdMember.create(OWNER)`, and 1 category insert per default category. These are not in one transaction. It then signs a JWT and sets the cookie.
2. `POST /api/auth/login` validates with zod, looks the user up, verifies with Argon2, and sets the cookie (`httpOnly`, `secure` only in production, `sameSite=lax`, 30 days).
3. `POST /api/auth/logout` deletes the cookie. Nothing is revoked on the server.
4. `GET /api/auth/session` decodes the JWT and returns the user from the DB, or the JWT claims if the user row is gone.
5. `src/middleware.ts` runs on every path except static files. It verifies the JWT signature. Without a valid session it redirects pages to `/login?callbackUrl=` and returns 401 for `/api/*`. Public paths are `/login`, `/register`, `/offline`, `/api/auth`, `/api/health`, `/api/test`, and `/api/v1/cron`. **`/api/v1/webhooks` is not public.**
6. Every protected route handler also calls `getSessionUser()`, which re-verifies the JWT. It never checks that the user still exists.

### 1.3 Authorization model (PRD §3.A)
Household roles are `OWNER`, `CO_OWNER`, `CONTRIBUTOR_ADD_ONLY`, and `VIEWER`. Authorization is enforced in route code, case by case. There is no central policy helper. Patterns in use:
- `where: { id, userId: session.userId }`: owner-only. Used by loans, FDs, SMS, dismiss/merge, and raw-sms.
- `householdMember.findUnique({householdId_userId})` plus a role check: used by households and transactions REST.
- In `sync/push`, a per-entity, per-op check against a `userHouseholdRoleMap`. Coverage is incomplete (see F-001 to F-005).

### 1.4 Route inventory

| Route | Methods | AuthN | AuthZ / ownership | Input validation | Used by client? |
|---|---|---|---|---|---|
| `/api/auth/login` | POST | public | n/a | zod | yes |
| `/api/auth/register` | POST | public | `ALLOW_REGISTRATION` | zod (weak) | yes |
| `/api/auth/logout` | POST | public | none needed | none | yes |
| `/api/auth/session` | GET | cookie | self | n/a | yes |
| `/api/health` | GET | public | n/a | n/a | n/a |
| `/api/test/[...slug]` | GET, POST | **public + `E2E_MODE=1`** | **none** | none | tests |
| `/api/v1/cron/tick` | POST | `CRON_SECRET` (default value hardcoded) | n/a | n/a | external cron |
| `/api/v1/webhooks/sms-ingress` | POST | `x-api-key` **and, unintentionally, a session cookie (middleware)** | key's owner | zod | iOS Shortcut |
| `/api/households` | GET, POST | cookie | membership | manual (POST name only) | yes |
| `/api/households/[id]/members` | POST | cookie | OWNER/CO_OWNER | manual | yes |
| `/api/households/[id]/members/[memberId]` | PATCH, DELETE | cookie | OWNER/CO_OWNER or self | manual | yes |
| `/api/households/[id]/transfer-ownership` | POST | cookie | owner | manual | yes |
| `/api/loans` | GET, POST | cookie | userId only; **POST target account unchecked** | manual, weak | no (dead) |
| `/api/loans/[id]` | GET | cookie | userId only (no household read) | n/a | yes |
| `/api/loans/[id]/close` | POST | cookie | userId only | n/a | yes |
| `/api/loans/[id]/pay-emi` | POST | cookie | loan is userId-scoped; **`accountId` unchecked** | manual, weak | yes |
| `/api/loans/[id]/schedule/[entryId]` | PATCH | cookie | userId only | **none (types)** | yes |
| `/api/fixed-deposits/[id]/close` | POST | cookie | FD is userId-scoped; **`targetAccountId` unchecked** | weak | yes |
| `/api/fixed-deposits/[id]/deposit-proceeds` | POST | cookie | FD is userId-scoped; **`targetAccountId` unchecked** | weak | yes |
| `/api/transactions` | POST | cookie | **missing for private accounts** | weak | no (dead) |
| `/api/transactions/[id]` | PATCH, DELETE | cookie | household roles / owner | weak | no (dead) |
| `/api/transactions/[id]/merge` | POST | cookie | userId | n/a | yes |
| `/api/transactions/[id]/dismiss-duplicate` | POST | cookie | userId | n/a | yes |
| `/api/transactions/[id]/raw-sms` | GET | cookie | userId | n/a | yes |
| `/api/sms/activity` | GET | cookie | userId | status passthrough | yes (page) |
| `/api/sms/inbox` | GET | cookie | userId | n/a | yes |
| `/api/sms/inbox/[id]/post` | POST | cookie | userId (SMS and account) | partial | yes |
| `/api/sms/inbox/[id]/ignore` | POST | cookie | userId | n/a | yes |
| `/api/sms/inbox/[id]/retry` | POST | cookie | userId | n/a | yes |
| `/api/sync/pull` | GET | cookie | role-filtered | cursor unvalidated | yes |
| `/api/sync/push` | POST | cookie | **incomplete, many bypasses** | **none** | yes |
| `/api/push/subscribe` | POST | cookie | self (upsert by endpoint) | zod | yes |
| `/api/push/unsubscribe` | POST | cookie | self | zod | yes |
| `/api/push/settings` | GET, POST | cookie | self | zod | yes |
| `/api/push/vapid-public-key` | GET | cookie (via middleware) | n/a | n/a | yes |
| `/api/user/settings` | GET, PATCH | cookie | self | zod (loose) | yes |
| `/api/user/gemini-settings` | GET, PATCH | cookie | self | manual (loose) | yes |
| `/api/user/webhook-key` | GET, POST | cookie | self | n/a | yes |
| `/api/user/accounts` | GET | cookie | self | n/a | yes |
| `/api/user/categories` | GET | cookie | self | n/a | yes |
| `/api/users/search` | GET | cookie | any user can look up anyone's email | n/a | no (dead) |
| `/api/shortcuts/download` | GET | cookie | n/a | n/a | yes |

---

## 2. Summary by severity

| Severity | Count | IDs |
|---|---|---|
| Critical | 6 | F-001, F-002, F-003, F-004, F-006, F-007 |
| High | 15 | F-005, F-008, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-020, F-021, F-022, F-023, F-024, F-025 |
| Medium | 22 | F-016, F-017, F-018, F-019, F-026 to F-043 |
| Low | 16 | F-044 to F-059 |

---

## 3. Findings

### 3.1 Authorization / IDOR in `POST /api/sync/push` (the main write path)

#### F-001: Loan schedule entries and loan payments have no authorization at all
- Severity: **Critical** · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:1091-1160`
- Evidence:
  ```ts
  } else if (entityLower === "loanscheduleentry") {
    if (mutation.op === "CREATE") {
      await (prisma as any).loanScheduleEntry.upsert({ where: { id: mutation.id }, create: { loanId: payload.loanId, ...}, update: { principalComponentMinor: ..., status: payload.status, deletedAt: null ...}})
    } else if (mutation.op === "UPDATE") {
      await (prisma as any).loanScheduleEntry.updateMany({ where: { id: mutation.id }, data: {...} })
    } else if (mutation.op === "DELETE") {
      await (prisma as any).loanScheduleEntry.updateMany({ where: { id: mutation.id }, data: { deletedAt: new Date() ...}})
  ...
  } else if (entityLower === "loanpayment") {
    await (prisma as any).loanPayment.upsert({ where: { id: mutation.id }, create: { loanId: payload.loanId, ... } ...
  ```
  Nothing checks that `payload.loanId` or the existing entry's loan belongs to the caller or to one of the caller's households.
- Impact: any authenticated user can create, modify, mark PAID, or delete schedule entries, and add payments, on **any user's loan**, given the loan or entry UUID. IDs reach other users through household sharing and sync pull. VIEWER and CONTRIBUTOR roles can also write shared-loan schedules, which the PRD forbids.
- Fix: load the parent loan with `where: { id, deletedAt: null }` and authorize it: owner, or OWNER/CO_OWNER of `loan.householdId`. For UPDATE and DELETE, include `loan: { OR: [...] }` in the `where`. Reject when no row matches.

#### F-002: CREATE upserts overwrite other users' records (account, category, transaction, template, installment plan, FD, loan)
- Severity: **Critical** · CONFIRMED · Effort: M
- Files: `src/app/api/sync/push/route.ts:129` (account), `:260` (category), `:363` (transaction), `:581` (template), `:745` (installment plan), `:839` (FD), `:992` (loan)
- Evidence (account; the other entities follow the same pattern):
  ```ts
  await prisma.account.upsert({
    where: { id: mutation.id },
    create: { id: mutation.id, userId: user.id, ... },
    update: { name: payload.name, openingBalanceMinor: ..., accessScope: payload.accessScope, ..., deletedAt: null },
  });
  ```
  The role check only runs when `payload.householdId` is set. When the row already exists and belongs to someone else, the `update` branch runs with **no ownership check**.
- Impact: send `op: "CREATE"` with a victim's existing ID and you overwrite the victim's account balance or scope, transactions (amount, `accountId`, type), FDs, loans, templates, or categories. You can also **undelete** soft-deleted rows (`deletedAt: null`). This defeats every role restriction:
  - A household VIEWER can rewrite shared accounts by omitting `householdId`.
  - A CONTRIBUTOR can rewrite other members' transactions (see F-003).
- Fix: never upsert by a client ID without first loading the row. If the row exists and `userId !== user.id` and the caller doesn't hold the required household role, reject. Better: treat CREATE on an existing ID owned by someone else as `rejected("conflict")`, and route existing-row CREATEs through the same authorization as UPDATE.

#### F-003: Transaction CREATE/UPDATE/DELETE authorization holes (non-members, private accounts, author spoofing)
- Severity: **Critical** · CONFIRMED · Effort: M
- File: `src/app/api/sync/push/route.ts:301-331`, `:363-420`, `:439-472`, `:522-551`
- Evidence:
  ```ts
  // CREATE
  let txHouseholdId = payload.householdId || null;           // client-controlled
  if (payload.accountId) {
    const acc = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (acc?.householdId) { ...role checks... }              // no else branch for acc.userId !== user.id
  }
  ... createdByUserId: payload.createdByUserId || user.id,  // client-controlled attribution
  // UPDATE / DELETE
  if (existingTx) {
    if (existingTx.householdId) {
      const role = userHouseholdRoleMap.get(existingTx.householdId);
      if (role === "VIEWER") {...}
      if (role === "CONTRIBUTOR_ADD_ONLY") {...}
      // role === undefined (NOT A MEMBER) falls through → allowed
    } else if (existingTx.userId !== user.id) {...}
  }
  await prisma.transaction.updateMany({ where: { id: mutation.id }, data: { accountId: payload.accountId, ... } })
  ```
- Impact:
  1. Anyone can post transactions into **any user's private account** (an account with no `householdId`) and change that user's balances.
  2. Anyone can **inject transactions into any household's feed** by setting `payload.householdId` on a transaction against their own account. Sync pull returns every transaction whose `householdId` is in the member's households.
  3. **Non-members can edit or delete any household transaction.** An unknown role is not rejected.
  4. `createdByUserId` can be spoofed. That breaks the CONTRIBUTOR visibility rule and attribution, and lets a contributor "own" other people's rows.
  5. UPDATE can move a transaction to someone else's `accountId`.
  6. Split items can reference any `categoryId`.
- Fix:
  - Always load the account and require `acc.userId === user.id`, or a household role that allows writes when `acc.accessScope === "SHARED_HOUSEHOLD"`.
  - Derive `householdId` from the account only, never from the payload.
  - Force `createdByUserId = user.id`.
  - In UPDATE/DELETE, reject when `existingTx.householdId` is set and the role is undefined.
  - Re-authorize the new `accountId` and `toAccountId`.

#### F-004: Linked account IDs are never ownership-checked (FD placement, loan disbursement, installment plan, transfer `toAccountId`)
- Severity: **Critical** · CONFIRMED · Effort: S
- Files: `src/app/api/sync/push/route.ts:811-836` (FD `fundingAccountId` placement), `:964-989` (loan `linkedDisbursementAccountId`), `:707-724` (installment plan `accountId`), `:367` (`toAccountId`)
- Evidence:
  ```ts
  if (payload.fundingAccountId && payload.principalAmountMinor > 0) {
    await prisma.transaction.upsert({ where: { id: `${mutation.id}-placement` },
      create: { userId: user.id, accountId: payload.fundingAccountId, amountMinor: payload.principalAmountMinor, type: "EXPENSE", ... } ...
  ```
- Impact: an attacker can debit or credit arbitrary amounts on a victim's account (an FD placement EXPENSE, a loan disbursement INCOME, or a transfer into the account), which corrupts the victim's balances.
- Fix: one shared helper, `assertCanWriteAccount(user, accountId, roleMap)`, applied to every account reference: `accountId`, `toAccountId`, `fundingAccountId`, `linkedPayoutAccountId`, `linkedDisbursementAccountId`, and `linkedSettlementAccountId`.

#### F-005: Category and household injection; global (`userId: null`) categories can be overwritten
- Severity: High · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:260-279` and `src/app/api/sync/pull/route.ts:56-66`
- Evidence: category CREATE stores `householdId: payload.householdId || null` with no membership check, and its `update` branch has no ownership check. Pull returns `{ userId: null }` and `{ householdId: { in: allHouseholdIds } }` categories to everyone in scope.
- Impact: anyone can push categories into any household's category list. They can also rename or recolor system categories (`userId: null`, created by the seed paths) for **every user**, if those exist.
- Fix: require OWNER/CO_OWNER for `payload.householdId`. In the update branch, refuse when `existing.userId !== user.id`. Never allow writes to `userId: null` rows from user context.

#### F-006: Installment plan CREATE silently fabricates an "Apex Visa Platinum" credit card account
- Severity: **Critical** for data integrity (fixture code in production) · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:707-743`
- Evidence:
  ```ts
  if (!accExists) {
    await prisma.account.create({ data: { id: payload.accountId, userId: user.id,
      name: "Apex Visa Platinum", type: "CREDIT_CARD", creditLimitMinor: 50000000, statementCutoffDay: 20, paymentDueDay: 10, ...
  ```
  The same block creates a "General" category, and budget CREATE (`:640-652`) creates a "Budgeted Category".
- Impact: real users get phantom accounts with a 500,000.00 limit whenever plans sync before their card or with a stale ID. Monthly cron installment billing then runs against the fake card. This is E2E fixture behavior shipped in production code.
- Fix: delete the auto-create code. Reject the mutation with `reason: "account not found"` so the client retries after the account syncs. Mutation ordering already sorts accounts first.

#### F-007: Test backdoor `/api/test/*` is unauthenticated, and `.env.example` enables it
- Severity: **Critical** (deployment hazard) · CONFIRMED · Effort: S
- Files: `src/app/api/test/[...slug]/route.ts:14, 22-60, 72-490, 580-640`; `.env.example:12`; `src/middleware.ts:14, 25`
- Evidence:
  ```ts
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") { return 404 }
  case "reset": await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Account", ... CASCADE;')
  case "seed":  prisma.user.upsert({ ..., apiKeyHash: u.apiKeyHash ... })   // set any user's webhook key
  case "snapshot": // dumps ALL users' accounts, transactions, bankSms (raw SMS) ...
  case "clock": setServerNow(body.now)
  ```
  `.env.example` ships `E2E_MODE="1"`, and middleware bypasses auth for `/api/test`.
- Impact: if anyone deploys by copying `.env.example` to `.env`, the documented first-run path, an anonymous attacker can **wipe the whole database**, dump every user's financial data and raw SMS, set any user's webhook API key (account takeover of the SMS channel), seed memberships to join any household, and move the server clock.
- Fix:
  - Exclude the route from production builds. For example, move it behind `if (process.env.NODE_ENV === "production") return 404` *and* a required `E2E_SECRET` header, or keep it out of `src/app` and mount it only in test builds.
  - Set `E2E_MODE="0"` in `.env.example` and add a comment.
  - Log a loud warning at boot when E2E mode is on.

#### F-008: REST `POST /api/transactions` lets anyone write into any non-household account
- Severity: High · CONFIRMED · Effort: S
- File: `src/app/api/transactions/route.ts:26-55`
- Evidence:
  ```ts
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  const householdId = account.householdId;
  if (householdId) { ...membership / VIEWER checks... }
  // no check for account.userId !== user.id when householdId is null
  ```
  It also ignores `account.deletedAt` and `accessScope`. `type` is any string. `Number(amountMinor)` can be `NaN` or negative, and an invalid date returns a 500.
- Impact: cross-tenant ledger writes. The client doesn't call this route (dead code), but it is reachable.
- Fix: add `if (!householdId && account.userId !== user.id) return 403`, require `accessScope === "SHARED_HOUSEHOLD"` for non-owners, and validate the body with zod (integer amount above 0, enum type, ISO date). Or delete the route.

#### F-009: `pay-emi` debits an unverified `accountId`
- Severity: High · CONFIRMED · Effort: S
- File: `src/app/api/loans/[id]/pay-emi/route.ts:23-33, 88-108`
- Evidence: `accountId` comes straight from the body and goes into `tx.transaction.create({ data: { accountId, amountMinor, type: "EXPENSE", ...` with no lookup.
- Impact: a user can record EMI expenses against another user's account and change their balance.
- Fix: `prisma.account.findFirst({ where: { id: accountId, userId: session.userId, deletedAt: null } })`, or a household write check.

#### F-010: FD close and deposit-proceeds credit an unverified `targetAccountId`
- Severity: High · CONFIRMED · Effort: S
- Files: `src/app/api/fixed-deposits/[id]/close/route.ts:34, 47-65`; `src/app/api/fixed-deposits/[id]/deposit-proceeds/route.ts:32, 43-61`
- Evidence: `const targetAccountId = body.targetAccountId || fd.linkedPayoutAccountId || fd.fundingAccountId;` is used directly as `accountId`.
- Impact: proceeds can be credited to any account, and fabricated income can be injected into other users' ledgers.
- Fix: verify ownership of `targetAccountId`, or household write access to it.

#### F-011: `POST /api/loans` disburses into an unverified account, and its rows never sync
- Severity: High · CONFIRMED · Effort: S
- File: `src/app/api/loans/route.ts:80-169`
- Evidence: `linkedDisbursementAccountId` is unchecked. `loan.create`, `loanScheduleEntry.create`, and `transaction.create` all omit `serverSeq`, so they get the schema default `0`. Pull uses `serverSeq: { gt: cursor }` with cursor ≥ 0, so rows with `serverSeq = 0` are **never pulled**.
- Impact: a cross-tenant INCOME write, plus loans created this way never appear on any device. The client doesn't call this route today, but it is live.
- Fix: verify the account, assign `getNextServerSeq()` to every row, and validate with zod. Or delete the route, since sync push creates loans.

#### F-012: Shared-household FDs and loans are inaccessible through REST
- Severity: High (functional and spec) · CONFIRMED · Effort: M
- Files: `src/app/api/loans/[id]/route.ts:16`, `loans/[id]/close/route.ts:17`, `loans/[id]/pay-emi/route.ts:35`, `loans/[id]/schedule/[entryId]/route.ts:25`, `fixed-deposits/[id]/close/route.ts:18`, `fixed-deposits/[id]/deposit-proceeds/route.ts:19`
- Evidence: every one of these filters `where: { id, userId: session.userId }`. The PRD matrix says OWNER and CO_OWNER can read and write shared FDs and loans, and VIEWER can read them.
- Impact: for a CO_OWNER or VIEWER, the loan detail modal (`loan-detail-modal.tsx:67`) returns 404, and pay-emi, close, and FD maturity all fail on shared items.
- Fix: one `authorizeLoan(user, id, "read" | "write")` helper that allows the owner or the correct household role.

#### F-013: Changing an account's scope (private↔shared) is half-applied on the server, which leaks private transactions to the household
- Severity: High · CONFIRMED (by code path) · Effort: M
- Files: `src/app/api/sync/push/route.ts:191-227` (account UPDATE data has no `householdId`), `:327` (tx copies `acc.householdId` regardless of `accessScope`), `src/app/api/sync/pull/route.ts:67-73` (tx pulled by `householdId`), `src/lib/sync/client.ts:311-330` (client sends `householdId` in the UPDATE patch), `src/app/accounts/page.tsx:356-368`
- Evidence: the UPDATE handler spreads `name`, `type`, …, `accessScope`, but **never `householdId`**. The transaction CREATE sets `txHouseholdId = acc.householdId` even when `acc.accessScope === "PRIVATE"`.
- Impact:
  - Changing *SHARED → PRIVATE* keeps the account's `householdId`. Every existing and future transaction on the "private" account is still pulled by all household members.
  - Changing *PRIVATE → SHARED* never sets `householdId` on the server, so the account is never actually shared.
- Fix:
  - Handle `householdId` in UPDATE with a role check.
  - Only set `transaction.householdId` when the account is `SHARED_HOUSEHOLD`.
  - On a scope change, bump `serverSeq` and re-scope existing transactions. Filter the pull by the account's scope as well.

#### F-014: Household management has no input validation and allows lateral CO_OWNER actions
- Severity: High (combination) · CONFIRMED · Effort: S
- Files: `src/app/api/households/[id]/members/route.ts:21-59`; `members/[memberId]/route.ts:15-58, 106-130`
- Evidence: a CO_OWNER can add new CO_OWNERs, and can demote or remove other CO_OWNERs, because the only blocked target is `targetMember.role === "OWNER"`. `email.trim()` throws a 500 if `email` isn't a string. `userId` lets you add any user by raw ID. The response returns the target's email.
- Impact: a CO_OWNER can take effective control (demote every other CO_OWNER, add allies) without being OWNER. The PRD says only "no OWNER changes", so confirm the intended rule with product. Type errors produce 500s.
- Fix: use a zod schema (`email: z.string().email()`, `role: z.enum([...])`). Decide whether a CO_OWNER may modify other CO_OWNERs, and enforce that only the OWNER can change CO_OWNER roles.

#### F-015: Removing or leaving a household doesn't touch shared resources or session-held data
- Severity: High (spec gap) · SUSPECTED · Effort: M
- Files: `src/app/api/households/[id]/members/[memberId]/route.ts:132-136`; `src/app/api/sync/pull/route.ts:15-29`
- Evidence: only the `householdMember` row is deleted. Accounts, FDs, and loans the leaving user created with that `householdId` stay shared, and the leaving user (as `userId` owner) can still edit them. The pull has no per-role re-sanitization when a role is *downgraded* (for example CO_OWNER → CONTRIBUTOR). Rows already cached keep their balances, because only changed rows (by `serverSeq`) are sent.
- Impact: data visibility doesn't match the PRD's "purged on next sync" requirement for role downgrades. The client does purge removed households via `activeHouseholdIds` (`client.ts:206`).
- Fix: when a role changes, bump `serverSeq` on every row in that household for the affected user, or send a "full resync for household X" signal. Decide who owns the resources of a member who leaves.

### 3.2 Authentication, sessions and secrets

#### F-020: Hardcoded fallback `AUTH_SECRET` allows JWT forgery and full account takeover
- Severity: High (Critical whenever the env var is missing) · CONFIRMED · Effort: S
- Files: `src/lib/auth.ts:6-7`, `src/middleware.ts:4-5`, `docker-compose.yml:30`, `.env.example:3`
- Evidence:
  ```ts
  const AUTH_SECRET = process.env.AUTH_SECRET || "insecure-dev-auth-secret-minimum-32-characters-long";
  const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET.padEnd(32, "0"));
  ```
  `docker-compose.yml` passes `AUTH_SECRET: ${AUTH_SECRET}`, which becomes an **empty string** when unset, and `"" ||` picks the public fallback (verified with node). Short secrets are silently zero-padded.
- Impact: if the variable is missing, anyone can sign `{userId: "<victim>"}` with the public key in the repo and become any user. User IDs leak through household listings.
- Fix: fail fast at startup when `NODE_ENV === "production"` and `AUTH_SECRET` is missing, shorter than 32 bytes, or equal to the example value. Drop `padEnd`. Keep the dev fallback only behind `NODE_ENV !== "production"`.

#### F-021: Hardcoded fallback `APP_ENCRYPTION_KEY` means Gemini keys are effectively in plaintext
- Severity: High · CONFIRMED · Effort: S
- Files: `src/lib/encryption.ts:3-12`, `.env.example:4`, `docker-compose.yml:31`
- Evidence: `const DEFAULT_KEY = "0123456789abcdef..."; const hexKey = process.env.APP_ENCRYPTION_KEY || DEFAULT_KEY;`. Any value that isn't exactly 64 characters is SHA-256'd silently.
- Impact: a DB leak exposes every user's Gemini API key. Note too that the "v1:" prefix exists, but there is no key-ID or rotation support, although the PRD asks for rotation.
- Fix: apply the same fail-fast rule as F-020, require 64 hex characters, and add `v2:<kid>:...` with a keyring for rotation.

#### F-022: Cron endpoint uses a publicly known default secret and logs the secret
- Severity: High · CONFIRMED · Effort: S
- File: `src/app/api/v1/cron/tick/route.ts:5-21`
- Evidence:
  ```ts
  const configuredSecret = process.env.CRON_SECRET || "optional-cron-secret-token";
  console.log("CRON DEBUG:", { configuredSecret, authHeader, cronSecretHeader });
  ```
  `docker-compose.yml` doesn't pass `CRON_SECRET` to `web` at all, so the default is **always** active under compose.
- Impact: anyone can trigger the full cron tick, which recomputes every user's budgets and statements (expensive, see F-036) and sends reminder notifications. The real secret is written to stdout and log aggregation on every call. Comparison isn't constant-time.
- Fix: refuse when `CRON_SECRET` is unset in production, delete the debug log, use `crypto.timingSafeEqual`, and add `CRON_SECRET` to compose.

#### F-023: SMS webhook is blocked by middleware for real (cookie-less) callers
- Severity: High (feature broken in production) · CONFIRMED · Effort: S
- Files: `src/middleware.ts:8-16, 47-51`; `tests/e2e/s14-sms-ingress.spec.ts:58-75`
- Evidence: `PUBLIC_PATHS` contains `/api/v1/cron` but **not** `/api/v1/webhooks`. Unauthenticated `/api/*` requests get `401 {"error":"Unauthorized"}` before the route's `x-api-key` logic runs. The E2E tests use `page.request`, which carries the logged-in session cookie, so they hide the bug.
- Impact: the iOS Shortcut / SMS forwarding flow (PRD §2) can't work for any real device.
- Fix: add `/api/v1/webhooks` to `PUBLIC_PATHS`, and add an E2E test with a fresh `request.newContext()` (no cookies).

#### F-024: No brute-force or abuse protection on login or registration
- Severity: High · CONFIRMED · Effort: M
- Files: `src/app/api/auth/login/route.ts:15-46`, `src/app/api/auth/register/route.ts:17-115`
- Evidence: there is no rate limiter, lockout, or CAPTCHA. Every request runs Argon2id (`memoryCost: 19456` KiB, so about 19 MiB per hash).
- Impact: online password guessing, credential stuffing, and memory or CPU exhaustion from parallel login or register calls. Registration is open by default (`ALLOW_REGISTRATION` defaults to `true`).
- Fix: per-IP and per-email rate limits on login and register, stored in Postgres or Redis so they work across instances. Add exponential backoff or lockout after N failures, and cap concurrent Argon2 operations.

#### F-025: Sessions can't be revoked: 30-day stateless JWT, logout only clears the cookie
- Severity: High · CONFIRMED · Effort: M
- Files: `src/lib/auth.ts:34-63`, `src/app/api/auth/logout/route.ts:4-8`, `src/app/api/auth/session/route.ts:24-34`
- Evidence: `setExpirationTime("30d")`. There's no session table, `tokenVersion`, or `jti`. `getSessionUser()` never checks that the user exists, and `/api/auth/session` returns a synthesized user (200) when the DB row is missing.
- Impact: a stolen cookie stays valid for 30 days with no way to kill it. There is no password change, password reset, or "log out everywhere" (feature gaps). Deleted users keep working sessions.
- Fix: add `User.sessionVersion` (or a `Session` table) checked in `getSessionUser()`, shorten the lifetime with sliding renewal, and add password change/reset endpoints that bump the version. Return 401 when the user is missing.

#### F-016: Open redirect through `callbackUrl`
- Severity: Medium · CONFIRMED · Effort: S
- Files: `src/middleware.ts:60-63`; `src/app/login/page.tsx:10, 46`
- Evidence: middleware accepts any value that `startsWith("/")`. `//evil.example/phish` resolves to `https://evil.example/phish` (verified with node). The login page calls `router.push(callbackUrl)` with **no** validation at all.
- Impact: phishing that uses the app's own domain, for example `https://app/login?callbackUrl=https://evil/...` after a real login.
- Fix: allow only paths matching `^/(?!/|\\)`, resolve with `new URL(cb, origin)`, and require `url.origin === origin` in both places.

#### F-017: Weak password policy, no length caps on inputs
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/auth/register/route.ts:11-15`
- Evidence: `password: z.string().min(6)` with no maximum. `name: z.string().min(1)` with no maximum. Email isn't length-limited. The login schema has no maximum either.
- Impact: weak passwords, and very large passwords sent to Argon2 (CPU and memory cost).
- Fix: minimum 10–12 characters, maximum 128–256. Name maximum 100. Consider a breached-password check.

#### F-018: Registration isn't atomic and races on unique email
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/auth/register/route.ts:42-82`; `src/lib/auth.ts:68-82`
- Evidence: `findUnique` then `create` (check-then-act), followed by separate household, member, and N category inserts, with no `$transaction`. Each category calls `getNextServerSeq()` sequentially.
- Impact: concurrent registration with the same email hits an unhandled P2002 (500). A failure after the user is created leaves a user with no household or categories, who can't retry because the email is now taken.
- Fix: wrap everything in `prisma.$transaction`, catch P2002 and return 409, and batch the categories with `createMany`.

#### F-019: Login timing difference allows email enumeration; other routes enumerate emails directly
- Severity: Medium · CONFIRMED · Effort: S
- Files: `src/app/api/auth/login/route.ts:33-38` (returns early without hashing); `src/app/api/auth/register/route.ts:46-51` (409 "already exists"); `src/app/api/users/search/route.ts:18-35` (returns `{id,name,email}` for any exact email); `src/app/api/households/[id]/members/route.ts:61-63` ("User not found")
- Impact: anyone with an account can test whether any email is registered and learn the owner's name and user ID, and the ID feeds F-020-style attacks. Searching is in the product spec, but without any rate limit.
- Fix: run a dummy Argon2 verify when the user isn't found, rate-limit `users/search` and member adds, and return only a minimal identifier. `/api/users/search` is unused by the client, so consider removing it.

#### F-026: No CSRF defense beyond `SameSite=Lax`; JSON bodies parsed without a Content-Type check
- Severity: Medium · SUSPECTED (exploitability depends on deployment) · Effort: S
- Files: all mutating routes (for example `request.json()` in `households/route.ts:63`); cookie set in `login/route.ts:64-72`
- Evidence: there's no Origin or `Sec-Fetch-Site` check, and `request.json()` parses `text/plain` bodies too. Lax blocks cross-site POSTs from other *sites*, but not from sibling subdomains (same-site), and not on older browsers.
- Impact: CSRF on account, household, and settings mutations from any same-site origin, such as `*.yourdomain` user content.
- Fix: in middleware (proxy), reject state-changing `/api/*` requests whose `Origin` doesn't equal `APP_URL`, except the webhook and cron routes. Require `Content-Type: application/json`. Consider `__Host-` cookie naming and `SameSite=Strict`.

#### F-027: Cookie `secure` depends on `NODE_ENV`; there are no security headers
- Severity: Medium · CONFIRMED · Effort: S
- Files: `src/app/api/auth/login/route.ts:68`, `register/route.ts:108`, `next.config.ts` (no `headers()`)
- Evidence: `secure: process.env.NODE_ENV === "production"`. The repo has no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`.
- Impact: staging or self-host deployments that run with a non-production `NODE_ENV` send the session over HTTP. Clickjacking and XSS hardening are missing.
- Fix: derive `secure` from `APP_URL` starting with `https:`. Add `headers()` in `next.config.ts` with CSP, HSTS, `frame-ancestors 'none'`, and `Referrer-Policy: strict-origin-when-cross-origin`.

#### F-028: Middleware skips auth for any path containing "."
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/middleware.ts:22-29`
- Evidence: `pathname.includes(".")` returns `NextResponse.next()`. `/accounts/x.y` and `/api/transactions/abc.def` skip the gate.
- Impact: route handlers re-check the session today (defense in depth), but any future handler that relies on middleware alone becomes public. Pages under dotted paths render without the redirect.
- Fix: match only real static extensions (`/\.(?:ico|png|svg|webmanifest|js|css|txt|xml)$/`) or use the matcher config only.

#### F-029: `middleware.ts` is deprecated in Next.js 16
- Severity: Low (tracked as Medium for maintenance) · CONFIRMED against nextjs.org ("Renaming Middleware to Proxy") · Effort: S
- File: `src/middleware.ts`
- Evidence: Next 16 renamed the convention to `proxy.ts` with an exported `proxy` function. `middleware.ts` still runs but is scheduled for removal.
- Fix: rename to `src/proxy.ts`, export `proxy`, and keep the matcher.

### 3.3 Business-logic and data-integrity bugs in API routes

#### F-030: `pay-emi` allows double payment, payment of closed loans, and races
- Severity: Medium (High financially) · CONFIRMED · Effort: M
- File: `src/app/api/loans/[id]/pay-emi/route.ts:35-84, 86-216`
- Evidence:
  - A `scheduleEntryId` that points at an already `PAID` entry is accepted (`find(e => e.id === scheduleEntryId)` with no status check).
  - There's no `loan.status === "CLOSED"` guard.
  - The loan and its next entry are read **outside** the `$transaction`, and there's no idempotency key, so double-clicks or retries create two payments for the same installment.
  - Extra-principal re-amortization soft-deletes only `status: "SCHEDULED"` but builds the new schedule from every non-PAID entry. Leftover `OVERDUE`/`OVERRIDDEN` entries stay alongside the new ones, so installments are duplicated.
  - `loan.monthlyEmiAmountMinor` isn't updated in LOWER_EMI mode.
  - The route uses `new Date()` instead of `getServerNow()`, which breaks clock-controlled tests and the server-clock design.
  - No validation: `amountMinor` can be a float or a string, and `mode` is free text.
- Fix: zod body, move the reads into the transaction with `SELECT … FOR UPDATE` (or a conditional `updateMany where status != PAID`), require an `Idempotency-Key`, reject closed loans, and fix the deletion filter to `status: { not: "PAID" }`.

#### F-031: Schedule override PATCH has no type validation (string concatenation) and can rewrite PAID history
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/loans/[id]/schedule/[entryId]/route.ts:23-69`
- Evidence: `const newEmi = newPrincipal + newInterest;` is computed but never used. `targetEntry.openingBalanceMinor - newPrincipal` gets a string from the body, and Prisma rejects strings, so the request 500s. Negative values are accepted. A PAID target entry can be overridden.
- Fix: `z.object({ interestComponentMinor: z.number().int().min(0).optional(), principalComponentMinor: ... })`, and reject `status === "PAID"`.

#### F-032: FD close and deposit-proceeds aren't atomic, can double-credit, and skip maturity/deleted checks
- Severity: Medium (High financially) · CONFIRMED · Effort: M
- Files: `src/app/api/fixed-deposits/[id]/close/route.ts:18-117`; `deposit-proceeds/route.ts:19-122`
- Evidence:
  - The `status === "CLOSED"` check runs before 2–3 independent writes, with no `$transaction`.
  - `deletedAt` isn't filtered.
  - `deposit-proceeds` doesn't check `now >= maturityDate`.
  - In close, `actualProceedsMinor` may be negative (`typeof === "number"`), producing a negative INCOME row.
  - The "Investment Yield" lookup ignores `deletedAt` and may pick a `userId: null` category.
- Impact: concurrent or double-clicked calls credit the proceeds twice. An FD can be "matured" early at the full compounded interest. A crash in the middle leaves transactions posted while the FD is still ACTIVE.
- Fix: one `$transaction` with a conditional `updateMany({ where: { id, status: { not: "CLOSED" } } })` claim first, a maturity check, and `actualProceedsMinor: z.number().int().min(0)`.

#### F-033: SMS inbox "post" can be replayed, creating duplicate transactions
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/sms/inbox/[id]/post/route.ts:17-90`
- Evidence: no `sms.status === "NEEDS_REVIEW"` check, and the transaction create and SMS update aren't in one transaction. `body.type` is any string. `householdId` isn't set for shared accounts.
- Fix: claim with `updateMany({ where: { id, status: "NEEDS_REVIEW" }, data: { status: "PROCESSING" } })`, then create the transaction in a `$transaction`, and validate `type` as an enum.

#### F-034: Sync cursor can permanently skip rows (serverSeq allocated before commit)
- Severity: Medium (High for data correctness) · CONFIRMED by design · Effort: L
- Files: `src/lib/server-seq.ts:5-43`; every writer; `src/app/api/sync/pull/route.ts:52-213`
- Evidence: `nextval()` runs before a separate write that commits later. Pull returns `max(serverSeq)` as the new cursor. If request A takes seq 100 and request B takes seq 101 and commits first, a pull that sees 101 advances the cursor past 100. When A commits, its row is **never** pulled by that device.
- Impact: silent, permanent divergence between devices under concurrent writes, which cron makes routine.
- Fix: in pull, cap the cursor at a safe watermark (for example the minimum of in-flight sequences, via `pg_snapshot_xmin`/`txid_current`), or allocate seq inside the same transaction and have pull lag by N seconds. Or use logical commit ordering (an `xid8` commit-timestamp column).

#### F-035: Pull and push are unbounded (no pagination or batch limits); invalid cursor returns 500
- Severity: Medium · CONFIRMED · Effort: M
- Files: `src/app/api/sync/pull/route.ts:12-13, 45-172`; `src/app/api/sync/push/route.ts:54-55`; `src/app/api/sms/activity/route.ts:25`; `sms/inbox/route.ts:11`
- Evidence: `BigInt(cursorParam)` throws on `?cursor=abc` (verified: `SyntaxError`). Thirteen `findMany` calls have no `take`. Push accepts any number of mutations and handles each one sequentially with several queries. SMS activity returns every row with full `rawMessage`.
- Impact: memory and latency blow-ups for long-lived users on first sync, DoS by a huge push body, and a 500 on a bad cursor.
- Fix: validate the cursor with `/^\d+$/`, page with `take` plus a `hasMore` flag, cap push at about 200 mutations and the body size, and paginate the SMS lists.

#### F-036: Cron tick does O(budgets × all transactions × months) work and bumps serverSeq on every run
- Severity: Medium · CONFIRMED · Effort: M
- File: `src/lib/jobs/cron-runner.ts:51-188, 190-261`
- Evidence: for each budget, it fetches **all** of the user's transactions, iterates every month since the first one, and upserts a snapshot with a new `serverSeq` every tick, even when nothing changed. Credit card statements do the same.
- Impact: the cost grows without bound. Every device re-downloads every snapshot and statement after every tick. Combined with F-022, anyone can trigger it repeatedly.
- Fix: process only the current and previous month, write only when the values change, and query aggregates instead of full transaction lists.

#### F-037: Cron isn't transactional or locked; partial failures poison later runs
- Severity: Medium · SUSPECTED · Effort: M
- File: `src/lib/jobs/cron-runner.ts:419-452` (FD payout: transaction create, then payout create), `:316-342` (installment)
- Evidence: the FD payout creates the deterministic transaction ID, then the payout row, as separate statements. If the second fails, the next tick sees no payout and calls `transaction.create` with the same ID, which throws P2002 and **aborts the whole tick** for every user. Overlapping ticks also collide, because nothing acquires a lock.
- Fix: one `$transaction` per payout or plan, use `upsert` or `createMany({ skipDuplicates })`, wrap each unit in try/catch so one bad row doesn't stop the run, and take a `pg_advisory_lock` per tick.

#### F-038: Daily push reminders fire on every tick after the reminder time and are never delivered
- Severity: Medium (feature not implemented) · CONFIRMED · Effort: M
- Files: `src/lib/jobs/cron-runner.ts:516-550`; `src/lib/push/outbox.ts:13-24`; `src/app/api/push/vapid-public-key/route.ts:4-6`; `package.json` (no `web-push`)
- Evidence: `if (userTime >= configuredTime) enqueuePushNotification(...)` doesn't track "already sent today". The outbox is a module-level array that is never drained or sent. The VAPID public key falls back to a hardcoded key, and nothing uses `VAPID_PRIVATE_KEY`. With `cacheComponents: true`, the VAPID GET handler (env-only, no runtime APIs) will probably be **prerendered at build time** (Next 16 Route Handler docs), which freezes whatever key existed at build. That part is SUSPECTED.
- Impact: push reminders never reach a device, memory grows without bound in the server process, and reminders would be duplicated once delivery exists.
- Fix: add the `web-push` dependency (pinned), send with VAPID keys, persist a `lastReminderSentOn` date per user, delete expired subscriptions on 404/410, require the VAPID env vars in production, and mark the key route dynamic (`await connection()`) or read the key at runtime.

#### F-039: SMS worker relies on `setTimeout` after the response; failed jobs get stuck
- Severity: Medium · CONFIRMED · Effort: M
- Files: `src/app/api/v1/webhooks/sms-ingress/route.ts:101-109`; `src/lib/sms/worker.ts:27-34, 270-306`; cron route (doesn't process pending SMS, only the test tick at `test/[...slug]/route.ts:493-503` does)
- Evidence: `setTimeout(() => processBankSms(...), 0)` is fire-and-forget. If `ingestParsedBankSms` throws, the row stays `PROCESSING` forever. Nothing retries `PENDING` or `PROCESSING` rows: `nextRetryAt` and backoff are never used, and there's no pg-boss worker even though the PRD requires one.
- Impact: SMS rows are lost when the process restarts, scales to zero, or hits an error.
- Fix: use `after()` from `next/server` for post-response work, or a real queue. Make `/api/v1/cron/tick` call `processAllPendingBankSms()`. Reset stale `PROCESSING` rows older than N minutes, and set `FAILED` with `nextRetryAt` on error.

#### F-040: Gemini provider keeps every raw (unmasked) SMS in process memory, in production too
- Severity: Medium (privacy) · CONFIRMED · Effort: S
- File: `src/lib/sms/gemini-provider.ts:52-58`
- Evidence: `globalGemini.__capturedGeminiRequests!.push({ sender, rawMessage: options.rawMessage, ... })` runs unconditionally. The `fetch` to Gemini has no timeout (`:98`), and the API key is sent in the query string (`:94-96`).
- Impact: unbounded memory growth, raw financial SMS kept in the heap (heap dumps, crash reports), and request hangs.
- Fix: capture only when `E2E_MODE === "1"`, add `AbortSignal.timeout(15000)`, and send the key with the `x-goog-api-key` header.

#### F-041: Gemini settings accept any `smsAutoPostMode` and `geminiModel`
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/user/gemini-settings/route.ts:58-73`
- Evidence: any non-empty string is saved. The worker only recognizes `"ALWAYS_REVIEW_GEMINI"`, so a typo silently means auto-post. `geminiModel` goes into the Gemini URL, though it is encoded.
- Fix: `z.enum(["AUTO_VALIDATED","ALWAYS_REVIEW_GEMINI"])`, and an allowlist or regex for the model (`^gemini-[\w.-]{1,40}$`).

#### F-042: User settings accept invalid timezones and out-of-range tax rates
- Severity: Medium · CONFIRMED · Effort: S
- File: `src/app/api/user/settings/route.ts:6-46`
- Evidence: `timezone: z.string()` with no IANA validation. The cron runner catches the bad value and falls back to `"20:00"`, so reminders silently misbehave. `defaultWithholdingTaxRateBps: z.number()` allows negatives, values above 10000, and floats. The currency has length 3 but isn't validated as ISO 4217.
- Fix: validate the timezone with `Intl.supportedValuesOf("timeZone")`, use `z.number().int().min(0).max(10000)`, and a currency allowlist.

#### F-043: Push subscription endpoint is an unvalidated URL (latent SSRF) and an existing endpoint can be re-bound
- Severity: Medium · SUSPECTED (sending isn't implemented yet) · Effort: S
- File: `src/app/api/push/subscribe/route.ts:6-45`
- Evidence: `endpoint: z.string().url()` accepts `http://169.254.169.254/...` or internal hosts. `keys.p256dh` and `keys.auth` aren't length- or format-checked. The upsert by `endpoint` overwrites `userId`, so whoever knows an endpoint can attach it to their own account. There's no per-user subscription cap.
- Impact: once real delivery exists (F-038), the server will POST to attacker-chosen internal URLs (SSRF). Re-binding someone else's endpoint stops their reminders.
- Fix: require `https:`, allowlist the known push-service hosts (FCM, Mozilla, Apple, WNS), validate the key lengths (base64url, 65 and 16 bytes), cap subscriptions per user at about 10, and only allow re-binding when the existing row has the same user.

### 3.4 Error handling, logging, deployment

#### F-044: Inconsistent error handling; internal error messages returned to clients
- Severity: Low · CONFIRMED · Effort: M
- Files: `src/app/api/sync/push/route.ts:1177-1183` (`reason: err.message`), `src/app/api/v1/cron/tick/route.ts:26-29`, `src/app/api/test/[...slug]/route.ts:636-640`; most other routes have no try/catch
- Evidence: Prisma error messages, which include model and field names, go into `reason`. Unhandled Prisma errors (bad dates, NaN, P2002) become 500s with no consistent `{ error, code }` shape. Some routes default the body to `{}` (`transactions/route.ts:12`) while others return 400 for invalid JSON.
- Fix: a shared `withApi(handler)` wrapper that maps zod errors to 400, P2002 to 409, P2025 to 404, and everything else to 500 with a generic message, logs with a request ID, and never echoes `err.message` to clients.

#### F-045: Full mutation payloads logged on failure
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:1178`
- Evidence: `console.error("Mutation failed:", mutation, err);`. This includes amounts, notes, and account numbers. The PRD (§ security) says sensitive financial and SMS data stays out of logs.
- Fix: log `mutationId`, `entity`, `op`, and the error code only.

#### F-046: `docker-compose.yml` refers to a missing Dockerfile, has no worker, and exposes Postgres with default credentials
- Severity: Low (High if deployed as is) · CONFIRMED · Effort: M
- File: `docker-compose.yml:7-12, 20-35`
- Evidence: `dockerfile: Dockerfile` doesn't exist. `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}` is published on `5432:5432` on every interface. There is no `worker` service, although PRD §1 requires one. `CRON_SECRET` and the VAPID variables aren't passed to `web`.
- Fix: add a Dockerfile (standalone output), bind Postgres to `127.0.0.1` or don't publish it, require a password, add the worker, and pass every required env var with a `:?` required-variable error.

#### F-047: No Prisma migrations; DDL runs at runtime
- Severity: Low · CONFIRMED · Effort: M
- Files: `prisma/` (no `migrations/`), `src/lib/server-seq.ts:16-18`
- Evidence: `CREATE SEQUENCE IF NOT EXISTS global_server_seq` runs on demand from app code. Its silent fallback to the `SyncSequence` row serializes every write through one hot row.
- Impact: there's no reproducible schema for production, the app user needs DDL privileges, and the fallback path is a throughput bottleneck.
- Fix: `prisma migrate dev` to create a baseline migration that includes the sequence, run `migrate deploy` at startup, and remove the runtime DDL.

#### F-048: Webhook rate limit is per process, runs after the DB lookup, and grows without bound; `apiKeyHash` isn't indexed
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/v1/webhooks/sms-ingress/route.ts:7-54`; `prisma/schema.prisma:19`
- Evidence: an in-memory `Map` is never pruned. Invalid keys hit `user.findFirst({ where: { apiKeyHash } })`, which is a full scan with no index, without any limit.
- Fix: `@unique` on `apiKeyHash`, an IP-based limit before the DB lookup, a shared store, and pruning of old keys.

#### F-049: Webhook dedupe races into a 500
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/v1/webhooks/sms-ingress/route.ts:78-99`
- Evidence: `findUnique(dedupeKey)` then `create` (check-then-act). A concurrent duplicate throws P2002 (500) instead of returning `DUPLICATE`.
- Fix: catch P2002 and return the 200 DUPLICATE response.

#### F-050: Sync push accepts unknown entities and crashes the batch on a missing `entity`
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:72-82, 1162-1175`
- Evidence: the sort comparator calls `a.entity.toLowerCase()` outside try/catch, so a missing `entity` makes the whole request 500. Unknown entities fall through every branch and are recorded as applied and `accepted`.
- Fix: validate each mutation with a zod discriminated union first, and reject unknown entities.

#### F-051: Idempotency keys are global, not per user
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/sync/push/route.ts:93-100`; `prisma/schema.prisma` `AppliedMutation.id`
- Evidence: the lookup is by `mutationId` only. Another user's mutation with the same ID is treated as already applied.
- Fix: a composite key `(userId, mutationId)`.

#### F-052: Sync push isn't atomic per mutation and uses wall-clock time
- Severity: Low · CONFIRMED · Effort: M
- File: `src/app/api/sync/push/route.ts` (for example FD placement transaction plus FD upsert at `:815-883`, transaction plus split items at `:363-437`)
- Evidence: multi-row effects aren't wrapped in `$transaction`, and the `AppliedMutation` record is written last and outside the transaction. `new Date()` is used instead of `getServerNow()`.
- Impact: a partial apply followed by a client retry can double-apply side effects (split items are deleted and recreated, which is fine, but the reasoning is fragile).
- Fix: wrap each mutation and its `AppliedMutation` insert in a single `$transaction`.

#### F-053: SMS balance-mismatch hints never sync and use the wrong "newer SMS" scope
- Severity: Low · CONFIRMED · Effort: S
- File: `src/lib/sms/ingestion.ts:456-514`
- Evidence: `account.update({ data: { balanceMismatchHint } })` has no `serverSeq` bump, so clients never pull the hint. The "newer SMS" check is user-wide even though the comment says "user & account".
- Fix: bump `serverSeq`, and scope the check by sender or account.

#### F-054: Account matcher treats an empty sender ID as a wildcard
- Severity: Low · CONFIRMED · Effort: S
- File: `src/lib/sms/account-matcher.ts:29-34`
- Evidence: `normSender.includes(id.toUpperCase())` is true for `id === ""`.
- Fix: ignore empty or short IDs and require exact matching (or at least 3 characters).

#### F-055: Shortcut download is a JSON file named `.shortcut` with a hardcoded domain
- Severity: Low (feature bug) · CONFIRMED · Effort: M
- File: `src/app/api/shortcuts/download/route.ts:4-35`
- Evidence: `url: "https://your-domain.com/api/v1/webhooks/sms-ingress"`. The file is not a signed Apple Shortcut plist, so iOS won't import it.
- Fix: build the URL from `APP_URL`, and ship an iCloud shortcut link or a signed `.shortcut` file with step-by-step instructions.

#### F-056: Health endpoint doesn't check dependencies
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/health/route.ts:4-11`
- Evidence: it returns `ok` without touching the DB, and exposes `uptime`. Under `cacheComponents`, `new Date()` should keep it dynamic (SUSPECTED), but nothing marks it explicitly.
- Fix: run `SELECT 1` with a timeout, return 503 on failure, and call `await connection()` to force runtime execution.

#### F-057: Household creation has no limits; schema default role is `OWNER`
- Severity: Low · CONFIRMED · Effort: S
- Files: `src/app/api/households/route.ts:63-67`; `prisma/schema.prisma:68`
- Evidence: `name` has no maximum length and isn't a type-checked string (`body?.name?.trim()` throws on a non-string, giving a 500). There's no cap on households per user. `role String @default("OWNER")` is unsafe if any insert forgets the role. There is no route to rename or delete a household, although the PRD mentions deleting one.
- Fix: zod with a maximum of 80 characters, default role `VIEWER` (or an enum with no default), and rename/delete endpoints.

#### F-058: `transfer-ownership` edge cases
- Severity: Low · CONFIRMED · Effort: S
- File: `src/app/api/households/[id]/transfer-ownership/route.ts:16-82`
- Evidence: `newOwnerId === session.userId` is accepted (a no-op that juggles roles). If the owner's membership row is missing (data drift), `update` throws P2025, giving a 500. `newOwnerId` isn't type-checked.
- Fix: reject self-transfer, use upserts or handle P2025, and validate with zod.

#### F-059: Dead or duplicate endpoints enlarge the attack surface
- Severity: Low · CONFIRMED · Effort: S
- Files: `src/app/api/loans/route.ts` (GET and POST unused by the client), `src/app/api/transactions/route.ts` and `transactions/[id]/route.ts` (unused), `src/app/api/users/search/route.ts` (unused)
- Evidence: the client `fetch` inventory (`grep fetch("/api/...` across `src/components`, `src/app`, `src/lib`) shows no callers.
- Fix: remove them, or bring them to the same authorization standard as sync push.

---

## 4. Recommended remediation order

1. **Before any deployment (same day):**
   - F-007: gate or remove `/api/test`, and set `E2E_MODE=0` in the example.
   - F-020, F-021, F-022: fail fast on missing secrets.
   - F-023: make the webhook public.
   - F-006: remove the fixture auto-creation.
2. **Authorization rewrite of `sync/push` (F-001 to F-005, F-013):**
   - Write one `authorize(entity, op, row, user, roleMap)` policy module that mirrors the PRD capability matrix.
   - Load the row first, then authorize, then write. Never upsert blindly.
   - Validate every mutation with zod discriminated unions.
   - Add integration tests per role × entity × op, including the cross-user cases above.
3. **REST route ownership checks:** F-008 to F-012 (a shared `assertCanWriteAccount`, `authorizeLoan`, `authorizeFd`).
4. **Auth hardening:** F-024, F-025, F-016, F-017, F-018, F-026, F-027, F-028/F-029.
5. **Financial correctness:** F-030 to F-034 (transactions, idempotency keys, row claims, sync watermark).
6. **Operations:** F-035 to F-039 and F-046/F-047 (pagination, cron efficiency and locking, real push delivery, a real job queue, Dockerfile, migrations).
7. **Cleanup:** F-040 to F-059.

## 5. What I could not verify
- Lint, typecheck and build: `node_modules` is absent, and installing would change the workspace.
- Runtime behavior of Next 16 `cacheComponents` prerendering for `vapid-public-key` and `health` (F-038, F-056). I reasoned from the official docs, not from a build.
- Whether system categories with `userId: null` exist in production data (F-005). Only the test seed path creates them.
- Client-side handling of role downgrades (F-015).

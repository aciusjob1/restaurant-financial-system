# Security audit

Date: 2026-10-16

A targeted security review of the backend and frontend. Scope was
deliberately narrow: find real vulnerabilities, not perform a full
code audit. The classes checked were the ones that automated tools
can find plus the ones they cannot.

## What was checked

### Automated

- **Gitleaks 8.30.1** against the full git history (136 commits,
  3 MB). No secrets committed. `backend/.env` was never tracked.
- **`pnpm audit`** against the lockfile. See findings below.
- **Raw SQL surface.** Every `$queryRawUnsafe` / `$executeRawUnsafe`
  call site read. All nine use module-level constants for table and
  sequence names, or parameterized placeholders. No injection surface.

### Manual

- **Express configuration** (`backend/src/app.ts`). helmet enabled,
  CORS locked to `env.CORS_ORIGIN` (not `*`), JSON body limited to
  1 MB, `x-powered-by` disabled.
- **Auth rate limiting** (`backend/src/middleware/rateLimit.ts`).
  Three limiters: password login, PIN+username, PIN-only. All keyed
  per-IP, `skipSuccessfulRequests: true`, tighter in production.
  Per-account lockout in `authService` is atomic (SQL increment,
  not read-then-check).
- **Route-level authorization.** Every route file read end to end.
  Every mutation is `requireRole`-gated with the correct role set.
  Every read that returns sensitive data is gated too.
- **Controller-level authorization.** `userController` enforces
  fine-grained rules (manager can only edit waiters, cannot change
  roles or status, cannot self-deactivate). `dailyCashReceiptController`
  forces waiters to their own user ID on the `?userId=` override.
- **Service-level authorization.** Approximately 40 service functions
  read in full. Every mutation checks the actor's role. Where an
  ownership check is meaningful (expense edit, reconciliation creation,
  shift close), it is enforced in the service.

## Findings

### Fixed

**`GET /api/v1/daily-cash-receipts` had no role gate.**
The `/ops/cash` page in the UI is behind `OpsShell`, which allows
only OWNER and MANAGER. The underlying API route only required
`requireAuth`, so any authenticated user — including a waiter —
could call `GET /api/v1/daily-cash-receipts?businessDate=...` and
receive every waiter's daily cash summary for a date: sales,
collections, expenses, expected net, receipt status.

Fixed in commit `c52409a`. Added `requireRole('OWNER', 'MANAGER',
'AUDITOR')`. Regression test in `e2e/authorization.spec.ts`.

**`.env.example` placeholder tripped gitleaks.** False positive —
the string `replace-with-12-plus-chars` matched the generic-api-key
heuristic. Fixed in commit `5f8be82`. Placeholders reworded to
`<angle-bracket>` form, `.gitleaks.toml` added with a path allowlist
for the template file.

### Deferred

**Next.js 14.2.15** — 8 critical advisories including an
authorization bypass in middleware and two RCE paths (one
Windows-specific). Patched version is `>=15.5.24`. This is a major
version upgrade and needs its own session: install, typecheck,
backend test suite, e2e suite, fix what Next 15 breaks.

**Electron 32.3.3** — many high-severity advisories, mostly context
isolation bypass and command injection. Patched in `39.8.10`+.
Priority depends on whether Electron is a shipped product or a
development tool.

**Vitest 2.1.9** — one critical (arbitrary file read via the UI
server) but only when the UI server is running. Tests run headless
in this project, so exposure is nil. Patched in `>=3.2.6`. Low
priority.

### Not findings

Two things I initially flagged as suspicious and cleared after
reading the code they call:

- `userService.createUser` and `userService.updateUser` have no actor
  parameter and no internal role check. This looked like privilege
  escalation. It is not: `userController.updateUser` enforces the
  role rules before calling the service, and `POST /api/v1/users` is
  `requireRole('OWNER')` at the route.
- `shiftCloseService.completeShift`, `submitShift`, `closeMoney` are
  thin wrappers that pass `actor` through without touching it. The
  guard is in `runShiftClose`, which rejects any actor that is not
  OWNER or MANAGER.

## What this audit did not cover

- **Business logic correctness.** A miscalculated total, a wrong
  date boundary, or a rounding error would not be caught by this
  review. `reportsService` (800+ lines of read-only aggregation) was
  not read at all.
- **Frontend rendering.** Whether pages display the correct data,
  handle errors properly, or have the right loading states.
- **Validators.** Every Zod schema was assumed correct from shape
  alone.
- **The Electron workspace.** Never read.
- **Migrations and schema design.** Cascade directions, index
  coverage, denormalization decisions.

A full audit would cover those. This one covered the attack surface.

## Summary

One real vulnerability found and fixed. The rest of the authorization
surface held up under reading. The remaining items are dependency
upgrades, not code defects.
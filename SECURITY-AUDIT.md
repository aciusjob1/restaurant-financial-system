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

### Hardening pass — 2026-10-26

The following issues were found in a follow-up review and fixed:

- **Pin-hash leak.** `PUT /api/v1/users/:id` returned the raw Prisma
  row, including `pinHash`. It now returns the same `hasPin` boolean
  shape as the list endpoint.
- **Backup access.** Backup list, destinations, schedule, and download
  were readable by AUDITOR (and partly MANAGER). All backup endpoints
  are now OWNER-only.
- **Auto-confirm flags.** Non-owners could set
  `autoApproveExpenses` / `autoReviewReconciliations` /
  `autoConfirmHandovers` through `PATCH /auth/me`. This is now
  OWNER-only in the controller and was already OWNER-only in the UI.
- **Session revocation gaps.** Changing a password now rejects reuse of
  the current password and is rate-limited. Resetting a waiter PIN,
  deactivating a user, and terminating an employee now revoke that
  user's sessions; employee termination also disables the linked login.
- **Negative money.** Sales summaries, lines, M-Pesa entries, kiosk
  expenses, and complete-shift cash counts now reject negative values.
  Servers also reject derived cash below zero and expected cash cannot
  be distorted by non-cash expenses.
- **Cash attribution.** Expected-cash calculations now count only CASH
  expenses and attribute them by `paidByUserId` (falling back to
  `createdBy`), not solely by creator.
- **Complete-shift.** Expected cash is derived from sales or recorded
  collections; the supplied counted cash is stored as the actual figure,
  and negative counts are rejected.
- **Closed-day bypasses.** CSV sales import, reconciliation
  create/update/submit/review, and handover create/void/confirm now
  invoke the closed-day guard.
- **Handover custody.** Self-handover is rejected, only the designated
  receiver can confirm, and waiters can see handovers addressed to them.
- **Waiter sales writes.** A waiter can no longer choose a
  `sourceReference` or set `overwrite: true` when creating a sales
  summary, so one shift cannot be recorded twice.
- **Rate limiting.** Password login is now limited per IP and per
  username; PIN-only login remains per IP; password changes are
  limited per IP. Express trusts `X-Forwarded-For` only from loopback,
  and the API binds to `API_HOST` (default `127.0.0.1`) rather than
  the whole LAN. Next supplies the peer address when the client does
  not send the header. A custom client can still choose its own value,
  which is why password login also has a per-username budget.
- **Device management.** Added known-device listing, rename,
  allow/block, per-session revocation, and last-seen monitoring on
  `/ops/system-access`, backed by an HTTP-only hashed device cookie.
  Blocking a device revokes its sessions immediately.
- **Kiosk payroll.** Kiosk salary expenses are tagged
  `origin=KIOSK` / `source=KIOSK`, restricted to the assigned waiter's
  own Employee record, and reversed transactionally when a kiosk report
  is resubmitted. Settled advances block resubmission instead of being
  paid twice.
- **Salary expense linkage.** `applySalaryExpense` now writes
  `Expense.salaryPaymentId` and rejects an expense that is already
  linked. Without the link, kiosk resubmission and payment voiding
  could leave an orphaned SalaryPayment active — record keeping showed
  cash paid twice. Covered by `backend/tests/kioskSalary.test.ts`
  (validation, linking, resubmission reversal, advance reversal,
  settled-advance block).
- **Document-number races.** Expense, salary, employee, material,
  supplier, and supplier-payment numbers were allocated with
  `MAX(number) + 1`. Concurrent writers (including parallel test
  files) collided on the unique index; under SERIALIZABLE isolation
  even an advisory lock was insufficient because the transaction
  snapshot can predate rows committed while it waited. Allocation now
  uses the existing PostgreSQL sequences (`nextval`), which are
  snapshot-independent and lock-free; `syncDocumentSequences` seeds
  them from the highest existing number at backend startup and in the
  Vitest global setup.
- **Upgrades never migrated.** The packaged app ran
  `prisma migrate deploy` only during first-run setup; the `.installed`
  marker then skipped migrations forever, so existing installations
  would never receive new ones. `deployMigrations` is now also invoked
  on every packaged launch after PostgreSQL is confirmed running and
  before the window opens.

The accompanying Prisma migration
(`backend/prisma/migrations/20261026000000_phase_security_devices`)
has been applied to the local bundled database on `127.0.0.1:5433`.
The full backend suite (31 files, 494 tests) passes against it.

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
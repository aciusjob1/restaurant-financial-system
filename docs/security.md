# Security — Restaurant Financial & Cash Management System

**Purpose:** document the security model as it exists today, and name
the pieces Phase 20 will harden. This file describes current behaviour,
not aspirations.

---

## Trust boundaries

    Browser (LAN / kiosk tablet)
       |
       |  HTTP, session + device cookies (HTTP-only)
       v
    Next.js server  (0.0.0.0:3000; proxy in frontend/middleware.ts)
       |
       |  HTTP to 127.0.0.1, X-Forwarded-For overwritten with the real peer
       v
    Express backend     (API_HOST, default 127.0.0.1:4000)
       |
       |  TCP, DATABASE_URL credentials
       v
    PostgreSQL

Rules:

- The browser never talks to PostgreSQL directly.
- The browser never sees a database password, session token, or hashing
  secret. All secrets live in `backend/.env` and never leave the backend.
- `/api/v1/*` and `/health` are proxied by Next.js to the backend. The
  backend binds to loopback by default (`API_HOST=127.0.0.1`), so the
  only LAN-facing service is Next.js. Set `API_HOST` explicitly if a
  deployment really needs direct API access.
- Express trusts `X-Forwarded-For` only from loopback. Next fills that
  header from the peer address when the client does not send one. IP
  limits are therefore meaningful for ordinary clients; password login
  is additionally limited per username so rotating addresses does not
  grant unlimited guesses against one account.

---

## Authentication

- **Session cookie only.** Login (`POST /api/v1/auth/login`) creates a
  row in the `Session` table and sets an HTTP-only cookie. The name of
  the cookie is `env.SESSION_COOKIE_NAME`.
- **Token storage is hashed.** The raw session token exists only in the
  browser cookie. The database stores a hash of it, computed by
  `hashSessionToken` in `backend/src/lib/session.ts`. If the database
  leaks, the tokens are useless without the hashing secret.
- **`requireAuth`** is the only place the session cookie is read. It
  looks up the session, checks `expiresAt`, `revokedAt`, the linked
  user's `isActive`, and the device's access status, then attaches
  `req.user`, `req.sessionId`, and `req.deviceId`. Expired or revoked
  sessions are cleared on read.
- **Device identity.** On first login the backend issues an additional
  HTTP-only `rfs_device` cookie (opaque random value, hashed in the
  `Device` table). Every subsequent request is tied to that device.
  Blocking a device revokes all of its active sessions immediately.
- **Logout** revokes the session row and clears the cookie. Changing a
  password, resetting a PIN, deactivating a user, or terminating an
  employee revokes the affected sessions and forces re-login.
- **No bearer tokens, no `localStorage`.** The browser never holds an
  auth artifact that JavaScript can read.
- **PIN-only login** resolves the user through an HMAC of the PIN, so a
  wrong PIN touches no user row and cannot lock a waiter out. Rate
  limiting plus argon2 verification are the defenses for that route.
- **Password policy.** New accounts and password changes require at
  least 12 characters. Changing a password requires the current one,
  rejects reuse of it, and is rate-limited per IP. Login still accepts
  older passwords down to the existing 8-character minimum so the
  policy can be introduced without a forced reset.

---

## Authorization

Two layers, both server-side:

1. **`requireRole(...)`** — role gate per route. Returns 403 if the
   authenticated user's role is not in the allow-list.
2. **Object-level checks in services** — beyond role, some operations
   require ownership. Waiters can only see their own shifts,
   collections, and reconciliations. Managers cannot approve their own
   expenses or salaries. A waiter cannot submit a reconciliation for
   another waiter.

The frontend never decides access. It may hide UI for clarity, but the
gate is always `requireRole` on the backend. A WAITER who crafts a raw
HTTP request for an OWNER-only endpoint still receives 403.

### Roles

- **OWNER** — full control. Only role that can reopen a closed day and
  the only role that can list, download, or restore backups (a backup
  contains every password and PIN hash).
- **MANAGER** — operational control. Cannot reopen a closed day. May
  list/rename devices and allow/block them, but cannot block a device
  used by an OWNER or revoke an OWNER's session.
- **WAITER** — shift-scoped. Own shifts, own collections, own
  reconciliation, own handover. The kiosk may record a salary expense
  only for the waiter's own linked Employee record.
- **AUDITOR** — read-only across all modules. No access to backups or
  device administration.

### Matrix (summary)

| Domain | OWNER | MANAGER | WAITER | AUDITOR |
|---|---|---|---|---|
| Users, roles | read/write | read | none | read |
| Positions, employees | read/write | read/write | none | read |
| Shifts | read/write | read/write | own only | read |
| Sales summaries | read/write | read/write | create/submit own (kiosk) | read |
| Collections | read/write | read/write | own only | read |
| Reconciliation | read/write | review (not own) | own only | read |
| Cash handover | confirm | confirm (receiver only) | create own; confirm if receiver | read |
| Daily closing | create, reopen | create | none | read |
| Expenses | approve, reject | create, submit | kiosk daily expenses (own) | read |
| Salaries | approve, pay | create | kiosk salary expense (own employee) | read |
| Backups | read/write/restore | none | none | none |
| Devices and sessions | read/write | read/write (owner devices excluded) | none | none |
| Suppliers, purchase invoices | read/write | read/write | none | read |
| Materials, stock movements | read/write | read/write | none | read |
| Reports | read | read | none | read |

Individual route rules are the source of truth. This table is a summary.

---

## Input validation

Every write endpoint validates its body against a Zod schema before the
controller runs. Invalid input returns `400 VALIDATION_ERROR` with the
schema's message. The validator middleware (`validateBody`) is the only
place Zod is invoked on the request path; controllers do not re-parse.

Query strings on report endpoints are validated the same way, so a
malformed `from` or a `from` > `to` range returns `400` before any
database call.

Sales totals and sales lines must be non-negative. Collections, expenses,
and handover amounts must be strictly positive. Negative values were
previously accepted and could be used to inflate expected cash or hide a
shortfall. Services also reject a derived cash figure below zero instead
of trusting the validator alone.

## Closed-day guard

`assertDayNotClosed(businessDate, actorRole)` in
`backend/src/services/closedDayGuard.ts` refuses writes that touch a
closed business day. It is invoked by every service that mutates
financially relevant state: collections, sales summaries (manual entry
and CSV import), reconciliation create/update/submit/review, handover
create/void/confirm, shift close, daily closing, expenses, salaries,
purchase invoice post/cancel, supplier payments, stock movements.

OWNER can reopen a closed day (which creates a new version of the daily
closing) and then make the correction. MANAGER cannot.

## Financial integrity

- **Decimal, not float.** Money and quantities are `Decimal` in
  PostgreSQL and `Prisma.Decimal` in code. They are never `number`.
- **Immutable ledger.** `StockMovement` rows are never updated or
  deleted. Corrections are new rows linked via `reversalOfId`.
- **Transactions wrap multi-step writes.** Posting a purchase invoice,
  cancelling one, applying a stock movement, allocating a payment — all
  happen inside `prisma.$transaction(...)`.
- **Server-computed differences.** Reconciliation cash and mobile
  differences are calculated by the backend from actual and expected
  values. The client cannot post a self-declared difference.
- **Expected cash uses cash movements only.** A M-Pesa, card, or bank
  expense never reduces the drawer. Expense attribution follows
  `paidByUserId` (falling back to the creator), so a manager-entered
  expense lands on the waiter who actually paid it. Counted cash is the
  ACTUAL figure on `complete-shift`; the expected figure is derived from
  sales or recorded collections.
- **Handover custody.** Amounts are positive and validated, creating a
  handover to yourself is rejected, and only the designated receiver
  (`toUserId`) can confirm it.
- **Handover amount** is validated on entry and linked to the shift's
  reconciliation; it is not a server-computed figure.
- **Kiosk payroll is tagged and reversible.** Expenses created through
  the kiosk carry `origin=KIOSK`, salary payments/advances carry
  `source=KIOSK`, and resubmitting a kiosk report reverses the previous
  day's linked salary payment and unsettled advance in the same
  transaction. Manual/payroll entries are never touched by kiosk
  supersession. An advance that has already been settled blocks the
  resubmission with `409 ADVANCE_SETTLED` rather than paying twice.

---

## Frontend posture

- No auth tokens in `localStorage` or `sessionStorage`. Ever.
- No secrets in the frontend build. Only `NEXT_PUBLIC_API_BASE_URL` is
  exposed, and it is a URL, not a credential.
- `apiFetch` is the only path to the backend. It sets
  `credentials: 'include'` and throws a typed `ApiError` on failure.
- Errors from the backend (including 403) are rendered as messages.
  They are not parsed for auth decisions.
- The frontend does not make authorization decisions. It may hide UI,
  but every gate is enforced server-side.

## Device and session management

`/ops/system-access` (OWNER, MANAGER) lists known devices and active
sessions:

- Each device has an opaque key (stored hashed), a renameable label,
  platform/browser summary, last IP, and a throttled last-seen time.
- Devices are `ALLOWED` or `BLOCKED`. Blocking revokes every active
  session for that device in one transaction; login also refuses a
  blocked device.
- Sessions can be revoked individually. Self-revocation through the
  admin endpoint is rejected, and a MANAGER cannot revoke an OWNER's
  session or block a device used by an OWNER.
- The same page shows the server's LAN address candidates (read-only)
  so staff can reach the kiosk from a phone or tablet.

## Currently in place

- `helmet` — sets standard security headers on every response.
- `cors` — restricted to `CORS_ORIGIN` from `.env`. Not `*`.
- `cookie-parser` — parses the session and device cookies.
- HTTP-only session cookie with server-side hashed token.
- HTTP-only device cookie with server-side hashed key and block list.
- Object-level authorization in services, not just role gates.
- Zod validation on every write and every report query.
- Rate limiting per IP and per username on password login, per IP on
  PIN logins, and per IP on password changes. test mode disables the
  limiters so the suite can log in repeatedly.
- Password policy: 12-character minimum for new passwords, same-as-current
  rejection, and session revocation after a change.
- Backups are OWNER-only.
- Backend listens on loopback by default; X-Forwarded-For is trusted
  only when the immediate peer is loopback.

## Deferred to Phase 20 (Security Hardening)

The following are named here so they are not forgotten, and explicitly
listed as *not yet in place*:

- **CSRF protection** if a non-cookie auth method is ever introduced.
- **Least-privilege PostgreSQL role** for the application — currently
  uses the migration user.
- **Verified production CORS posture** — the dev origin is `localhost:3000`;
  production origin is not yet decided.
- **Secure file upload handling** — expense receipt attachments exist
  but their upload path is not hardened.
- **Dependency upgrades** — Next.js 14.2.15 and Electron 32.3.3 have
  known advisories; see `SECURITY-AUDIT.md`.
- **Content-Security-Policy tuning** beyond helmet defaults.

---

## Related: Data Retention

This document covers session handling, authentication, and access
control. For how the system treats deletion, correction, and
lifecycle across financial records, see:

- `docs/data-retention.md` — Data Retention Policy

The short version: financial and operational records are preserved;
business meaning changes through status and state transitions, not
through row deletion. The only exception is DRAFT purchase invoices,
which can be physically removed before they enter the ledger.

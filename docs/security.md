# Security — Restaurant Financial & Cash Management System

**Purpose:** document the security model as it exists today, and name
the pieces Phase 20 will harden. This file describes current behaviour,
not aspirations.

---

## Trust boundaries

    Browser
       |
       |  HTTP, session cookie (HTTP-only)
       v
    Next.js dev server  (localhost:3000 in dev)
       |
       |  HTTP via apiFetch (credentials: include)
       v
    Express backend     (localhost:4000)
       |
       |  TCP, DATABASE_URL credentials
       v
    PostgreSQL

Rules:

- The browser never talks to PostgreSQL directly.
- The browser never sees a database password, session token, or hashing
  secret. All secrets live in `backend/.env` and never leave the backend.
- The Next.js server is not a proxy; it renders HTML and loads JS. Data
  requests originate in the browser via `apiFetch`, so the same auth
  path applies to reports, /ops, and the dashboard.

---

## Authentication

- **Session cookie only.** Login (`POST /api/v1/auth/login`) creates a
  row in the `Session` table and sets an HTTP-only cookie. The name of
  the cookie is `env.SESSION_COOKIE_NAME`.
- **Token storage is hashed.** The raw session token exists only in the
  browser cookie. The database stores a hash of it, computed by
  `hashSessionToken` in `backend/src/lib/session.ts`. If the database
  leaks, the tokens are useless without the hashing secret.
- **`requireAuth`** is the only place the cookie is read. It looks up the
  session, checks `expiresAt`, checks `user.isActive`, and attaches
  `req.user`. Expired sessions are deleted on read.
- **Logout** revokes the session row and clears the cookie. Changing a
  password clears the cookie and forces re-login.
- **No bearer tokens, no `localStorage`.** The browser never holds an
  auth artifact that JavaScript can read.

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

- **OWNER** — full control. Only role that can reopen a closed day.
- **MANAGER** — operational control. Cannot reopen a closed day.
- **WAITER** — shift-scoped. Own shifts, own collections, own
  reconciliation, own handover.
- **AUDITOR** — read-only across all modules.

### Matrix (summary)

| Domain | OWNER | MANAGER | WAITER | AUDITOR |
|---|---|---|---|---|
| Users, roles | read/write | read | none | read |
| Positions, employees | read/write | read/write | none | read |
| Shifts | read/write | read/write | own only | read |
| Sales summaries | read/write | read/write | none | read |
| Collections | read/write | read/write | own only | read |
| Reconciliation | read/write | review (not own) | own only | read |
| Cash handover | confirm | confirm | create own | read |
| Daily closing | create, reopen | create | none | read |
| Expenses | approve, reject | create, submit | none | read |
| Salaries | approve, pay | create | none | read |
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

## Closed-day guard

`assertDayNotClosed(businessDate, actorRole)` in
`backend/src/services/closedDayGuard.ts` refuses writes that touch a
closed business day. It is invoked by every service that mutates
financially relevant state: collections, reconciliation, handover, daily
closing, expenses, salaries, purchase invoice post/cancel, supplier
payments, stock movements.

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
- **Server-derived handover amount.** The handover amount comes from the
  reconciliation, not from the request body.

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

## Currently in place

- `helmet` — sets standard security headers on every response.
- `cors` — restricted to `CORS_ORIGIN` from `.env`. Not `*`.
- `cookie-parser` — parses the session cookie.
- HTTP-only session cookie with server-side hashed token.
- Object-level authorization in services, not just role gates.
- Zod validation on every write and every report query.

## Deferred to Phase 20 (Security Hardening)

The following are named here so they are not forgotten, and explicitly
listed as *not yet in place*:

- **Rate limiting** on `/api/v1/auth/login` and `/api/v1/auth/change-password`.
- **CSRF protection** if a non-cookie auth method is ever introduced.
- **Least-privilege PostgreSQL role** for the application — currently
  uses the migration user.
- **Session device management** — listing and revoking individual
  sessions per user.
- **Password policy enforcement beyond the minimum length** already in
  the schema validator.
- **Verified production CORS posture** — the dev origin is `localhost:3000`;
  production origin is not yet decided.
- **Secure file upload handling** — expense receipt attachments exist
  but their upload path is not hardened.
- **Trust boundary diagram review** for LAN deployment (Phase 22).

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

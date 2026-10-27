# Role-Based Access Control (RBAC)

**Status:** VERIFIED (2026-09-27)
**Scope:** every UI surface in `frontend/app/` plus the shells that
gate them.
**Authoritative:** the backend `requireRole` middleware on every
`/api/v1/*` route. The frontend gates documented here are UX, not
security boundaries.

---

## 1. Role model

The system defines four roles in the Prisma enum. Three are exercised
in the current UI; one is defined but has no account.

| Role | Purpose | UI surface | Seed account |
|---|---|---|---|
| OWNER | Highest authority. Full access to `/ops`, `/reports`, `/dashboard`. | All manager surfaces | `dev-owner`, `owner` |
| MANAGER | Day-to-day operational controller. Same UI access as OWNER except the OWNER-only actions inside `/ops` (approve salaries, reopen closing days). | All manager surfaces | `demo-manager`, `smoke_*` |
| WAITER | Handles their own shift, collections, reconciliation, handover. | `/kiosk` only | `demo-waiter`, `dev-waiter`, `smoke_*` |
| AUDITOR | Read-only reviewer of financial records. | `/dashboard`, `/reports` | **none — GAP** |
| CASHIER | Defined in the enum; no shell allows it. | **none — GAP** | **none** |

The `AUDITOR` gates exist in code (`ReportShell`, `dashboard/layout`),
but no user account has been seeded with that role. The `CASHIER`
role is defined in Prisma but no shell permits it, so a CASHIER user
would see every shell's denial screen.

---

## 2. UI surfaces

Nine distinct UI surfaces exist, grouped by shell:

| Surface | Gate | Notes |
|---|---|---|
| `/` | public | Unconditional `redirect('/login')` — no role logic |
| `/login` | public | Login form only; does not auto-forward authenticated users |
| `/kiosk` | WAITER only | Single-screen stateful waiter workflow (Phase 18) |
| `/dashboard` | OWNER, MANAGER, AUDITOR | Shell wraps `dashboard/layout.tsx`; WAITER redirects to `/kiosk` |
| `/ops` + 21 sub-routes | OWNER, MANAGER | Shell is `OpsShell.tsx`; every page uses `<OpsShell>` |
| `/reports` + 7 sub-routes | OWNER, MANAGER, AUDITOR | Shell is `ReportShell.tsx` |

The frontend gates live in exactly four places:

KioskShell.tsx ALLOWED_ROLES = ['WAITER']
OpsShell.tsx ALLOWED_ROLES = ['OWNER', 'MANAGER']
ReportShell.tsx ALLOWED_ROLES = ['OWNER', 'MANAGER', 'AUDITOR']
dashboard/layout ALLOWED_ROLES = ['OWNER', 'MANAGER', 'AUDITOR']

WAITER -> /kiosk redirect
Everything else inherits from one of these four shells.

---

## 3. Access matrix (verified)

A Playwright walkthrough on 2026-09-27 exercised every surface above
with each authenticated role, plus an unauthenticated browser context.

| Surface | UNAUTH | WAITER | MANAGER | OWNER |
|---|---|---|---|---|
| `/` | → /login | → /login | → /login | → /login |
| `/dashboard` | → /login | → /kiosk | FULL | FULL |
| `/kiosk` | → /login | FULL | DENIED | DENIED |
| `/ops` | → /login | DENIED | FULL | FULL |
| `/ops/materials` | → /login | DENIED | FULL | FULL |
| `/reports` | → /login | DENIED | FULL | FULL |
| `/reports/daily-sales` | → /login | DENIED | FULL | FULL |

`FULL` = the surface rendered its actual content.
`DENIED` = the shell's permission screen rendered (the page's own
content did not).
`→ /login` = navigation to `/login` (session absent or rejected).
`→ /kiosk` = the surface bounced the user to `/kiosk`.

No unexpected cells. Every gate fired as intended.

AUDITOR and CASHIER are not in the matrix — no test accounts exist.

---

## 4. Post-login landing

The login form reads the role returned by `POST /api/v1/auth/login`
and routes accordingly:

| Role | Lands on |
|---|---|
| WAITER | `/kiosk` |
| MANAGER | `/dashboard` |
| OWNER | `/dashboard` |
| AUDITOR | `/dashboard` (untested — no account) |
| CASHIER | `/dashboard` (untested — no account; every shell will deny) |

Redirect is a single `router.push` in `login/page.tsx`. No
intermediate `/` hop.

---

## 5. What each role sees and does

### OWNER

**Sees:** Dashboard snapshot, full Operations sidebar (16 links),
full Reports sidebar (8 links), Kiosk denial.

**Does:**
- Approve expenses, approve salaries, void salary payments
- Reopen a CLOSED daily-closing record
- List, download, and restore backups (OWNER only; a backup contains
  every password and PIN hash)
- Every MANAGER action below
- The only role permitted self-approval on expenses (Phase 17.6-M4
  addendum)

**Denied:** the waiter kiosk.

### MANAGER

**Sees:** identical UI to OWNER — same sidebar, same pages.

**Does:** everything on `/ops` except OWNER-only actions (approve
salaries, void salary payments, reopen closing, backups). Day-to-day:
- Create/update materials, categories, suppliers, employees, positions
- Record purchase invoices, supplier payments, stock movements, sales
- Review reconciliations (approve or send back)
- Confirm cash handovers addressed to them
- List/rename devices and allow/block device access
- Create / submit / reject expenses (subject to self-approval block)

**Denied:** the waiter kiosk, backups, and OWNER-only actions above.
A MANAGER cannot block a device used by an OWNER, revoke an OWNER's
session, or revoke their own session through the admin endpoint.

**Self-approval note:** a MANAGER who created an expense cannot approve
it (backend rule). An OWNER can approve their own expense; a MANAGER
cannot.

### WAITER

**Sees:** only `/kiosk` — a single stateful screen with no navigation
chrome. All manager surfaces return a denial.

**Does:**
- Start their own shift, declare opening cash
- Record collections against the open shift
- Submit the shift for reconciliation
- Create a reconciliation, enter actuals, submit for review
- Select a MANAGER/OWNER receiver and create the cash handover
- Record the day's M-Pesa collections and daily expenses from the kiosk
- Record a salary expense only for their own linked Employee record;
  if a MANAGER operates the kiosk on their behalf, it targets the same
  assigned waiter's Employee record
- Confirm a cash handover only when they are its designated receiver
- Sign out

**Denied:** `/dashboard`, `/ops/*`, `/reports/*`.

**Cannot:** see other waiters' shifts, approve their own
reconciliation, confirm someone else's handover, choose an arbitrary
salary target, or see any management data.

### AUDITOR (untested — no account)

**Intended:** read-only view of `/dashboard` and `/reports/*`.
**Denied** by code: `/ops/*`, `/kiosk`.

The gates are in place (`ReportShell` and `dashboard/layout` both
allow AUDITOR); the only missing piece is a seeded account.

### CASHIER (untested — no account, no shell)

Defined in the Prisma `Role` enum. No shell allows CASHIER, so a
CASHIER user would land on the denial screen for every surface.
Treat as a role with no current UI surface; either remove the enum
value or add a shell if a CASHIER workflow is needed.

---

## 6. Frontend gate vs backend authority

Every `ALLOWED_ROLES` check in the frontend is a **UX gate only**. The
authoritative check is `requireRole(...)` on the backend route.

Implications:
- A user who bypasses the frontend gate (e.g. curl, direct API call)
  still gets rejected by the backend. No data is exposed by a
  frontend-only gap.
- A frontend gate that's missing entirely (as `ReportShell` was before
  `e18dd7e`) means a user might see the shell render, but every data
  fetch inside it will 401 or 403. That's why the `ReportShell` gate
  was added — to present a clear message rather than a broken page.
- The frontend never renders "because the backend said so." It renders
  what it's coded to render and lets the backend refuse.

---

## 7. Known gaps and open questions

### 7.1 — No seeded AUDITOR account

The AUDITOR role is defined and gated in two shells but has no
account. Either:
- Seed a `demo-auditor` / `AuditorPass!234` account for testing and
  real use, or
- Remove the AUDITOR branch from the shells if the role is not going
  to be used.

The current state — gates present, no user — is safe but untested.

### 7.2 — CASHIER role has no UI surface

Prisma defines `CASHIER`. No shell allows it. Either remove from the
enum or add a shell if a CASHIER workflow is needed.

### 7.3 — Login form does not auto-forward authenticated users

Visiting `/login` with a valid session shows the login form.
Visiting `/` (which redirects to `/login`) has the same behaviour. Not
a security issue; a UX wart. Would be resolved by having `login/page.tsx`
fetch `/me` on mount and redirect if already authenticated.

The current matrix runs used fresh sessions, so this didn't surface as
a failed cell. Worth fixing in a small polish pass.

### 7.4 — Root `/` is a redirect shim

`frontend/app/page.tsx` contains only `redirect('/login')`. This means
every role — including authenticated ones — makes one extra hop if
they navigate to `/`. Consistent with 7.3; same polish pass could
make `/` role-aware.

---

## 8. Verification record

Date: 2026-09-27
Method: Playwright, headless Chromium, one fresh browser context per
role. Script: `$env:TEMP\rfs-ui-test\test-rbac.mjs` (not committed).

Surfaces walked: `/`, `/dashboard`, `/kiosk`, `/ops`, `/ops/materials`,
`/reports`, `/reports/daily-sales`. Seven surfaces × four roles = 28
checks plus four post-login-landing checks.

Result: **28/28 clean.** No unexpected cell in any row.

AUDITOR and CASHIER were not tested (no accounts). Their behaviour is
inferred from the source of the four shells.

---

## 9. Related documents

- `docs/security.md` — session handling, password policy, rate limiting
- `docs/phases/17.6-manager-recording-ui.md` — role table (§12),
  permission tension (§18.5)
- `docs/phases/18-waiter-kiosk.md` — kiosk role model, WAITER-only
- `docs/roadmap.md` — phase ordering
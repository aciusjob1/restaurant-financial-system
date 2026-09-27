# Phase 18 - Waiter Kiosk

**Status:** CLOSED (retrospective, 2026-09-27)
**Predecessor:** Phase 17.7 (Demo Verification)
**Successor:** Phase 19 (Electron Desktop Integration)
**Authoritative for:** the waiter-facing kiosk UI surface and the
WAITER-vs-/ops permission resolution.

**Note on timing.** This document was written after implementation rather
than before. Phase 18 shipped as three commits (18.2a, 18.2b, 18.2c)
without a scope doc of its own. Its only authoritative predecessor
reference was the roadmap section (Phase 18) and the boundary statement
in 17.6 sec.13. This file records what was built, what deviated from the
roadmap's original expectation, and what remains open.

---

## 1. Purpose

Phase 16B delivered the read side of the desktop app. Phase 17.6
delivered the write side for OWNER / MANAGER / AUDITOR. Neither gave
WAITERs a place to do their job. 17.6 sec.18.5 recorded the tension:

> /ops is gated to OWNER/MANAGER (see OpsShell), but collection
> creation, reconciliation creation/editing/submission, and handover
> creation are all WAITER-only in the backend.

Phase 18 resolves this by giving WAITER users their own entry surface:
/kiosk, a single stateful screen optimised for one-handed use on a
shared tablet.

---

## 2. Deliverables (from docs/roadmap.md)

> A single-tablet, one-handed workflow for a waiter on a shared device:
> open shift, declare cash, declare mobile, submit reconciliation,
> create cash handover (manager/owner confirms receipt). Deliberately
> narrow in scope - not thirteen management screens.

---

## 3. Phase boundaries

Phase 18 owns:

- The waiter login redirect to /kiosk
- A single-screen stateful kiosk UI
- Kiosk-side actions: start shift, add collection, submit shift,
  create reconciliation, set actuals, submit reconciliation,
  select receiver, create handover
- The backend additions needed to support those actions when the
  existing API surface was insufficient

Phase 18 does NOT own:

- Manager/Owner review and confirmation (still /ops)
- Electron packaging (Phase 19)
- Report modifications (Phase 16B is closed)
- Employee/payroll UI (separate concern, see 17.6 sec.19.5)
- Shift reopen (model columns exist but no code writes them)
- Any change to /ops pages built in 17.6

---

## 4. Implementation commits

| Commit    | Scope                                                          |
|-----------|----------------------------------------------------------------|
| f496dc7   | 18.2a - GET /api/v1/handovers/receivable-users endpoint        |
| a177f2d   | 18.2b - stateful /kiosk page (shift -> collections -> recon -> handover) |
| f0b0f78   | 18.2c - enforce + recover opening-cash invariant              |

No 18.0 or 18.1 commits exist. Phase 18 begins at 18.2a.

---

## 5. Kiosk state machine

The page renders exactly one stage at a time.
No active shift -> Start-shift form
(businessDate + openingCash required)

Shift OPEN -> Shift card + collections + add form

"Submit shift"

Shift SUBMITTED,
no reconciliation -> "Create reconciliation"

Reconciliation DRAFT -> Actual cash / mobile form

"Save actuals"

"Submit for review"

Reconciliation SUBMITTED -> "Hand over the cash"
(or REVIEWED) + Receiver select (MANAGER/OWNER only)

"Create handover"

Handover PENDING -> "Waiting for manager" + Refresh

Shift CLOSED -> "Day complete"
Verified in V1-V6 browser runs and in the API end-to-end walkthrough.

---

## 6. Backend deviations from roadmap

The roadmap said: "Frontend-only; no backend changes expected." Two
backend changes turned out to be necessary. Both were justified by
17.6 sec.10 (Discovery Rule) in spirit, even though no Phase 18 doc
existed at the time to record them.

### 6.1 - 18.2a: GET /api/v1/handovers/receivable-users

**Discovery.** The kiosk needs to show the waiter a dropdown of valid
handover receivers (MANAGER / OWNER only). The existing
GET /api/v1/users returns all roles and would require the kiosk to
filter client-side, which is not the kiosk's job.

**Fix.** New endpoint with a reduced projection (id, fullName, role
only), active MANAGER/OWNER users only, accessible to
WAITER / MANAGER / OWNER.

**Surface:** 1 service function, 1 controller function, 1 route.
No schema change.

### 6.2 - 18.2c: POST /api/v1/shifts/:id/opening-cash + schema

**Discovery.** The kiosk shipped with an optional openingCash field,
so a shift could reach OPEN with a null opening-cash value and then
be permanently stuck at submit time (backend rejects OPEN -> SUBMITTED
when openingCash IS NULL). Existing test data contained two such shifts.

**Fix (two parts).**

- Part A - tighten the input: /kiosk start-shift form now requires
  opening cash; StartShiftSchema.openingCash is required.
- Part B - audited recovery path: POST /shifts/:id/opening-cash,
  MANAGER/OWNER only, set-once. Adds Shift.openingCashSetByUserId
  (nullable FK, onDelete: RESTRICT) so the actor who supplied the
  missing value is recorded.

**Surface:** 1 migration, 1 column, 1 service function, 1 controller
function, 1 route, 1 validator schema, 7 new tests.

Both deviations were reviewed and locked before implementation.

---

## 7. Verification

### 7.1 - Backend

- pnpm --filter @rfs/backend typecheck - clean
- pnpm --filter @rfs/backend test - 254 / 254
  - 247 pre-existing tests remain green
  - 7 new tests in backend/tests/shiftOpeningCash.test.ts cover
    MANAGER/OWNER recovery, WAITER rejection (403), 404, 409
    not-OPEN, 409 already-set, 400 invalid money,
    openingCashSetByUserId attribution

### 7.2 - API end-to-end

Full lifecycle executed via PowerShell REST calls:
WAITER login -> OPEN shift -> add CASH 500.00 -> submit shift
OWNER review recon (APPROVE)
WAITER create recon -> set actuals -> submit recon
WAITER list receivers -> create handover (PENDING)
OWNER confirm handover
OWNER shift SUBMITTED -> RECONCILING -> CLOSED
Every step returned the expected status; no manual DB intervention.

### 7.3 - Browser (Playwright, headless)

| Run | Verified |
|-----|----------|
| V1  | Login redirect to /kiosk; kiosk renders state-driven UI |
| V3  | Start-shift required opening cash; add collection 100.00; submit shift; recon form with expected cash/mobile |
| V4  | Receiver dropdown populated from /receivable-users; handover created PENDING; owner recon list + detail |
| V5  | Handover PENDING -> CONFIRMED (two-stage confirm); shift SUBMITTED -> RECONCILING |
| V6  | Shift RECONCILING -> CLOSED (two-stage confirm) |

V4-V6 revealed the app's two-stage confirmation pattern for
financially meaningful transitions (button -> dialog -> final
Confirm). This is a design choice, not friction.

### 7.4 - Known issue during V4 (test-side, not app-side)

The v4 script clicked Confirm receipt and Move to Reconciling but
did not then click the dialog's Confirm button. This left the
handover and shift in their pre-transition states until v5 completed
both confirmations. No application defect.

---

## 8. Known gaps (post-Phase-18 backlog)

### 8.1 - Two-stage confirmations not exhaustively exercised

The following transitions exist in the UI and are asserted by the
backend state machine, but were not specifically clicked through in
a browser test:

- Reconciliation "Send back to draft" (MANAGER/OWNER)
- Shift "Send back to Open" (from SUBMITTED)
- Shift "Send back to Submitted" (from RECONCILING)
- Handover rejection / cancellation (no such action exists)

These are backlog items, not Phase 18 scope.

### 8.2 - Kiosk behavior when a reconciliation is sent back

The kiosk has no explicit UI state for "reconciliation was sent back
to draft by manager". The existing DRAFT-stage renderer would fire,
but the transition has not been exercised in a browser test.

### 8.3 - Test-data hygiene

The owner-side lists (shifts, reconciliations, handovers) contain
2099 seed rows (Smoke P8 Waiter, Smoke P10 Waiter, etc.) that appear
alongside live 2026-09-27 data. Demo-seed noise, not a Phase 18
defect. Recorded here for the record. See 17.6 sec.20.5 item 3 for
the precedent.

### 8.4 - Employee-to-User linking

17.6 sec.19.5 recorded that Employee records are created standalone
and that linking them to a login User was "likely Phase 18 Kiosk or
a future user-admin pass". Phase 18 did not address this. The
deliberate separation between employee identity and authentication
identity remains intact.

### 8.5 - Stale /ops/collections link

The /ops landing page links to /ops/collections, which has no
page.tsx. Unrelated to Phase 18, carried forward.

---

## 9. Verification artifacts (not committed)

The Playwright test scripts and screenshots from V1-V6 live under
$env:TEMP and are not part of the repository. They can be regenerated
by re-running the walkthrough.

---

## 10. Phase closure

Phase 18 is **CLOSED** as of 2026-09-27. Last Phase 18 commit: f0b0f78.

No backend work remains. No frontend work remains. Phase 19 (Electron
Desktop Integration) starts from a clean tree.
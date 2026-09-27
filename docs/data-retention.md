# Data Retention Policy

**Status:** VERIFIED (2026-09-27)
**Scope:** how the system treats deletion, correction, and lifecycle
across all domains.

---

## 1. The principle

**Financial and operational records are preserved. Business meaning
changes through status and state transitions, not through row
deletion.**

The only exception is DRAFT documents that have not yet entered the
ledger. A draft is a worksheet; a posted record is a fact. Once a
record is posted/approved/closed, the row stays and any correction is
a new state transition with its own actor and timestamp.

This preserves:

- Historical reporting (a month's totals don't change because a
  supplier was deactivated)
- Auditability (who voided what, when, and why)
- Foreign-key integrity — constraints are used to protect historical
  relationships, with restrictive deletion behavior where appropriate
- Reconciliation calculations (expected vs actual still resolve)
- Accountability for financial actions

---

## 2. Domain-by-domain behaviour

| Domain | Delete? | Correction mechanism |
|---|---|---|
| Suppliers | No | `PATCH` with `isActive: false` |
| Materials | No | `PATCH` with `isActive: false` |
| Material categories | No | `PATCH` with `isActive: false` |
| Expense categories | No | `PATCH` with `isActive: false` |
| Employees | No | `PATCH` with `isActive: false` |
| Positions | No | Create-only (no delete, no edit) |
| Users | No | `PATCH` with `isActive: false` |
| Collections | No | `POST /:id/void` with reason |
| Reconciliations | No | State machine: DRAFT -> SUBMITTED -> REVIEWED; SEND_BACK returns to DRAFT |
| Handovers | No | PENDING -> CONFIRMED (see §4) |
| Shifts | No | State machine: OPEN -> SUBMITTED -> RECONCILING -> CLOSED (terminal) |
| Expenses | No | State machine + `reject` with reason |
| Salaries | No | `POST /:id/void` for payments |
| Salary payments | No | `POST /:id/void` |
| Stock movements | No | Append-only; reversal is a new movement |
| Sales summaries | No | Import or manual; no delete endpoint |
| Purchase invoices (DRAFT) | **Yes** — `DELETE /:id` | Hard delete allowed while DRAFT only |
| Purchase invoice items (DRAFT) | **Yes** — `PUT /:id/items` | Full replace allowed while parent is DRAFT |
| Purchase invoices (posted) | No | `POST /:id/cancel` (row preserved) |
| Supplier payments | No | `POST /:id/void` |
| Payment allocations | No | `POST /:id/void` |
| Daily closing | No | `POST /:id/reopen` (OWNER only) |

---

## 3. The DRAFT carve-out

The route audit verified two physical-removal operations:

- `DELETE /api/v1/purchase-invoices/:id` (delete a DRAFT invoice)
- `PUT /api/v1/purchase-invoices/:id/items` (replace items on a
  DRAFT invoice)

Both are constrained:

- The invoice must still be in DRAFT status. Once `POST /:id/post`
  runs, the invoice becomes immutable and only `POST /:id/cancel` is
  available.
- The nested items router is mounted under
  `purchase-invoices/:id/items`. The parent service rejects replace
  attempts on non-DRAFT invoices.
- The FK from `PurchaseItem` back to `PurchaseInvoice` uses
  `onDelete: Cascade` — deliberate, because items cannot exist
  without their invoice.

Rationale: a DRAFT invoice has not yet affected supplier balances,
stock levels, or reports. It is a working document. Deleting it
restores the state that existed before anyone started filling it in.
Once posted, the invoice is a ledger event and follows the
no-hard-delete rule.

---

## 4. Open question — PENDING handovers

A CashHandover has exactly two states: `PENDING` and `CONFIRMED`.
There is no cancel, reject, or void action. Once a waiter creates a
handover, it stays PENDING until a MANAGER or OWNER confirms it.

**Scenario:** a waiter creates a handover with an incorrect receiver,
or a manager notices a data error before confirming. There is no
built-in way to undo it.

**This is not currently a data-loss risk** — the handover row is
preserved either way. But it is a workflow gap: the only way to
correct a bad PENDING handover is to confirm it and then correct
downstream records manually, or leave it hanging forever.

**This is backlogged, not solved.** When it is eventually designed,
the question of who may cancel (waiter, manager/owner, or both)
should be answered from the real operational workflow, not assumed
now. Candidate mechanisms to consider:

- Add a `CANCELLED` state, actor TBD.
- Add a `REJECTED` state, actor MANAGER/OWNER (mirrors reconciliation
  SEND_BACK).
- Leave as-is and document the limitation.

The record-preservation angle is already handled by the existing
schema; the open question is purely about workflow.

This is a backlog item, not a blocker for Phase 19.

---

## 5. What users should expect

- **Nothing they create is silently lost.** Records persist unless
  they are DRAFT purchase invoices.
- **Financially significant actions are not silently erased.**
  Lifecycle transitions preserve the underlying record and record the
  relevant actor and timestamp; transitions that require
  justification also record a reason.
- **Deactivating is not deleting.** A deactivated supplier still
  appears in historical invoices and reports. That is intentional.
- **Mistakes are corrected by adding a new state, not by removing the
  old one.** A voided collection shows `voidedAt` and `voidReason`;
  it is not removed from the shift totals — it is excluded from
  calculations by the backend, and the exclusion is itself auditable.

---

## 6. Verification

Route audit on 2026-09-27 across all files under `backend/src/routes`:

| Method | Count | Note |
|---|---|---|
| GET | 51 | Read-only |
| POST | 41 | Creates or state transitions |
| PATCH | 12 | Updates (including `isActive`) |
| PUT | 1 | `replaceItems` on DRAFT invoice |
| DELETE | 1 | `deleteDraftInvoice` on DRAFT invoice |

Total: **2 strong mutating endpoints**, both scoped to DRAFT purchase
invoices. Every other state change is a POST or PATCH that preserves
the row.

Note: the initial route scan misattributed the DELETE endpoint to
suppliers. Manual inspection of `supplierRoutes.ts` confirmed the
route belongs to `purchaseInvoiceRouter`. The route count remains
accurate; the ownership was corrected by reading the source.

---

## 7. Related documents

- `docs/security.md` — session handling, password policy
- `docs/rbac.md` — role and surface reference
- `docs/phases/17.6-manager-recording-ui.md` — domain lifecycle notes
- `docs/phases/18-waiter-kiosk.md` — kiosk state machine
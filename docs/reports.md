# Reports API

**Purpose:** reference for the seven read-only report endpoints consumed
by the frontend report pages. Everything here is served by
`backend/src/services/reportsService.ts` and mounted at
`/api/v1/reports` by `backend/src/routes/reportsRoutes.ts`.

---

## Common conventions

- **Auth:** `requireAuth` + `requireRole('OWNER', 'MANAGER', 'AUDITOR')`.
  WAITER receives `403 FORBIDDEN`.
- **Date range:** `from` and `to` are required, `YYYY-MM-DD`. `from` must
  be on or before `to`. Maximum span is 366 days. Violations return
  `400 INVALID_RANGE` or `400 RANGE_TOO_LARGE`.
- **Pagination:** `limit` defaults to 100, maximum 500. `offset` defaults
  to 0. Totals are computed across the full filtered range, not the
  paginated slice.
- **Serialization:** every monetary value is a decimal *string*
  (`"1234.00"`). Every quantity is a decimal string with three places
  (`"100.000"`). The frontend never re-parses these into JS `number`.
- **Response envelope:** every response begins with `success: true`,
  followed by `rows` (an array) and `totals` (an object with pre-computed
  aggregates). The frontend displays strings as-received.

---

## Response contract

For every endpoint below:

    {
      "success": true,
      "rows": [ ... ],
      "totals": { ... }
    }

- `rows` is paginated, ordered newest-first unless stated otherwise.
- `totals` covers the entire filtered range, independent of pagination.
- `totals.rowCount` or `totals.count` indicates how many rows matched.
- Empty ranges return `rows: []` with zero-valued totals. They never
  return `404`.

### Error codes

- `400 VALIDATION_ERROR` — malformed query parameter.
- `400 INVALID_RANGE` — `from` is after `to`.
- `400 RANGE_TOO_LARGE` — span exceeds 366 days.
- `401 UNAUTHENTICATED` — no valid session.
- `403 FORBIDDEN` — authenticated but wrong role.
- `500` — unexpected server error, logged backend-side.

---

## 1. GET /api/v1/reports/daily-sales

**Params:** `from`, `to`, `limit`, `offset`.

**Rows:** one per business date with a SalesSummary, DailyClosing,
Collection, Handover, or Expense recorded against it. Fields include:
`businessDate`, `salesTotal`, `cashSales`, `mobileSales`, `otherSales`,
`collectionsTotal`, `expectedCash`, `expectedMobile`, `actualCash`,
`actualMobile`, `cashDifference`, `mobileDifference`, `handoverTotal`,
`expenseTotal`, `closingStatus`.

**Totals:** `salesTotal`, `expenseTotal`, `cashDifference`,
`mobileDifference`, `handoverTotal`, `rowCount`.

---

## 2. GET /api/v1/reports/reconciliations

**Params:** `from`, `to`, `userId`, `limit`, `offset`.

**Rows:** one per reconciliation in the range. Fields include:
`id`, `businessDate`, `userId`, `username`, `fullName`, `shiftId`,
`expectedCash`, `expectedMobile`, `actualCash`, `actualMobile`,
`cashDifference`, `mobileDifference`, `status`, `submittedAt`,
`reviewedBy`, `reviewedAt`.

**Totals:** `cashDifference`, `mobileDifference`, `count`.

**Notes:** `userId` filter narrows to a single waiter. Differences are
nullable for reconciliations that have not been submitted.

---

## 3. GET /api/v1/reports/handovers

**Params:** `from`, `to`, `fromUserId`, `toUserId`, `status`, `limit`, `offset`.

**Rows:** one per handover. Fields include: `id`, `businessDate`,
`reconciliationId`, `fromUserId`, `fromUsername`, `fromFullName`,
`toUserId`, `toUsername`, `toFullName`, `amount`, `status`,
`handedOverAt`, `confirmedAt`.

**Totals:** `amount`, `pendingCount`, `pendingAmount`, `confirmedCount`,
`confirmedAmount`, `rowCount`.

**Notes:** `status` accepts `PENDING` or `CONFIRMED`.

---

## 4. GET /api/v1/reports/expenses

**Params:** `from`, `to`, `categoryId`, `status`, `paymentMethod`,
`limit`, `offset`.

**Rows:** one per expense. Fields include: `id`, `expenseNumber`,
`businessDate`, `categoryId`, `categoryName`, `amount`, `paymentMethod`,
`description`, `status`, `createdByUsername`, `approvedByUsername`,
`approvedAt`.

**Totals:** `amount`, `cashAmount`, `nonCashAmount`, `rowCount`,
`byCategory` (array of `{ categoryId, categoryName, amount }`).

**Notes:** `status` accepts `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`.

---

## 5. GET /api/v1/reports/supplier-balances

**Params:** `includeInactive` (optional, default false).

**Rows:** one per supplier. Fields include: `supplierId`,
`supplierNumber`, `name`, `totalInvoiced`, `totalPaid`,
`totalAllocated`, `totalUnallocated`, `balance`, `isActive`.

**Totals:** `balance`, `invoiced`, `paid`.

**Notes:** balance is invoiced minus allocated. No date filter — this is
a live snapshot of outstanding liability.

---

## 6. GET /api/v1/reports/sales-vs-pos

**Params:** `from`, `to`, `limit`, `offset`.

**Rows:** one per business date. Fields include: `businessDate`,
`posTotal`, `posCash`, `posMobile`, `posOther`, `collectionsTotal`,
`collectionsCash`, `collectionsMobile`, `collectionsOther`,
`cashVariance`, `mobileVariance`, `otherVariance`, `isReconciled`.

**Totals:** `cashVariance`, `mobileVariance`, `otherVariance`, `rowCount`.

**Notes:** `isReconciled` is true when all three variances are `0.00`.

---

## 7. GET /api/v1/reports/stock-movements

**Params:** `from`, `to`, `materialId`, `type`, `direction`, `limit`,
`offset`.

**Rows:** same shape as the raw `/api/v1/stock-movements` list
(`id`, `movementNumber`, `materialId`, `materialName`, `type`,
`direction`, `businessDate`, `quantity`, `unitCost`, `totalCost`,
`reference`, `notes`, `createdBy`, `createdAt`), plus `materialName`.

**Totals:** `totalIn`, `totalOut`, `netChange`, `movementCount`,
`byType` (array of `{ type, count, totalIn, totalOut }`).

**Notes:** `type` accepts `PURCHASE`, `OPENING`, `CONSUMPTION`, `WASTE`,
`ADJUSTMENT`. `direction` accepts `IN` or `OUT`.

---

## Frontend mapping

Each report endpoint is consumed by exactly one page under
`frontend/app/reports/`:

| Endpoint | Page | Landing card |
|---|---|---|
| daily-sales | `/reports/daily-sales` | Daily Sales & Cash Position |
| reconciliations | `/reports/reconciliations` | Reconciliation Summary |
| handovers | `/reports/handovers` | Cash Handover Ledger |
| expenses | `/reports/expenses` | Expenses |
| supplier-balances | `/reports/supplier-balances` | Supplier Balances |
| sales-vs-pos | `/reports/sales-vs-pos` | Sales vs POS |
| stock-movements | `/reports/stock-movements` | Stock Movements |

All seven cards appear on `/reports`. The dashboard (`/dashboard`) shows
a five-value snapshot drawn from `daily-sales`, `handovers`, and
`supplier-balances`.

## Adding a new report

The pattern to follow:

1. Add a `xxxReport` function to `backend/src/services/reportsService.ts`.
2. Export it from `backend/src/controllers/reportsController.ts` with a
   thin handler that calls `assertValidRange` and the service.
3. Add a query schema to `backend/src/validators/reports.ts`.
4. Mount it in `backend/src/routes/reportsRoutes.ts` under `/api/v1/reports`.
5. Add the path to `REPORT_PATHS` in `frontend/lib/reports.ts`.
6. Add a page under `frontend/app/reports/<name>/page.tsx` using
   `useReport`, `FilterBar`, `DataTable`, `TotalsRow`.
7. Add a card to the `REPORTS` array in
   `frontend/app/reports/page.tsx` so the hub links to it.
8. Add tests to `backend/tests/reports.test.ts`: happy path, date range
   filtering, empty range, RBAC for WAITER, decimal precision.

Rule: totals computed across the whole filtered range, rows paginated.
Decimal strings at the API boundary. No client-side math.

## Related documents

- `docs/architecture.md` — layered structure and invariants
- `docs/security.md` — RBAC matrix and trust boundaries
- `docs/roadmap.md` — where each phase sits
- `docs/phases/17.6-manager-recording-ui.md` — the write-side counterpart

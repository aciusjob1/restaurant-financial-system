# Architecture — Restaurant Financial & Cash Management System

**Purpose:** describe the shape of the system — its layers, the flow of a
request, and the rules that keep the financial calculations trustworthy.
This is the document to read before adding a new module.

---

## Stack

- **Monorepo:** pnpm workspaces
- **Backend:** Node.js + Express + TypeScript
- **ORM:** Prisma 5
- **Database:** PostgreSQL
- **Frontend:** Next.js 14 (App Router) + React 18 + Tailwind
- **Desktop:** Electron (Phase 19)
- **Shared types:** `@rfs/shared` workspace package (Zod)

---

## Layers

Requests flow down the layers on the way in, and up the layers on the
way out:

    PostgreSQL
        ^
    Prisma schema + client
        ^
    Service layer         (business rules, transactions)
        ^
    Controller layer      (HTTP, request shape)
        ^
    Router + middleware   (auth, RBAC, validation)
        ^
    Express app           (mounts /api/v1/*)
        ^
    HTTP
        ^
    Frontend apiFetch     (client-side, credentials: include)
        ^
    React pages           (read for reports, write for /ops in 17.6)

Each layer has a single responsibility and does not skip over its
neighbours. A React page never calls Prisma directly. A service never
writes HTTP responses. A controller never contains business logic.

---

## Request flow — a write

Example: POST /api/v1/collections

1. **Router** — `backend/src/routes/collectionRoutes.ts` matches the path.
2. **requireAuth** — reads `req.cookies[env.SESSION_COOKIE_NAME]`,
   looks up the hashed token in `Session`, attaches `req.user`.
3. **requireRole(...)** — checks `req.user.role` against the allow-list.
4. **validateBody(...)** — runs the Zod schema from `backend/src/validators/`.
5. **Controller** — extracts `req.body`, calls the service.
6. **Service** — opens a transaction if needed, calls Prisma, applies
   business rules.
7. **Prisma client** — issues SQL to PostgreSQL.
8. **Controller** — serialises the result (decimal strings for money and
   quantities), calls `res.json(...)`.

Every error thrown as `ApiError(status, code, message)` is turned into a
JSON error response by the global error middleware in `app.ts`.

---

## Invariants

These are the rules the system relies on. Breaking one is a bug, not a
trade-off.

1. **All money and quantity values are Decimal in PostgreSQL,
   `Prisma.Decimal` in code, and decimal *strings* over the API.** They
   are never `number` after leaving the database.
2. **No client-side financial math.** Reports and pages display strings
   returned by the backend. The frontend does not `parseFloat`, sum,
   round, or compare them numerically.
3. **Transactions protect multi-step writes.** Anything that touches more
   than one row — posting a purchase invoice, cancelling one, applying a
   stock movement — happens inside `prisma.$transaction(...)`.
4. **The ledger wins.** `Material.currentStock` is a cache of the
   `StockMovement` ledger. If they disagree, the ledger is correct.
5. **Audit-relevant actions cannot be undone.** Posted invoices are
   cancelled, not deleted. Stock movements are reversed, not removed.
   Sessions are revoked, not forgotten.
6. **Closed business days are closed.** Writes that touch a closed day
   are refused by the same guard across all relevant modules.
7. **Auth is cookie-only.** No bearer tokens, no `localStorage`. The
   session lives in an HTTP-only cookie and is hashed server-side.

---

## Adding a new module

The pattern every phase since Phase 2 has followed:

1. **Prisma schema** — add the model(s), generate a migration, regenerate
   the client.
2. **Shared types + validators** — `@rfs/shared` for anything the frontend
   will consume; `backend/src/validators/<name>.ts` for request shapes.
3. **Service** — business logic, transactions, business-rule guards.
4. **Controller** — thin HTTP adapter over the service.
5. **Router** — wire paths, mount auth and RBAC, attach validators.
6. **Mount** — one line in `backend/src/app.ts`.
7. **Tests** — happy path, validation failures, RBAC failures, edge cases
   (empty results, closed days, insufficient stock, etc.).
8. **Frontend (if applicable)** — an `apiFetch`-based page, no math, no
   direct `fetch`.

Every step is committed separately so a bug in the migration does not get
mixed with a bug in the service.

---

## Frontend conventions

- **Client Components for everything in 16B and 17.6.** Server Components
  are a possible future refactor; see `docs/roadmap.md`. Doing it now
  would create two auth patterns side by side for no concrete gain.
- **One `apiFetch`.** `frontend/lib/api.ts` is the only place the app
  talks to the backend. It sets `credentials` to include cookies, parses
  JSON, and throws a typed `ApiError`.
- **URL-driven filters.** Report and ops pages derive their query strings
  from `useSearchParams()`. No client state, no `localStorage`.
- **No third-party UI libraries.** Tailwind + plain HTML is sufficient.
  Every new dependency needs a named, reviewed decision.
- **`ApiError` has a contract.** `status` for branching (401 to redirect,
  403 to inline message), `code` and `message` for display.

---

## Where things live

    backend/
      prisma/
        schema.prisma
        migrations/
        raw-sql/              (sequences, indexes applied after migrate)
      src/
        app.ts                (mounts routers)
        server.ts             (listen)
        config/env.ts         (validated env)
        lib/                  (prisma, session, helpers)
        middleware/           (auth, validate, error)
        services/             (business logic)
        controllers/          (HTTP adapters)
        routes/               (path definitions)
        validators/           (Zod schemas)
        errors/ApiError.ts
        utils/                (money, businessDate)
      tests/                  (vitest + supertest)

    frontend/
      app/
        login/  dashboard/
        reports/              (7 report pages + hub)
        ops/                  (17.6 — 13 recording pages + hub)
      components/
        reports/              (ReportShell, DataTable, FilterBar, ...)
        ops/                  (17.6 — Form, ConfirmDialog, ...)
      hooks/                  (useReport, useMutation)
      lib/                    (api, reports, ops)

# Roadmap — Restaurant Financial & Cash Management System

**Status:** authoritative as of Phase 17.5
**Supersedes:** all prior roadmap summaries including the phase list
circulated during Phases 1–14.
**Authoritative for phase scope:** `docs/phases/17.6-manager-recording-ui.md`
(the only phase whose detailed specification lives in its own file).

---

## How to read this

Each phase below lists: **status**, **deliverable**, and **evidence of
completion**. A phase is complete only when its evidence exists — code,
tests, or browser verification — not when its code has merely been
written.

Statuses used:

- `✅ COMPLETE` — verified, evidence cited
- `🟡 SCOPE LOCKED` — spec written, implementation pending
- `⏸️ HELD` — deliberately paused
- `⏭️ NEXT` — not yet started

---

## Phases 1–14 — Foundation through Purchase Items

**Status:** ✅ COMPLETE

**Deliverables:** full-stack foundation (Next.js + Express + Prisma +
PostgreSQL + pnpm monorepo + Electron shell + shared types); users, roles,
and permissions; employees and positions; shift lifecycle; sales summary
and POS import; collections; reconciliation; cash handover; daily closing
with versioning; expenses; salaries and salary payments; suppliers,
purchase invoices, and payment allocations; materials and material
categories; purchase items with posting rules.

**Evidence:** 193 backend tests passing at the end of Phase 14.

---

## Phase 14B — Type-safety cleanup

**Status:** ✅ COMPLETE

**Deliverable:** eliminated 53 TypeScript errors across 16 controllers
introduced by Express 5's stricter `req.params` typing. Added a
`typecheck` script to `backend/package.json`.

**Evidence:** `tsc --noEmit` returns 0 errors; test suite unchanged.

---
## Phase 15 — Inventory & Stock Movements

**Status:** ✅ COMPLETE

**Deliverables:** append-only `StockMovement` ledger with two enums
(`StockMovementType`, `StockMovementDirection`); `Material.currentStock`
cache updated transactionally inside the same transaction as the ledger
insert; auto-creation of `PURCHASE` movements when a purchase invoice is
posted; reversal `ADJUSTMENT` movements when an invoice is cancelled,
linked via `reversalOfId`; guards for future dates, closed days,
insufficient stock, and double reversal; endpoints for manual movements,
material stock summary, and stock valuation.

**Evidence:** migration `20260925070927_phase15_movements`; 18 tests; full
suite at 211/211.

---

## Phase 16A — Reports API

**Status:** ✅ COMPLETE

**Deliverables:** seven report endpoints under `/api/v1/reports/*`
(daily-sales, reconciliations, handovers, expenses, supplier-balances,
sales-vs-pos, stock-movements); shared query validator; date-range guard
(`from ≤ to`, ≤ 366 days); pagination (default 100 / max 500); RBAC
enforcing OWNER / MANAGER / AUDITOR; all money and quantity values
serialized as decimal strings.

**Evidence:** 26 tests; full suite at 237/237; `tsc --noEmit` 0 errors.

---

## Phase 16B — Reports UI

**Status:** ✅ COMPLETE

**Deliverables:** seven `/reports/<domain>` pages in the Next.js app,
each consuming one report endpoint; shared components `ReportShell`,
`FilterBar`, `SelectTool`, `DataTable`, `TotalsRow`, `StateViews`;
`useReport` hook; `/reports` landing page (added in 17.3); dashboard
statistics (added in 17.4). Server-returned decimal strings only — no
client-side financial math.

**Evidence:** frontend production build clean with all seven routes in
the route table; browser-verified end to end.

---

## Phase 17 — Cleanup, Hub, Dashboard, Docs

**Status:** 🟡 PARTIAL — 17.1–17.4 complete; 17.5 in progress; 17.6 scope
locked; 17.7 pending.

| Sub-phase | Status | Summary |
|---|---|---|
| 17.1 Mojibake cleanup | ✅ COMPLETE | Per-line CP1252 recovery on 4 test files; 2 fully clean, 2 improved ~90% |
| 17.2 Remove temp seed | ✅ COMPLETE | Deleted `backend/seed-dev-owner.ts`; no references remain |
| 17.3 Reports landing page | ✅ COMPLETE | `/reports` hub listing the 7 report domains as cards |
| 17.4 Dashboard statistics | ✅ COMPLETE | Five snapshot cards, three parallel fetches, no client math |
| 17.5 Documentation | ▶ IN PROGRESS | This file plus `architecture.md`, `security.md`, `reports.md` |
| 17.6 Manager Recording UI | 🟡 SCOPE LOCKED | See `docs/phases/17.6-manager-recording-ui.md` |
| 17.7 Demo verification | ⏸️ HELD | Full business-day smoke test after 17.6 |

---
## Phase 18 — Waiter Kiosk

**Status:** CLOSED (2026-09-27)

**Deliverables:** a single-tablet, one-handed workflow for a waiter on a
shared device: open shift, declare cash, declare mobile, submit
reconciliation, create cash handover (manager/owner confirms receipt).
Deliberately narrow in scope — not thirteen management screens.

**Note:** Two backend changes were required beyond the original
"frontend-only" expectation — the handover receiver list endpoint (18.2a)
and the opening-cash invariant + recovery path (18.2c). See
`docs/phases/18-waiter-kiosk.md` for the retrospective scope and
verification record.

---

## Phase 19 — Electron Desktop Integration

**Status:** ⏭️ NEXT

**Deliverables:** Electron shell that starts the backend and frontend
locally, hosts the Next.js UI in a desktop window, manages the local
database, and handles printer access and app lifecycle. Produces a
launchable Windows application rather than a set of developer commands.

---

## Phase 20 — Security Hardening

**Status:** ⏭️ NEXT

**Deliverables:** session security review, password policy, rate limiting
on authentication endpoints, CSRF protection where applicable, least-
privilege PostgreSQL role for the application, verified network posture
(browser never touches the database directly), secure file uploads, and
a documented CORS posture for production.

---

## Phase 21 — Backup & Recovery

**Status:** ⏭️ NEXT

**Deliverables:** automatic PostgreSQL backups on a defined schedule,
rotation policy, local and secondary storage, restore procedure, and — the
part that matters — at least one verified successful restore drill.

---

## Phase 22 — LAN Testing

**Status:** ⏭️ NEXT

**Deliverables:** multi-device deployment test on a real restaurant LAN
with a server PC, a manager PC, and at least one tablet. Simulates
Wi-Fi drops, server restarts, concurrent users, and reconciliation /
daily-closing flows under real network conditions.

---

## Phase 23 — Production Installer

**Status:** ⏭️ NEXT

**Deliverables:** a Windows installer that packages the application so the
restaurant needs only Node-free, PostgreSQL-tool-free deployment: first-
run setup, owner account creation, database initialization, Windows app
data directories, logs, backups, printer configuration, update and
uninstall behaviour.

---

## Current snapshot

| Metric | Value |
|---|---|
| Backend tests | 237 / 237 passing |
| Backend typecheck | 0 errors |
| Frontend build | Clean — 13 routes |
| Reports endpoints | 7 |
| Report pages | 7 |
| Recording domains (17.6) | 13 — scope locked |
| Phases complete | 1–16B, 17.1–17.4 |
| Next code deliverable | 17.5 remaining docs, then 17.6 |

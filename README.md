# 🍽️ Restaurant Financial System (RFS)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io)

A secure, offline-first, all-in-one desktop application for managing the financial lifecycle of a restaurant, from the waiter's kiosk to end-of-day reconciliation, payroll, and inventory.

Built with **Electron**, **Next.js**, and a bundled **PostgreSQL** database, RFS compiles into a single Windows `.exe` installer that needs no technical setup from the end user.

---

## ✨ Key Features

### 💰 Financial Integrity & Cash Flow
*   **Daily Cash Flow:** Waiters submit their cash and mobile money (M-Pesa). The system calculates expected cash and requires managers to review every submission before closing the day.
*   **Anti-Fraud Protections:** Waiters cannot overwrite manager-entered sales. Duplicate summaries are blocked. Self-approval of expenses is forbidden.
*   **Payroll Engine:** Create salary records, apply bonuses or deductions, and log partial payments. Kiosk-submitted salary expenses are bound to the waiter's own employee record.
*   **Inventory & Procurement:** Track raw materials, record supplier invoices, and follow stock movements with race-condition-safe document numbering.

### 🔐 Security
*   **Role-Based Access Control:** Distinct roles for **Owner**, **Manager**, **Waiter** (Kiosk), and **Auditor**.
*   **Device Management:** Owners can view every device that has accessed the system and block lost or stolen devices, individually or all at once.
*   **Hashing:** Argon2id for passwords and HMAC-SHA256 for PIN lookups.
*   **Rate Limiting & Lockouts:** Brute-force protection on password and PIN login endpoints.
*   **Session Revocation:** Changing a PIN or deactivating a user revokes their active sessions immediately.

---

## 🏗️ Architecture

*   **Desktop Shell:** Electron, configured with `contextIsolation`, `sandbox`, and no Node integration in the renderer.
*   **Frontend:** Next.js (React) with Tailwind CSS. Full English and Swahili (i18n) support.
*   **Backend:** Node.js / Express with Zod validation and Prisma ORM.
*   **Database:** PostgreSQL, bundled inside the installer and managed by the Electron main process.
*   **Testing:** Vitest for backend unit and integration tests, Playwright for end-to-end UI tests.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
*   Node.js (v18+)
*   pnpm (v8+)
*   PostgreSQL (for local development, or use the bundled binary in `vendor/`)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aciusjob1/restaurant-financial-system.git
   cd restaurant-financial-system
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up the database:**
   Make sure PostgreSQL is running, then set `DATABASE_URL` in `backend/.env` and run the migrations:
   ```bash
   pnpm --filter @rfs/backend exec prisma migrate dev
   ```

4. **Start the development servers:**
   ```bash
   # Starts the backend, frontend, and Electron shell together
   pnpm dev
   ```

---

## 📦 Building the Windows Installer

A custom build script compiles the frontend, backend, and Electron app, and packages them with a portable PostgreSQL instance.

```powershell
powershell -File 'scripts\build-installer.ps1'
```

The installer is written to `dist-installer/RFS-Setup-0.1.0.exe`.

---

## 🧪 Testing

*   **Backend unit/integration tests (Vitest):**
    ```bash
    pnpm --filter @rfs/backend test
    ```
*   **End-to-end UI tests (Playwright):**
    ```bash
    pnpm --filter @rfs/frontend exec playwright test --headed
    ```

---

## 🛡️ Security Notes
*   **API Rate Limiting:** Trust proxy is configured to prevent `X-Forwarded-For` spoofing.
*   **Sanitized Responses:** PIN and password hashes are never returned in API responses.
*   **Kiosk Isolation:** The kiosk cannot reach manager-only endpoints, covered by an authorization test matrix.
*   **Upgrades:** Database migrations run automatically on every app launch, so updates keep existing data.

---
*Built for real-world restaurant operations. Secure, reliable, and offline-first.*
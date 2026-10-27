# 🍽️ Restaurant Financial System (RFS)

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)

A secure, offline-first, all-in-one desktop application designed to manage the entire financial lifecycle of a restaurant—from the waiter's kiosk to end-of-day reconciliation, payroll, and inventory.

Built with **Electron**, **Next.js**, and a bundled **PostgreSQL** database, RFS compiles into a single `.exe` installer that requires zero technical setup from the end user.

---

## ✨ Key Features

### 💰 Financial Integrity & Cash Flow
*   **Daily Cash Flow:** Waiters submit their cash and mobile money (M-Pesa). The system calculates expected cash and forces managers to review every submission before closing the day.
*   **Anti-Fraud Protections:** Waiters cannot overwrite manager-entered sales. Duplicate summaries are blocked. Self-approval of expenses is strictly forbidden.
*   **Payroll Engine:** Create salary records, apply bonuses or deductions, and log partial payments. Kiosk-submitted salary expenses are rigidly bound to the waiter's own employee record.
*   **Inventory & Procurement:** Track raw materials, record supplier invoices, and track stock movements with race-condition-proof document numbering.

### 🔐 Enterprise-Grade Security
*   **Strict RBAC:** Distinct roles for **Owner**, **Manager**, **Waiter** (Kiosk), and **Auditor**.
*   **Device Management:** Owners can view every device that has accessed the system. Stolen or lost devices can be instantly blocked (individually or globally via "Block All").
*   **Advanced Hashing:** Argon2id for passwords and HMAC-SHA256 for PIN lookups.
*   **Rate Limiting & Lockouts:** Brute-force protection on password and PIN login endpoints.
*   **Session Revocation:** Changing a PIN or deactivating a user instantly revokes their active sessions.

---

## 🏗️ Architecture

*   **Desktop Shell:** Electron (configured with `contextIsolation`, `sandbox`, and no Node integration in the renderer).
*   **Frontend:** Next.js (React) with Tailwind CSS. Includes full English and Swahili (i18n) support.
*   **Backend:** Node.js / Express with Zod validation and Prisma ORM.
*   **Database:** PostgreSQL (bundled inside the installer and managed automatically by the Electron main process).
*   **Testing:** Vitest for backend unit/integration tests (500+ tests) and Playwright for E2E UI certification.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
*   Node.js (v18+)
*   pnpm (v8+)
*   PostgreSQL (for local dev, or use the bundled binary in `vendor/`)

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
   Ensure PostgreSQL is running, then update the `DATABASE_URL` in `backend/.env`. Run the migrations:
   ```bash
   pnpm --filter @rfs/backend exec prisma migrate dev
   ```

4. **Start the development servers:**
   ```bash
   # This starts the backend, frontend, and Electron shell concurrently
   pnpm dev
   ```

---

## 📦 Building the Windows Installer

RFS includes a custom build script that compiles the frontend, backend, and Electron app, and packages them alongside a portable PostgreSQL instance.

```powershell
# Run the build script
powershell -File 'scripts\build-installer.ps1'
```
The final `.exe` installer will be located in `dist-installer/RFS-Setup-0.1.0.exe`.

---

## 🧪 Testing

The system is rigorously tested to ensure financial integrity and security.

*   **Backend Unit/Integration Tests (Vitest):**
    ```bash
    pnpm --filter @rfs/backend test
    ```
*   **End-to-End UI Tests (Playwright):**
    ```bash
    pnpm --filter @rfs/frontend exec playwright test --headed
    ```

---

## 🛡️ Security Audit Highlights
*   **API Rate Limiting:** Trust proxy correctly configured to prevent `X-Forwarded-For` spoofing.
*   **Sanitized Responses:** PIN hashes and password hashes are never leaked in API responses.
*   **Kiosk Isolation:** The kiosk cannot access manager-only endpoints (verified via 7-scenario authorization matrix).
*   **Upgrade Path:** Database migrations are applied automatically on every app launch, ensuring seamless updates without data loss.

---
*Built for real-world restaurant operations. Secure, reliable, and offline-first.*

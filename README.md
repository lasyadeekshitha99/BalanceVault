# BalanceVault — Money Movement with a Ledger You Can Prove

> **A secure financial account management platform with role-based access, structured user onboarding, auditable operations, and cryptographic ledger proofs.**

---

## 📋 The Problem

Managing financial accounts and their associated operations requires more than just storing account balances. In modern fintech systems, platforms must guarantee:
1. **Strictly Controlled Access & Authentication**: Multi-tiered role-based access control (Super Admin, Compliance Admin, Operator, Account Holder).
2. **Deterministic Onboarding**: Step-by-step KYC (Know Your Customer) identity verification workflows.
3. **Accountability & Immutability**: Every mutation, login, and status change must generate an immutable audit trail with actor attribution.
4. **Verifiable Ledger State**: Financial operations must use double-entry bookkeeping chained with cryptographic proofs so that manual database manipulation or ledger tampering can be mathematically detected.

**BalanceVault** unites these capabilities in a production-ready full-stack architecture.

---

## 🏗️ What I Built

- **Frontend**: Responsive React 18 application built with TypeScript, Lucide icons, and modern institutional styling. Includes:
  - An interactive **First-Admin Bootstrap Wizard**
  - **Account Holder Portal** with KYC document submission, account overview, and peer transfers
  - **Admin Control Center** with a live KYC review queue, user status manager, real-time audit log explorer, and one-click cryptographic ledger verification tool
  - Live system diagnostics display for database and rate-limiter health
- **Backend API**: Node.js & Express server with TypeScript:
  - RESTful API routes (`/healthz`, `/readyz`, `/api/v1/auth`, `/api/v1/onboarding`, `/api/v1/admin`, `/api/v1/accounts`)
  - Liveness (`/healthz`) and deep readiness (`/readyz`) probes inspecting database latency, Redis rate limiter provider, uptime, and bootstrap seal status
  - **Redis Sliding-Window Rate Limiting** with automatic in-memory fallback for offline resilience
  - JWT token issuance with role claims and authorization middleware (`requireRoles`)
- **Database & Ledger Core**:
  - **PostgreSQL** schema managed via **Prisma ORM**
  - **Double-Entry Bookkeeping**: Transfers execute complementary debit and credit legs within atomic transactions
  - **Cryptographic Hash Chaining**: Every ledger entry includes a sequence number, previous entry hash, and a SHA-256 digest of its state. The entire history forms an unbroken cryptographic chain
- **Separation of Database Roles**:
  - `balancevault_app`: Day-to-day connection pool user with table DML permissions
  - `bootstrap_operator`: Privileged group role owning the bootstrap procedure
  - `balancevault_bootstrap`: Dedicated operator login authorized for `SET ROLE bootstrap_operator`

---

## 🔍 What the AI Got Wrong, and What I Fixed Myself

During deployment against managed PostgreSQL (Neon), AI assistants confused **role membership** with permission to administer and alter another PostgreSQL role.

The AI suggested running `ALTER ROLE ... WITH PASSWORD` via the project-owner connection. Neon rejected this with:
```
ERROR: permission denied to alter role
SQLSTATE: 42501
```

### The Root Cause
In cloud-managed PostgreSQL environments (Neon, AWS RDS, Supabase), the primary connection account is not a PostgreSQL `SUPERUSER`. AI models frequently fail to recognize that granting role membership (`GRANT role_b TO role_a`) does **not** grant the ability to alter other roles' passwords without `WITH ADMIN OPTION` or superuser privileges.

### The Engineered Fix
Instead of requesting dangerous broad database catalog privileges, I designed an architectural separation of duties:
1. Created `bootstrap_operator` with `NOLOGIN`.
2. Created `balancevault_bootstrap` with login permissions, granting it membership in `bootstrap_operator` with `SET ROLE` allowed.
3. Created an idempotent stored procedure `fn_bootstrap_first_admin(...)` defined with `SECURITY DEFINER`.
4. Granted execution permission solely to `bootstrap_operator`.
5. Created a database-enforced singleton record (`SystemBootstrap`). When executed, the function sets up the first administrator, signs the bootstrap event with a cryptographic checksum, writes to `AuditLog`, and locks the singleton.
6. Subsequent calls raise `ERR_BOOTSTRAP_ALREADY_COMPLETED`, eliminating the risk of administrator hijacking.

Full documentation of this fix is available in [`docs/NEON_ROLES.md`](file:///c:/Users/lasya/OneDrive/Desktop/snovasys/docs/NEON_ROLES.md).

---

## 🚀 How to Run It

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v24+ recommended)
- **npm**: v9.0.0 or later
- **PostgreSQL**: Local instance or cloud database (Neon, Supabase, AWS RDS)
- **Redis** *(Optional)*: If Redis is not running locally, the server automatically degrades to high-performance in-memory sliding-window rate limiting.

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```
Update `DATABASE_URL` in `.env` with your PostgreSQL connection string.

### 3. Generate Prisma Client & Run Migrations
```bash
# Generate Prisma Client
npm run db:generate

# Apply migrations
npm run db:migrate
```

### 4. Bootstrap the First Administrator
Execute the bootstrap ceremony from the terminal:
```bash
npm run bootstrap:admin
```
*Alternatively, you can boot the frontend and execute the bootstrap ceremony interactively through the built-in UI wizard.*

### 5. Seed Synthetic Demonstration Data
Populate the database with pre-configured synthetic users, KYC applications, accounts, and ledger grants:
```bash
npm run db:seed
```

### 6. Start the Full Application
Start both the API backend and the React frontend concurrently:
```bash
npm run dev
```

- **Frontend Application**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000`
- **Health Check**: `http://localhost:4000/healthz`
- **Readiness Diagnostics**: `http://localhost:4000/readyz`

---

## 🧪 Automated Testing & Verification Suite

To verify all remaining operational milestones end-to-end:
```bash
npm run test:e2e
```

The automated test suite verifies:
- [x] **Subsystem Health & Readiness**: `/healthz` and `/readyz` probes report accurate state.
- [x] **First-Administrator Bootstrap**: Idempotent bootstrap ceremony initializes the super administrator and strictly blocks re-bootstrap attempts.
- [x] **Admin Authentication & JWT**: Credential verification, JWT token generation, and rejection of bad credentials.
- [x] **Role-Based Access Control (RBAC)**: Unauthorized and anonymous requests are blocked (401/403) and audited.
- [x] **Registration & KYC Workflow**: Account holder registers (`PENDING_ONBOARDING`), submits identity documents (`SUBMITTED`), and enters the admin compliance queue.
- [x] **Admin Review & Account Provisioning**: Admin approves KYC application; the system automatically creates an active `Account` and issues an initial grant.
- [x] **Double-Entry Money Movement**: Transfers debit the sender, credit the recipient, and maintain balanced ledger totals.
- [x] **Cryptographic Hash Chaining**: Validates SHA-256 entry hashes and verifies that any tampering breaks the chain.
- [x] **Audit Trail Coverage**: Validates that all events are captured in `AuditLog` with actor attribution and timestamps.

---

## 🔒 Verification & Compliance Summary

| Requirement / Component | Status | Verification Method |
|---|---|---|
| First-Admin Bootstrap | ✅ Completed & Verified | Stored procedure / CLI `npm run bootstrap:admin` / UI Modal |
| Admin Authentication Flow | ✅ Completed & Verified | Tested against deployed endpoints with JWT verification |
| KYC Onboarding Workflow | ✅ Completed & Verified | End-to-end multi-step application & approval pipeline |
| Admin User Management | ✅ Completed & Verified | Admin Control Center user table & status mutation endpoints |
| Live Immutable Audit Log | ✅ Completed & Verified | Admin audit explorer with role, action, and metadata views |
| Cryptographic Ledger Proof | ✅ Completed & Verified | SHA-256 hash chaining with 1-click full chain verifier |
| Subsystem Diagnostics | ✅ Completed & Verified | Deep `/readyz` check with DB ping, Redis status, uptime |

---

## ⚠️ Disclaimer
*The current deployment is intended as a hackathon demonstration using synthetic data, not as a production financial service or a system for handling real funds.*


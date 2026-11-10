# PostgreSQL Role Architecture & Neon Permission Model

## Problem Context & The AI's Initial Mistake
During initial deployment on Neon Serverless PostgreSQL, AI coding assistants suggested bootstrapping the first administrative user by executing `ALTER ROLE ... WITH PASSWORD` or administrative commands directly via the application connection or project-owner connection.

Neon rejected these operations with:
```
ERROR: permission denied to alter role
SQLSTATE: 42501
```

### Why Did This Happen?
1. In cloud-managed PostgreSQL environments like Neon, AWS RDS, and Google Cloud SQL, the database administrator account provided to users is **not** a full PostgreSQL `superuser`.
2. AI assistants frequently confuse:
   - **Database role membership** (`GRANT role_b TO role_a`)
   - **Permission to administer or alter another role** (`WITH ADMIN OPTION` / `SUPERUSER`).
3. Neon enforces strict isolation: a role cannot alter credentials or modify definitions of another role without explicit ownership or `CREATEROLE` privileges, and managed databases restrict superuser actions.

---

## The Correct Solution Implemented in BalanceVault

Instead of attempting fragile DDL/DCL password mutations on PostgreSQL system catalogs, BalanceVault implements an enterprise **separation of duties** pattern using:

1. **`balancevault_app` (Application Pool Role)**:
   - Used by the Node.js API server for regular operations.
   - Has standard `DML` (`SELECT, INSERT, UPDATE, DELETE`) privileges on tables.
   - Has zero permission to bypass the bootstrap lock or alter database catalog roles.

2. **`bootstrap_operator` (Setup & Disaster Recovery Group Role)**:
   - A non-login group role (`NOLOGIN`).
   - Owns the administrative bootstrap function `fn_bootstrap_first_admin`.

3. **`balancevault_bootstrap` (Operator Login Role)**:
   - Member of `bootstrap_operator`.
   - Authorized to execute `SET ROLE bootstrap_operator`.

4. **`SECURITY DEFINER` Stored Procedure**:
   - The bootstrap routine is encapsulated within `fn_bootstrap_first_admin(...)`.
   - It checks `pg_has_role(CURRENT_USER, 'bootstrap_operator', 'MEMBER')`.
   - It checks the `SystemBootstrap` singleton table.
   - If unbootstrapped, it inserts the initial `SUPER_ADMIN` into the `User` table, records the cryptographic authorization signature, locks the singleton, and writes an immutable entry into `AuditLog`.
   - If already bootstrapped, it raises `ERR_BOOTSTRAP_ALREADY_COMPLETED`, guaranteeing that no attacker or duplicate invocation can overwrite or hijack the initial administrator.

---

## Verification Commands

To verify permissions directly in `psql` or the Neon SQL Console:

```sql
-- 1. Check role memberships
SELECT r.rolname, m.rolname AS memberof
FROM pg_roles r
JOIN pg_auth_members a ON r.oid = a.member
JOIN pg_roles m ON a.roleid = m.oid
WHERE r.rolname IN ('balancevault_bootstrap', 'balancevault_app');

-- 2. Test SET ROLE authorization
SET ROLE bootstrap_operator;
SELECT current_user, session_user;
RESET ROLE;

-- 3. Verify function execution permission
SELECT has_function_privilege('balancevault_bootstrap', 'fn_bootstrap_first_admin(text,text,text,text,text)', 'execute');
```


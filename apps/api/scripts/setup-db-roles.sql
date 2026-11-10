-- =============================================================================
-- BalanceVault - Production PostgreSQL Role & Bootstrap Setup
-- Designed for Managed PostgreSQL (Neon / AWS RDS / Supabase)
-- Prevents SQLSTATE 42501 (Permission Denied) by using Principle of Least Privilege
-- and explicit SET ROLE / SECURITY DEFINER mechanics.
-- =============================================================================

-- 1. Create Application Role (Used by regular API endpoints)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'balancevault_app') THEN
        CREATE ROLE balancevault_app WITH LOGIN PASSWORD 'AppUserSecurePass123!';
    END IF;
END $$;

-- 2. Create Bootstrap Operator Role (Group Role with elevated setup authority)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'bootstrap_operator') THEN
        CREATE ROLE bootstrap_operator WITH NOLOGIN;
    END IF;
END $$;

-- 3. Create Dedicated Bootstrap Login Role and Grant Membership
-- Note: Neon allows SET ROLE to granted group roles without requiring SUPERUSER.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'balancevault_bootstrap') THEN
        CREATE ROLE balancevault_bootstrap WITH LOGIN PASSWORD 'BootstrapPass123!';
    END IF;
END $$;

-- Grant bootstrap_operator membership to balancevault_bootstrap
GRANT bootstrap_operator TO balancevault_bootstrap;

-- 4. Grant schema permissions
GRANT USAGE ON SCHEMA public TO balancevault_app;
GRANT USAGE ON SCHEMA public TO bootstrap_operator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO balancevault_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO balancevault_app;

-- 5. Define Idempotent, High-Security First-Admin Bootstrap Function
-- Defined with SECURITY DEFINER so that it can inspect and initialize system state
-- without granting blanket ALTER ROLE or DDL permissions to the application login.
CREATE OR REPLACE FUNCTION fn_bootstrap_first_admin(
    p_admin_email TEXT,
    p_admin_password_hash TEXT,
    p_admin_name TEXT,
    p_operator_signature TEXT,
    p_client_ip TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bootstrap_record RECORD;
    v_admin_id UUID;
    v_result JSONB;
BEGIN
    -- Ensure caller has SET ROLE bootstrap_operator or is database owner
    IF NOT (
        pg_has_role(CURRENT_USER, 'bootstrap_operator', 'MEMBER') OR 
        pg_has_role(SESSION_USER, 'bootstrap_operator', 'MEMBER') OR
        CURRENT_USER = 'postgres'
    ) THEN
        RAISE EXCEPTION 'SQLSTATE 42501: Insufficient privilege to execute first-admin bootstrap. Caller must be member of bootstrap_operator.';
    END IF;

    -- Check if system is already bootstrapped (Singleton check)
    SELECT * INTO v_bootstrap_record FROM "SystemBootstrap" WHERE id = 'singleton';

    IF FOUND AND v_bootstrap_record."isBootstrapped" = TRUE THEN
        -- Re-bootstrap is strictly prohibited to prevent privilege takeover
        RAISE EXCEPTION 'ERR_BOOTSTRAP_ALREADY_COMPLETED: First administrator has already been provisioned at %.', v_bootstrap_record."bootstrappedAt";
    END IF;

    -- Generate admin user ID
    v_admin_id := gen_random_uuid();

    -- Insert Initial Super Admin
    INSERT INTO "User" (
        id,
        email,
        "passwordHash",
        "fullName",
        role,
        status,
        "createdAt",
        "updatedAt"
    ) VALUES (
        v_admin_id::text,
        p_admin_email,
        p_admin_password_hash,
        p_admin_name,
        'SUPER_ADMIN',
        'ACTIVE',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE 
    SET role = 'SUPER_ADMIN', status = 'ACTIVE', "updatedAt" = NOW()
    RETURNING id INTO v_admin_id;

    -- Record or update the singleton bootstrap status
    INSERT INTO "SystemBootstrap" (
        id,
        "isBootstrapped",
        "bootstrappedAt",
        "bootstrapOperatorRole",
        "initialAdminUserId",
        "bootstrapChecksum",
        "createdAt",
        "updatedAt"
    ) VALUES (
        'singleton',
        TRUE,
        NOW(),
        CURRENT_USER,
        v_admin_id::text,
        p_operator_signature,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        "isBootstrapped" = TRUE,
        "bootstrappedAt" = NOW(),
        "bootstrapOperatorRole" = CURRENT_USER,
        "initialAdminUserId" = v_admin_id::text,
        "bootstrapChecksum" = p_operator_signature,
        "updatedAt" = NOW();

    -- Record immutable audit log for the bootstrap ceremony
    INSERT INTO "AuditLog" (
        id,
        "actorId",
        "actorEmail",
        "actorRole",
        action,
        "entityType",
        "entityId",
        "ipAddress",
        "userAgent",
        metadata,
        status,
        timestamp
    ) VALUES (
        gen_random_uuid()::text,
        v_admin_id::text,
        p_admin_email,
        'SUPER_ADMIN',
        'SYSTEM.BOOTSTRAP_FIRST_ADMIN',
        'SYSTEM',
        'singleton',
        p_client_ip,
        'Database Bootstrap Procedure (SECURITY DEFINER)',
        jsonb_build_object(
            'operatorRole', CURRENT_USER,
            'sessionUser', SESSION_USER,
            'bootstrapChecksum', p_operator_signature,
            'adminEmail', p_admin_email
        )::text,
        'SUCCESS',
        NOW()
    );

    v_result := jsonb_build_object(
        'success', TRUE,
        'message', 'BalanceVault First Administrator bootstrap successfully verified and sealed.',
        'adminId', v_admin_id,
        'adminEmail', p_admin_email,
        'bootstrappedAt', NOW(),
        'operatorRole', CURRENT_USER
    );

    RETURN v_result;
END;
$$;

-- Grant EXECUTE permission ONLY to the bootstrap_operator role
REVOKE ALL ON FUNCTION fn_bootstrap_first_admin(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bootstrap_first_admin(TEXT, TEXT, TEXT, TEXT, TEXT) TO bootstrap_operator;


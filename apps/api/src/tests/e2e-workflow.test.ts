import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { LedgerService } from '../services/ledgerService.js';

let server: http.Server;
let baseUrl: string;

async function request(path: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { ...options.headers };
  let bodyStr: string | undefined;

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: bodyStr
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, headers: res.headers, body: json };
}

describe('BalanceVault End-to-End Verification Suite', () => {
  let adminToken: string;
  let customer1Token: string;
  let customer1Id: string;
  let customer1AccountId: string;
  let customer1AccountNumber: string;

  let customer2Token: string;
  let customer2AccountId: string;
  let customer2AccountNumber: string;

  before(async () => {
    // Start temporary test server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  it('1. Health & Readiness Endpoints respond accurately', async () => {
    const health = await request('/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'healthy');

    const ready = await request('/readyz');
    assert.ok([200, 503].includes(ready.status));
    assert.ok(ready.body.subsystems);
    assert.ok(ready.body.system);
  });

  it('2. First-Administrator Bootstrap Ceremony executes and locks singleton', async () => {
    // Attempt bootstrap
    const res = await request('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: {
        secretKey: config.bootstrapSecretKey,
        email: 'superadmin.test@balancevault.internal',
        password: 'SuperAdminPass2026!',
        fullName: 'Test Super Administrator'
      }
    });

    if (res.status === 201) {
      assert.equal(res.body.success, true);
      assert.equal(res.body.adminEmail, 'superadmin.test@balancevault.internal');
    } else {
      // If already bootstrapped from a previous run
      assert.ok(res.body.message.includes('ALREADY_COMPLETED') || res.status === 400);
    }

    // Verify re-bootstrap is strictly prevented
    const secondAttempt = await request('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: {
        secretKey: config.bootstrapSecretKey,
        email: 'attacker@balancevault.internal',
        password: 'AttackerPass123!',
        fullName: 'Attacker'
      }
    });

    assert.equal(secondAttempt.status, 400);
    assert.ok(secondAttempt.body.message.includes('ALREADY_COMPLETED') || secondAttempt.body.error === 'BOOTSTRAP_FAILED');
  });

  it('3. Admin Authentication & JWT issuance', async () => {
    // Invalid password check
    const badLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'superadmin.test@balancevault.internal',
        password: 'WrongPassword999!'
      }
    });
    assert.equal(badLogin.status, 401);

    // Valid login check
    const validLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'superadmin.test@balancevault.internal',
        password: 'SuperAdminPass2026!'
      }
    });

    assert.equal(validLogin.status, 200);
    assert.ok(validLogin.body.token);
    assert.equal(validLogin.body.user.role, 'SUPER_ADMIN');
    adminToken = validLogin.body.token;
  });

  it('4. RBAC rejects unauthenticated & unauthorized access to admin endpoints', async () => {
    const unauth = await request('/api/v1/admin/users');
    assert.equal(unauth.status, 401);

    // With admin token, it should succeed
    const authorized = await request('/api/v1/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(authorized.status, 200);
    assert.ok(Array.isArray(authorized.body.users));
  });

  it('5. Account Holder Registration & Onboarding KYC submission', async () => {
    const regRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `alice.${Date.now()}@example.com`,
        password: 'AliceSecurePass2026!',
        fullName: 'Alice Henderson',
        phone: '+1 555-0100'
      }
    });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.user.role, 'ACCOUNT_HOLDER');
    assert.equal(regRes.body.user.status, 'PENDING_ONBOARDING');
    customer1Token = regRes.body.token;
    customer1Id = regRes.body.user.id;

    // Submit KYC Application
    const submitKyc = await request('/api/v1/onboarding/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: {
        documentType: 'PASSPORT',
        documentNumber: 'P123456789',
        annualIncome: 120000,
        sourceOfFunds: 'Consulting Income',
        legalAddress: '100 Financial Way, New York, NY'
      }
    });

    assert.equal(submitKyc.status, 200);
    assert.equal(submitKyc.body.application.status, 'SUBMITTED');
  });

  it('6. Admin reviews and approves KYC application, provisioning account and initial ledger grant', async () => {
    // List pending
    const pendingList = await request('/api/v1/admin/onboarding?status=SUBMITTED', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(pendingList.status, 200);

    const appToApprove = pendingList.body.applications.find((a: any) => a.userId === customer1Id);
    assert.ok(appToApprove, 'Found application in review queue');

    // Approve
    const approval = await request(`/api/v1/admin/onboarding/${appToApprove.id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        action: 'APPROVE',
        notes: 'Compliance identity check verified via synthetic KYC validator.',
        initialGrantAmount: 2500
      }
    });

    assert.equal(approval.status, 200);
    assert.ok(approval.body.account);
    assert.equal(Number(approval.body.account.balance), 2500);
    customer1AccountId = approval.body.account.id;
    customer1AccountNumber = approval.body.account.accountNumber;
  });

  it('7. Register second customer and approve to test money movement', async () => {
    const regRes2 = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `bob.${Date.now()}@example.com`,
        password: 'BobSecurePass2026!',
        fullName: 'Bob Martinez'
      }
    });
    customer2Token = regRes2.body.token;
    const cust2Id = regRes2.body.user.id;

    await request('/api/v1/onboarding/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer2Token}` },
      body: {
        documentType: 'DRIVERS_LICENSE',
        documentNumber: 'DL-88776655',
        annualIncome: 95000,
        sourceOfFunds: 'Software Engineering',
        legalAddress: '456 Tech Park, Austin, TX'
      }
    });

    const pending = await request('/api/v1/admin/onboarding?status=SUBMITTED', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const app2 = pending.body.applications.find((a: any) => a.userId === cust2Id);

    const approval2 = await request(`/api/v1/admin/onboarding/${app2.id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        action: 'APPROVE',
        initialGrantAmount: 1000
      }
    });

    customer2AccountId = approval2.body.account.id;
    customer2AccountNumber = approval2.body.account.accountNumber;
  });

  it('8. Money movement with double-entry ledger & cryptographic hash chaining', async () => {
    const transferRes = await request('/api/v1/accounts/transfer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: {
        sourceAccountId: customer1AccountId,
        destinationAccountNumber: customer2AccountNumber,
        amount: 500,
        description: 'Payment for security consulting services'
      }
    });

    assert.equal(transferRes.status, 200);
    assert.equal(transferRes.body.sourceBalanceAfter, 2000);
    assert.equal(transferRes.body.ledgerEntries.length, 2); // 1 Debit, 1 Credit

    // Validate SHA-256 hash existence
    const debitLeg = transferRes.body.ledgerEntries[0];
    const creditLeg = transferRes.body.ledgerEntries[1];
    assert.ok(debitLeg.entryHash);
    assert.ok(creditLeg.entryHash);
    assert.equal(creditLeg.previousEntryHash, debitLeg.entryHash);
  });

  it('9. Cryptographic ledger integrity proof proves entire history is untampered', async () => {
    const verifyRes = await request('/api/v1/admin/ledger/verify', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.verified, true);
    assert.ok(verifyRes.body.totalEntriesChecked >= 4); // Initial grants + transfer legs
  });

  it('10. Audit log captures all security-critical operations with actor attribution', async () => {
    const logsRes = await request('/api/v1/admin/audit-logs?limit=50', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(logsRes.status, 200);
    assert.ok(logsRes.body.logs.length >= 5);

    const actions = logsRes.body.logs.map((l: any) => l.action);
    assert.ok(actions.some((a: string) => a.includes('BOOTSTRAP') || a.includes('LOGIN') || a.includes('ONBOARDING')));
  });
});


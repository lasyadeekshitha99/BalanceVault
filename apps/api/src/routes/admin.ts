import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { AuditService } from '../services/auditService.js';
import { LedgerService } from '../services/ledgerService.js';

export const adminRouter = Router();

// Enforce admin privileges across all admin endpoints
adminRouter.use(authenticateToken);
adminRouter.use(requireRoles('SUPER_ADMIN', 'ADMIN'));

/**
 * Dashboard Overview & Statistics
 */
adminRouter.get('/stats', async (req, res) => {
  const [
    totalUsers,
    pendingOnboarding,
    activeAccounts,
    totalAuditLogs,
    ledgerVerification
  ] = await Promise.all([
    prisma.user.count(),
    prisma.onboardingApplication.count({ where: { status: 'SUBMITTED' } }),
    prisma.account.count({ where: { status: 'ACTIVE' } }),
    prisma.auditLog.count(),
    LedgerService.verifyLedgerIntegrity()
  ]);

  res.json({
    totalUsers,
    pendingOnboarding,
    activeAccounts,
    totalAuditLogs,
    ledgerVerification
  });
});

/**
 * User Management: List users
 */
adminRouter.get('/users', async (req, res) => {
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where: any = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { fullName: { contains: search } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      phone: true,
      createdAt: true,
      accounts: {
        select: {
          id: true,
          accountNumber: true,
          balance: true,
          status: true
        }
      },
      onboardingApplication: {
        select: {
          id: true,
          status: true,
          documentType: true,
          documentNumber: true,
          submittedAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json({ users });
});

/**
 * User Management: Update user status
 */
adminRouter.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['ACTIVE', 'SUSPENDED', 'REJECTED'].includes(status)) {
    res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be ACTIVE, SUSPENDED, or REJECTED.' });
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Target user not found.' });
    return;
  }

  // Prevent regular ADMIN from suspending SUPER_ADMIN
  if (targetUser.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only a SUPER_ADMIN can modify another SUPER_ADMIN.' });
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { status }
  });

  await AuditService.record({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: `USER.STATUS_CHANGED_TO_${status}`,
    entityType: 'USER',
    entityId: id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      targetUserId: id,
      previousStatus: targetUser.status,
      newStatus: status,
      reason
    }
  });

  res.json({ user: updatedUser });
});

/**
 * Onboarding Management: List applications
 */
adminRouter.get('/onboarding', async (req, res) => {
  const status = req.query.status as string | undefined;
  const where: any = {};
  if (status) where.status = status;

  const applications = await prisma.onboardingApplication.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true
        }
      }
    },
    orderBy: { submittedAt: 'desc' }
  });

  res.json({ applications });
});

/**
 * Onboarding Review: Approve or Reject
 */
adminRouter.post('/onboarding/:id/review', async (req, res) => {
  const { id } = req.params;
  const { action, notes, initialGrantAmount = 1000 } = req.body; // action: 'APPROVE' | 'REJECT'

  if (!['APPROVE', 'REJECT'].includes(action)) {
    res.status(400).json({ error: 'INVALID_ACTION', message: 'Action must be APPROVE or REJECT.' });
    return;
  }

  const application = await prisma.onboardingApplication.findUnique({
    where: { id },
    include: { user: true }
  });

  if (!application) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Onboarding application not found.' });
    return;
  }

  if (application.status === 'APPROVED') {
    res.status(400).json({ error: 'ALREADY_APPROVED', message: 'This application is already approved.' });
    return;
  }

  if (action === 'REJECT') {
    await prisma.onboardingApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewNotes: notes || 'Application does not meet institutional compliance requirements.',
        reviewedBy: req.user!.email,
        reviewedAt: new Date()
      }
    });

    await AuditService.record({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'ONBOARDING.APPLICATION_REJECTED',
      entityType: 'ONBOARDING_APPLICATION',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { notes, userId: application.userId }
    });

    res.json({ message: 'Onboarding application rejected.' });
    return;
  }

  // Action is APPROVE:
  // 1. Update application status to APPROVED
  // 2. Update user status to ACTIVE
  // 3. Create initial Account
  // 4. Provision initial grant with cryptographic hash chain ledger entry
  const result = await prisma.$transaction(async (tx) => {
    // Update Application
    const updatedApp = await tx.onboardingApplication.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewNotes: notes || 'Verified and approved by administration.',
        reviewedBy: req.user!.email,
        reviewedAt: new Date()
      }
    });

    // Update User
    await tx.user.update({
      where: { id: application.userId },
      data: { status: 'ACTIVE' }
    });

    // Generate unique account number
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
    const accountNumber = `BV-${randomDigits}-USD`;

    // Create Account
    const account = await tx.account.create({
      data: {
        accountNumber,
        accountType: 'CHECKING',
        balance: 0,
        currency: 'USD',
        status: 'ACTIVE',
        userId: application.userId
      }
    });

    return { updatedApp, account };
  });

  // Issue Initial Grant through double-entry ledger with cryptographic chaining
  const grantResult = await LedgerService.executeInitialGrant({
    accountId: result.account.id,
    amount: Number(initialGrantAmount) || 1000,
    description: 'Welcome verification grant credited upon onboarding compliance approval.',
    actorId: req.user!.id,
    actorEmail: req.user!.email
  });

  // Record audit trail
  await AuditService.record({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'ONBOARDING.APPLICATION_APPROVED',
    entityType: 'ONBOARDING_APPLICATION',
    entityId: id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      userId: application.userId,
      accountNumber: result.account.accountNumber,
      initialGrantAmount: initialGrantAmount,
      grantTxRef: grantResult.transaction.reference
    }
  });

  res.json({
    message: 'Onboarding application approved. Account and ledger grant successfully provisioned.',
    account: grantResult.account,
    transaction: grantResult.transaction
  });
});

/**
 * Audit Trail Query
 */
adminRouter.get('/audit-logs', async (req, res) => {
  const logs = await AuditService.query({
    actorEmail: req.query.actorEmail as string | undefined,
    action: req.query.action as string | undefined,
    entityType: req.query.entityType as string | undefined,
    status: req.query.status as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
  });

  res.json(logs);
});

/**
 * Tamper-Evident Ledger Integrity Verification
 */
adminRouter.get('/ledger/verify', async (req, res) => {
  const result = await LedgerService.verifyLedgerIntegrity();
  
  await AuditService.record({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'LEDGER.CRYPTOGRAPHIC_INTEGRITY_VERIFICATION',
    entityType: 'LEDGER',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      verified: result.verified,
      totalEntriesChecked: result.totalEntriesChecked,
      error: result.error
    }
  });

  res.json(result);
});


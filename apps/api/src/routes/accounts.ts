import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { LedgerService } from '../services/ledgerService.js';
import { AuditService } from '../services/auditService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

export const accountsRouter = Router();

accountsRouter.use(authenticateToken);

const transferSchema = z.object({
  sourceAccountId: z.string().uuid(),
  destinationAccountNumber: z.string().min(5),
  amount: z.number().positive('Transfer amount must be greater than zero'),
  description: z.string().optional()
});

/**
 * List accounts belonging to the authenticated user
 */
accountsRouter.get('/my-accounts', async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' }
  });

  res.json({ accounts });
});

/**
 * Lookup recipient account by account number (returns masked holder name)
 */
accountsRouter.get('/lookup/:accountNumber', async (req, res) => {
  const { accountNumber } = req.params;

  const account = await prisma.account.findUnique({
    where: { accountNumber },
    include: {
      user: {
        select: { fullName: true }
      }
    }
  });

  if (!account) {
    res.status(404).json({ error: 'ACCOUNT_NOT_FOUND', message: 'No account found with that number.' });
    return;
  }

  // Mask name: e.g. "Jane Doe" -> "J*** D**"
  const maskedName = account.user.fullName
    .split(' ')
    .map(part => part[0] + '*'.repeat(Math.max(1, part.length - 1)))
    .join(' ');

  res.json({
    accountId: account.id,
    accountNumber: account.accountNumber,
    holderName: maskedName,
    currency: account.currency,
    status: account.status
  });
});

/**
 * Get account ledger entries and cryptographic proofs
 */
accountsRouter.get('/:id/ledger', async (req, res) => {
  const { id } = req.params;

  // Verify ownership or admin role
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
    return;
  }

  if (account.userId !== req.user!.id && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Unauthorized to view this account ledger.' });
    return;
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId: id },
    include: {
      transaction: true
    },
    orderBy: { sequenceNumber: 'desc' },
    take: 100
  });

  res.json({
    accountId: account.id,
    accountNumber: account.accountNumber,
    balance: account.balance,
    currency: account.currency,
    ledgerEntries: entries
  });
});

/**
 * Move Money: Double-entry transfer with cryptographic ledger chaining
 */
accountsRouter.post('/transfer', rateLimiter({ limit: 20, windowSeconds: 60, prefix: 'transfers' }), async (req, res) => {
  try {
    const { sourceAccountId, destinationAccountNumber, amount, description } = transferSchema.parse(req.body);

    // Verify source ownership
    const sourceAccount = await prisma.account.findUnique({
      where: { id: sourceAccountId }
    });

    if (!sourceAccount) {
      res.status(404).json({ error: 'SOURCE_ACCOUNT_NOT_FOUND', message: 'Source account not found.' });
      return;
    }

    if (sourceAccount.userId !== req.user!.id && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You do not own this source account.' });
      return;
    }

    // Lookup destination
    const destAccount = await prisma.account.findUnique({
      where: { accountNumber: destinationAccountNumber }
    });

    if (!destAccount) {
      res.status(404).json({ error: 'DESTINATION_NOT_FOUND', message: 'Recipient account number does not exist.' });
      return;
    }

    // Execute transfer
    const result = await LedgerService.executeTransfer({
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destAccount.id,
      amount,
      currency: sourceAccount.currency,
      description,
      actorId: req.user!.id,
      actorEmail: req.user!.email
    });

    // Record audit entry
    await AuditService.record({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'LEDGER.TRANSFER_EXECUTED',
      entityType: 'TRANSACTION',
      entityId: result.transaction.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        txReference: result.transaction.reference,
        amount,
        sourceAccountNumber: sourceAccount.accountNumber,
        destinationAccountNumber: destAccount.accountNumber,
        sourceBalanceAfter: result.sourceBalanceAfter,
        destBalanceAfter: result.destBalanceAfter
      }
    });

    res.status(200).json({
      message: 'Transfer successfully processed and cryptographically sealed on the ledger.',
      transaction: result.transaction,
      sourceBalanceAfter: result.sourceBalanceAfter,
      ledgerEntries: result.ledgerEntries
    });
  } catch (error: any) {
    res.status(400).json({
      error: 'TRANSFER_FAILED',
      message: error.errors ? error.errors[0].message : error.message
    });
  }
});


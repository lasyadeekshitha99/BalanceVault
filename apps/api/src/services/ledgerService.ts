import crypto from 'crypto';
import { prisma } from '../config/prisma.js';

export interface TransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency?: string;
  description?: string;
  actorId?: string;
  actorEmail?: string;
}

export interface InitialGrantRequest {
  accountId: string;
  amount: number;
  description?: string;
  actorId?: string;
  actorEmail?: string;
}

export class LedgerService {
  /**
   * Generates a deterministic SHA-256 hash for a ledger entry
   */
  static computeEntryHash(payload: {
    sequenceNumber: number;
    transactionId: string;
    accountId: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: string;
    balanceAfter: string;
    previousEntryHash: string;
  }): string {
    const raw = [
      payload.sequenceNumber,
      payload.transactionId,
      payload.accountId,
      payload.direction,
      payload.amount,
      payload.balanceAfter,
      payload.previousEntryHash
    ].join('|');

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Provisions an initial balance / grant into a freshly approved account
   */
  static async executeInitialGrant(request: InitialGrantRequest) {
    if (request.amount <= 0) {
      throw new Error('Initial grant amount must be greater than zero.');
    }

    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { id: request.accountId }
      });

      if (!account) {
        throw new Error(`Account not found: ${request.accountId}`);
      }

      const txReference = `GRANT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      
      const transaction = await tx.transaction.create({
        data: {
          reference: txReference,
          type: 'INITIAL_GRANT',
          amount: request.amount,
          currency: account.currency,
          status: 'SETTLED',
          description: request.description || 'Welcome grant upon onboarding verification',
          destinationAccountId: account.id
        }
      });

      // Get last entry to chain hash
      const lastEntry = await tx.ledgerEntry.findFirst({
        orderBy: { sequenceNumber: 'desc' }
      });

      const sequenceNumber = (lastEntry?.sequenceNumber || 0) + 1;
      const previousHash = lastEntry?.entryHash || 'GENESIS_BALANCEVAULT_CHAIN_ROOT_0000000000000000';
      const newBalance = Number(account.balance) + request.amount;

      const entryHash = LedgerService.computeEntryHash({
        sequenceNumber,
        transactionId: transaction.id,
        accountId: account.id,
        direction: 'CREDIT',
        amount: request.amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        previousEntryHash: previousHash
      });

      const entry = await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: account.id,
          direction: 'CREDIT',
          amount: request.amount,
          balanceAfter: newBalance,
          sequenceNumber,
          previousEntryHash: previousHash,
          entryHash
        }
      });

      // Update account balance
      const updatedAccount = await tx.account.update({
        where: { id: account.id },
        data: { balance: newBalance }
      });

      return {
        transaction,
        entry,
        account: updatedAccount
      };
    });
  }

  /**
   * Executes a double-entry money transfer with cryptographic hash chaining
   */
  static async executeTransfer(request: TransferRequest) {
    if (request.amount <= 0) {
      throw new Error('Transfer amount must be strictly positive.');
    }

    if (request.sourceAccountId === request.destinationAccountId) {
      throw new Error('Source and destination accounts cannot be identical.');
    }

    return await prisma.$transaction(async (tx) => {
      const source = await tx.account.findUnique({
        where: { id: request.sourceAccountId }
      });

      if (!source) throw new Error('Source account does not exist.');
      if (source.status !== 'ACTIVE') throw new Error(`Source account is currently ${source.status}.`);
      if (Number(source.balance) < request.amount) {
        throw new Error(`Insufficient funds. Available balance: ${source.balance} ${source.currency}`);
      }

      const destination = await tx.account.findUnique({
        where: { id: request.destinationAccountId }
      });

      if (!destination) throw new Error('Destination account does not exist.');
      if (destination.status !== 'ACTIVE') throw new Error(`Destination account is currently ${destination.status}.`);

      const txReference = `TX-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // 1. Create Transaction Record
      const transaction = await tx.transaction.create({
        data: {
          reference: txReference,
          type: 'TRANSFER',
          amount: request.amount,
          currency: source.currency,
          status: 'SETTLED',
          description: request.description || `Transfer to ${destination.accountNumber}`,
          sourceAccountId: source.id,
          destinationAccountId: destination.id
        }
      });

      // 2. Fetch current top of ledger chain
      let lastEntry = await tx.ledgerEntry.findFirst({
        orderBy: { sequenceNumber: 'desc' }
      });

      let currentSeq = (lastEntry?.sequenceNumber || 0) + 1;
      let currentPrevHash = lastEntry?.entryHash || 'GENESIS_BALANCEVAULT_CHAIN_ROOT_0000000000000000';

      // 3. Double-entry: Debit Leg (Source)
      const sourceNewBalance = Number(source.balance) - request.amount;
      const debitHash = LedgerService.computeEntryHash({
        sequenceNumber: currentSeq,
        transactionId: transaction.id,
        accountId: source.id,
        direction: 'DEBIT',
        amount: request.amount.toFixed(2),
        balanceAfter: sourceNewBalance.toFixed(2),
        previousEntryHash: currentPrevHash
      });

      const debitEntry = await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: source.id,
          direction: 'DEBIT',
          amount: request.amount,
          balanceAfter: sourceNewBalance,
          sequenceNumber: currentSeq,
          previousEntryHash: currentPrevHash,
          entryHash: debitHash
        }
      });

      // 4. Double-entry: Credit Leg (Destination)
      currentSeq += 1;
      currentPrevHash = debitHash;
      const destNewBalance = Number(destination.balance) + request.amount;
      const creditHash = LedgerService.computeEntryHash({
        sequenceNumber: currentSeq,
        transactionId: transaction.id,
        accountId: destination.id,
        direction: 'CREDIT',
        amount: request.amount.toFixed(2),
        balanceAfter: destNewBalance.toFixed(2),
        previousEntryHash: currentPrevHash
      });

      const creditEntry = await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: destination.id,
          direction: 'CREDIT',
          amount: request.amount,
          balanceAfter: destNewBalance,
          sequenceNumber: currentSeq,
          previousEntryHash: currentPrevHash,
          entryHash: creditHash
        }
      });

      // 5. Update balances
      await tx.account.update({
        where: { id: source.id },
        data: { balance: sourceNewBalance }
      });

      await tx.account.update({
        where: { id: destination.id },
        data: { balance: destNewBalance }
      });

      return {
        transaction,
        sourceBalanceAfter: sourceNewBalance,
        destBalanceAfter: destNewBalance,
        ledgerEntries: [debitEntry, creditEntry]
      };
    });
  }

  /**
   * Cryptographically verifies the entire ledger chain from genesis to head
   */
  static async verifyLedgerIntegrity(): Promise<{
    verified: boolean;
    totalEntriesChecked: number;
    error?: string;
    brokenSequenceNumber?: number;
    verifiedAt: string;
  }> {
    const entries = await prisma.ledgerEntry.findMany({
      orderBy: { sequenceNumber: 'asc' }
    });

    if (entries.length === 0) {
      return {
        verified: true,
        totalEntriesChecked: 0,
        verifiedAt: new Date().toISOString()
      };
    }

    let expectedPrevHash = 'GENESIS_BALANCEVAULT_CHAIN_ROOT_0000000000000000';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Check sequence monotonicity
      if (entry.sequenceNumber !== i + 1) {
        return {
          verified: false,
          totalEntriesChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          error: `Sequence discontinuity at entry ${entry.id}. Expected ${i + 1}, found ${entry.sequenceNumber}.`,
          verifiedAt: new Date().toISOString()
        };
      }

      // Check previous hash pointer
      if (entry.previousEntryHash !== expectedPrevHash) {
        return {
          verified: false,
          totalEntriesChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          error: `Broken hash chain pointer at sequence ${entry.sequenceNumber}. Previous hash mismatch.`,
          verifiedAt: new Date().toISOString()
        };
      }

      // Recompute SHA-256 hash
      const computedHash = LedgerService.computeEntryHash({
        sequenceNumber: entry.sequenceNumber,
        transactionId: entry.transactionId,
        accountId: entry.accountId,
        direction: entry.direction as 'DEBIT' | 'CREDIT',
        amount: Number(entry.amount).toFixed(2),
        balanceAfter: Number(entry.balanceAfter).toFixed(2),
        previousEntryHash: entry.previousEntryHash
      });

      if (computedHash !== entry.entryHash) {
        return {
          verified: false,
          totalEntriesChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          error: `Tampering detected! Entry payload at sequence ${entry.sequenceNumber} does not match SHA-256 digest.`,
          verifiedAt: new Date().toISOString()
        };
      }

      expectedPrevHash = entry.entryHash;
    }

    return {
      verified: true,
      totalEntriesChecked: entries.length,
      verifiedAt: new Date().toISOString()
    };
  }
}


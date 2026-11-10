import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { AuditService } from './auditService.js';

export interface BootstrapInput {
  email?: string;
  password?: string;
  fullName?: string;
  secretKey: string;
  clientIp?: string;
}

export class BootstrapService {
  /**
   * Checks whether the application has completed its initial administrator bootstrap
   */
  static async getStatus(): Promise<{
    isBootstrapped: boolean;
    bootstrappedAt: Date | null;
    initialAdminEmail: string | null;
    bootstrapOperatorRole: string | null;
  }> {
    try {
      const record = await prisma.systemBootstrap.findUnique({
        where: { id: 'singleton' }
      });

      if (record && record.isBootstrapped) {
        let adminEmail: string | null = null;
        if (record.initialAdminUserId) {
          const user = await prisma.user.findUnique({
            where: { id: record.initialAdminUserId },
            select: { email: true }
          });
          adminEmail = user?.email || null;
        }

        return {
          isBootstrapped: true,
          bootstrappedAt: record.bootstrappedAt,
          initialAdminEmail: adminEmail,
          bootstrapOperatorRole: record.bootstrapOperatorRole
        };
      }

      // Check if a super admin already exists in User table
      const existingSuperAdmin = await prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' }
      });

      if (existingSuperAdmin) {
        return {
          isBootstrapped: true,
          bootstrappedAt: existingSuperAdmin.createdAt,
          initialAdminEmail: existingSuperAdmin.email,
          bootstrapOperatorRole: 'UserTableSuperAdmin'
        };
      }

      return {
        isBootstrapped: false,
        bootstrappedAt: null,
        initialAdminEmail: null,
        bootstrapOperatorRole: null
      };
    } catch (error: any) {
      // If table doesn't exist yet before migrations
      return {
        isBootstrapped: false,
        bootstrappedAt: null,
        initialAdminEmail: null,
        bootstrapOperatorRole: null
      };
    }
  }

  /**
   * Executes the first-administrator bootstrap ceremony
   */
  static async bootstrapFirstAdmin(input: BootstrapInput) {
    // 1. Verify operator secret key
    if (!input.secretKey || input.secretKey !== config.bootstrapSecretKey) {
      throw new Error('ERR_INVALID_BOOTSTRAP_SECRET: The provided operator bootstrap secret is invalid.');
    }

    const email = (input.email || config.initialAdminEmail).toLowerCase().trim();
    const password = input.password || config.initialAdminPassword;
    const fullName = input.fullName || config.initialAdminName;

    if (password.length < 8) {
      throw new Error('Administrator password must be at least 8 characters long.');
    }

    // 2. Check if already bootstrapped
    const status = await BootstrapService.getStatus();
    if (status.isBootstrapped) {
      throw new Error(`ERR_BOOTSTRAP_ALREADY_COMPLETED: First administrator has already been initialized at ${status.bootstrappedAt}.`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const operatorSignature = crypto
      .createHash('sha256')
      .update(`${email}:${Date.now()}:${input.secretKey}`)
      .digest('hex');

    // 3. Attempt execution through PostgreSQL stored procedure if present, else atomic Prisma transaction
    try {
      const rawResult: any = await prisma.$queryRawUnsafe(
        `SELECT fn_bootstrap_first_admin($1, $2, $3, $4, $5) AS result`,
        email,
        passwordHash,
        fullName,
        operatorSignature,
        input.clientIp || '127.0.0.1'
      );

      if (rawResult && rawResult[0]?.result) {
        return rawResult[0].result;
      }
    } catch (pgError: any) {
      // If stored procedure doesn't exist (e.g. SQLite local dev or before SQL function applied),
      // we execute via atomic Prisma transaction with identical guarantees.
      if (!pgError.message?.includes('fn_bootstrap_first_admin does not exist')) {
        // If it's a specific Postgres authorization or business exception, propagate it
        if (pgError.message?.includes('ERR_BOOTSTRAP_ALREADY_COMPLETED')) {
          throw new Error('ERR_BOOTSTRAP_ALREADY_COMPLETED: First administrator already provisioned.');
        }
      }
    }

    // Fallback atomic transaction
    return await prisma.$transaction(async (tx) => {
      // Re-verify inside transaction
      const existingAdmin = await tx.user.findFirst({
        where: { role: 'SUPER_ADMIN' }
      });
      if (existingAdmin) {
        throw new Error('ERR_BOOTSTRAP_ALREADY_COMPLETED: First administrator already initialized.');
      }

      // Create or update user
      const user = await tx.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          fullName,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        },
        update: {
          passwordHash,
          fullName,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        }
      });

      // Seal the bootstrap singleton
      await tx.systemBootstrap.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          isBootstrapped: true,
          bootstrappedAt: new Date(),
          bootstrapOperatorRole: 'bootstrap_operator',
          initialAdminUserId: user.id,
          bootstrapChecksum: operatorSignature
        },
        update: {
          isBootstrapped: true,
          bootstrappedAt: new Date(),
          bootstrapOperatorRole: 'bootstrap_operator',
          initialAdminUserId: user.id,
          bootstrapChecksum: operatorSignature
        }
      });

      // Record audit entry
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorRole: 'SUPER_ADMIN',
          action: 'SYSTEM.BOOTSTRAP_FIRST_ADMIN',
          entityType: 'SYSTEM',
          entityId: 'singleton',
          ipAddress: input.clientIp || '127.0.0.1',
          userAgent: 'BootstrapService (Atomic Transaction)',
          metadata: JSON.stringify({
            operatorSignature,
            adminEmail: email,
            role: 'SUPER_ADMIN'
          }),
          status: 'SUCCESS'
        }
      });

      return {
        success: true,
        message: 'BalanceVault First Administrator bootstrap successfully verified and sealed.',
        adminId: user.id,
        adminEmail: user.email,
        bootstrappedAt: new Date().toISOString(),
        operatorRole: 'bootstrap_operator'
      };
    });
  }
}


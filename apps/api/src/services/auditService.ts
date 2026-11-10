import { prisma } from '../config/prisma.js';

export interface AuditLogInput {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
  status?: 'SUCCESS' | 'FAILURE';
}

export class AuditService {
  /**
   * Records an immutable audit log entry
   */
  static async record(input: AuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: input.actorId || undefined,
          actorEmail: input.actorEmail || undefined,
          actorRole: input.actorRole || undefined,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || undefined,
          ipAddress: input.ipAddress || undefined,
          userAgent: input.userAgent || undefined,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          status: input.status || 'SUCCESS'
        }
      });
    } catch (error) {
      console.error(' [AuditService] Failed to record audit log:', error);
      // We log to stderr but don't crash the calling operational transaction
    }
  }

  /**
   * Retrieves audit logs with optional filtering
   */
  static async query(params: {
    actorEmail?: string;
    action?: string;
    entityType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    const where: any = {};
    if (params.actorEmail) where.actorEmail = { contains: params.actorEmail };
    if (params.action) where.action = params.action;
    if (params.entityType) where.entityType = params.entityType;
    if (params.status) where.status = params.status;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    return {
      total,
      limit,
      offset,
      logs: logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }))
    };
  }
}


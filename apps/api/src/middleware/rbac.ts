import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/auditService.js';

export function requireRoles(...allowedRoles: Array<'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'ACCOUNT_HOLDER'>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required before checking authorization.'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Record unauthorized privilege escalation attempt
      await AuditService.record({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'SECURITY.UNAUTHORIZED_ROLE_ACCESS',
        entityType: 'ENDPOINT',
        entityId: req.originalUrl,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE',
        metadata: {
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          method: req.method,
          path: req.originalUrl
        }
      });

      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Access denied. Requires one of [${allowedRoles.join(', ')}], but your role is ${req.user.role}.`
      });
      return;
    }

    next();
  };
}


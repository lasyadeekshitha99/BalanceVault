import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'ACCOUNT_HOLDER';
  status: 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication token is required.'
    });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      email: string;
      role: AuthenticatedUser['role'];
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        fullName: true
      }
    });

    if (!user) {
      res.status(401).json({
        error: 'USER_NOT_FOUND',
        message: 'The account associated with this token no longer exists.'
      });
      return;
    }

    if (user.status === 'SUSPENDED') {
      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been administratively suspended.'
      });
      return;
    }

    req.user = user as AuthenticatedUser;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired authentication token.'
    });
  }
}


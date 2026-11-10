import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { BootstrapService } from '../services/bootstrapService.js';
import { AuditService } from '../services/auditService.js';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

// Validation Schemas
const bootstrapSchema = z.object({
  secretKey: z.string().min(1, 'Bootstrap secret key is required'),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  fullName: z.string().min(2).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required')
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().optional()
});

/**
 * Check bootstrap status
 */
authRouter.get('/bootstrap/status', async (req, res) => {
  const status = await BootstrapService.getStatus();
  res.json(status);
});

/**
 * First-Administrator Bootstrap Ceremony Endpoint
 * Strict rate limiting applied to protect this endpoint
 */
authRouter.post('/bootstrap', rateLimiter({ limit: 10, windowSeconds: 60, prefix: 'bootstrap' }), async (req, res) => {
  try {
    const validated = bootstrapSchema.parse(req.body);
    const result = await BootstrapService.bootstrapFirstAdmin({
      ...validated,
      clientIp: req.ip
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({
      error: 'BOOTSTRAP_FAILED',
      message: error.message || 'Bootstrap ceremony failed.'
    });
  }
});

/**
 * Universal Authentication (Admin & Account Holder)
 */
authRouter.post('/login', rateLimiter({ limit: 15, windowSeconds: 60, prefix: 'auth_login' }), async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      await AuditService.record({
        actorEmail: normalizedEmail,
        action: 'AUTH.LOGIN_FAILED',
        entityType: 'USER',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE',
        metadata: { reason: 'User not found' }
      });

      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await AuditService.record({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH.LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE',
        metadata: { reason: 'Password mismatch' }
      });

      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
      return;
    }

    if (user.status === 'SUSPENDED') {
      await AuditService.record({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH.LOGIN_REJECTED_SUSPENDED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE'
      });

      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been administratively suspended. Contact support.'
      });
      return;
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      config.jwtSecret,
      { expiresIn: (config.jwtExpiresIn as any) || '24h' }
    );

    // Record login audit
    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH.LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'SUCCESS'
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status
      }
    });
  } catch (error: any) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: error.errors ? error.errors[0].message : error.message
    });
  }
});

/**
 * Account Holder Registration
 */
authRouter.post('/register', rateLimiter({ limit: 10, windowSeconds: 60, prefix: 'auth_register' }), async (req, res) => {
  try {
    const { email, password, fullName, phone } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address is already registered.'
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName,
        phone,
        role: 'ACCOUNT_HOLDER',
        status: 'PENDING_ONBOARDING'
      }
    });

    // Record audit event
    await AuditService.record({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER.REGISTERED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'SUCCESS'
    });

    // Issue JWT so they can immediately fill in their onboarding KYC application
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      config.jwtSecret,
      { expiresIn: (config.jwtExpiresIn as any) || '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status
      }
    });
  } catch (error: any) {
    res.status(400).json({
      error: 'REGISTRATION_FAILED',
      message: error.errors ? error.errors[0].message : error.message
    });
  }
});

/**
 * Get profile of currently authenticated user
 */
authRouter.get('/me', authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
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
          accountType: true,
          balance: true,
          currency: true,
          status: true
        }
      },
      onboardingApplication: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewNotes: true
        }
      }
    }
  });

  res.json({ user });
});


import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { AuditService } from '../services/auditService.js';

export const onboardingRouter = Router();

const onboardingSubmitSchema = z.object({
  documentType: z.enum(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'], {
    errorMap: () => ({ message: 'Document type must be PASSPORT, NATIONAL_ID, or DRIVERS_LICENSE' })
  }),
  documentNumber: z.string().min(5, 'Document number must be at least 5 characters'),
  annualIncome: z.number().positive('Annual income must be positive'),
  sourceOfFunds: z.string().min(3, 'Source of funds is required (e.g. Employment, Business, Investment)'),
  legalAddress: z.string().min(5, 'Legal residential address is required')
});

/**
 * Submit or update onboarding KYC application
 */
onboardingRouter.post('/submit', authenticateToken, requireRoles('ACCOUNT_HOLDER'), async (req, res) => {
  try {
    const validated = onboardingSubmitSchema.parse(req.body);
    const userId = req.user!.id;

    const existingApplication = await prisma.onboardingApplication.findUnique({
      where: { userId }
    });

    if (existingApplication && existingApplication.status === 'APPROVED') {
      res.status(400).json({
        error: 'ALREADY_APPROVED',
        message: 'Your onboarding application is already approved and your account is active.'
      });
      return;
    }

    const application = await prisma.onboardingApplication.upsert({
      where: { userId },
      create: {
        userId,
        status: 'SUBMITTED',
        documentType: validated.documentType,
        documentNumber: validated.documentNumber,
        annualIncome: validated.annualIncome,
        sourceOfFunds: validated.sourceOfFunds,
        legalAddress: validated.legalAddress,
        submittedAt: new Date()
      },
      update: {
        status: 'SUBMITTED',
        documentType: validated.documentType,
        documentNumber: validated.documentNumber,
        annualIncome: validated.annualIncome,
        sourceOfFunds: validated.sourceOfFunds,
        legalAddress: validated.legalAddress,
        submittedAt: new Date()
      }
    });

    await AuditService.record({
      actorId: userId,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'ONBOARDING.SUBMITTED',
      entityType: 'ONBOARDING_APPLICATION',
      entityId: application.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'SUCCESS',
      metadata: {
        documentType: validated.documentType,
        sourceOfFunds: validated.sourceOfFunds
      }
    });

    res.status(200).json({
      message: 'Onboarding application successfully submitted for administrative compliance review.',
      application
    });
  } catch (error: any) {
    res.status(400).json({
      error: 'ONBOARDING_SUBMISSION_FAILED',
      message: error.errors ? error.errors[0].message : error.message
    });
  }
});

/**
 * Get current user onboarding status
 */
onboardingRouter.get('/status', authenticateToken, async (req, res) => {
  const application = await prisma.onboardingApplication.findUnique({
    where: { userId: req.user!.id }
  });

  res.json({
    userStatus: req.user!.status,
    application: application || null
  });
});


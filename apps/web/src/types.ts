export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'ACCOUNT_HOLDER';

export type UserStatus = 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export type OnboardingStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  createdAt: string;
  accounts?: Account[];
  onboardingApplication?: OnboardingApplication;
}

export interface Account {
  id: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'BUSINESS';
  balance: number | string;
  currency: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'FROZEN';
  createdAt?: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number | string;
  balanceAfter: number | string;
  sequenceNumber: number;
  previousEntryHash: string;
  entryHash: string;
  timestamp: string;
  transaction?: {
    reference: string;
    type: string;
    description?: string;
  };
}

export interface OnboardingApplication {
  id: string;
  userId: string;
  status: OnboardingStatus;
  documentType: string;
  documentNumber: string;
  annualIncome?: number;
  sourceOfFunds?: string;
  legalAddress?: string;
  reviewNotes?: string;
  reviewedBy?: string;
  submittedAt?: string;
  reviewedAt?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
  };
}

export interface AuditLog {
  id: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  timestamp: string;
  metadata?: any;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  subsystems: {
    database: {
      healthy: boolean;
      latencyMs?: number;
      error?: string;
    };
    redis: {
      healthy: boolean;
      provider: 'redis' | 'memory-fallback';
      latencyMs?: number;
    };
    bootstrap: {
      isBootstrapped: boolean;
      bootstrappedAt: string | null;
      adminConfigured: boolean;
    };
  };
  system: {
    uptimeSeconds: number;
    memoryUsageMb: number;
    nodeVersion: string;
  };
}


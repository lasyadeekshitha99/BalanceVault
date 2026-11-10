import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import { BootstrapService } from '../src/services/bootstrapService.js';
import { LedgerService } from '../src/services/ledgerService.js';
import { config } from '../src/config/env.js';

async function seed() {
  console.log(' Seeding BalanceVault synthetic demonstration data...');

  // 1. Bootstrap First Admin if not yet done
  const bootstrapStatus = await BootstrapService.getStatus();
  if (!bootstrapStatus.isBootstrapped) {
    console.log(' Initializing First Administrator...');
    await BootstrapService.bootstrapFirstAdmin({
      email: config.initialAdminEmail,
      password: config.initialAdminPassword,
      fullName: config.initialAdminName,
      secretKey: config.bootstrapSecretKey,
      clientIp: '127.0.0.1 (Seed)'
    });
  }

  // 2. Create a demo verified Account Holder
  const demoEmail = 'alex.morgan@example.com';
  let demoUser = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (!demoUser) {
    const passwordHash = await bcrypt.hash('DemoUserPass2026!', 10);
    demoUser = await prisma.user.create({
      data: {
        email: demoEmail,
        passwordHash,
        fullName: 'Alex Morgan',
        phone: '+1 (555) 019-2834',
        role: 'ACCOUNT_HOLDER',
        status: 'ACTIVE'
      }
    });

    // Create Onboarding Application marked APPROVED
    await prisma.onboardingApplication.create({
      data: {
        userId: demoUser.id,
        status: 'APPROVED',
        documentType: 'PASSPORT',
        documentNumber: 'P892182910',
        annualIncome: 145000,
        sourceOfFunds: 'Software Engineering / Consultancy',
        legalAddress: '742 Evergreen Terrace, Springfield, OR',
        reviewNotes: 'Verified during synthetic environment seeding.',
        reviewedBy: config.initialAdminEmail,
        reviewedAt: new Date(),
        submittedAt: new Date()
      }
    });

    // Create Account
    const account = await prisma.account.create({
      data: {
        accountNumber: 'BV-77281920-USD',
        accountType: 'CHECKING',
        balance: 0,
        currency: 'USD',
        status: 'ACTIVE',
        userId: demoUser.id
      }
    });

    // Seed initial welcome grant
    await LedgerService.executeInitialGrant({
      accountId: account.id,
      amount: 5000,
      description: 'Initial balance grant for demo account Alex Morgan',
      actorEmail: config.initialAdminEmail
    });

    console.log(` Created demo customer: ${demoEmail} (Password: DemoUserPass2026!)`);
    console.log(` Created account: ${account.accountNumber} with $5,000.00 initial grant.`);
  }

  // 3. Create a pending onboarding applicant for demonstration
  const pendingEmail = 'jordan.lee@example.com';
  let pendingUser = await prisma.user.findUnique({ where: { email: pendingEmail } });

  if (!pendingUser) {
    const passHash = await bcrypt.hash('DemoPendingPass2026!', 10);
    pendingUser = await prisma.user.create({
      data: {
        email: pendingEmail,
        passwordHash: passHash,
        fullName: 'Jordan Lee',
        phone: '+1 (555) 014-9988',
        role: 'ACCOUNT_HOLDER',
        status: 'PENDING_ONBOARDING'
      }
    });

    await prisma.onboardingApplication.create({
      data: {
        userId: pendingUser.id,
        status: 'SUBMITTED',
        documentType: 'DRIVERS_LICENSE',
        documentNumber: 'DL-9920192',
        annualIncome: 88000,
        sourceOfFunds: 'Healthcare Professional',
        legalAddress: '1204 Pinecone Avenue, Boulder, CO',
        submittedAt: new Date()
      }
    });

    console.log(` Created pending KYC applicant: ${pendingEmail}`);
  }

  // 4. Verify ledger
  const verification = await LedgerService.verifyLedgerIntegrity();
  console.log(` Cryptographic Ledger Proof: ${verification.verified ? 'PASSED (Zero Tampering)' : 'FAILED'}`);
  console.log('✅ Synthetic seeding completed successfully.');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


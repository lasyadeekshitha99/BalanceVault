import { BootstrapService } from '../src/services/bootstrapService.js';
import { config } from '../src/config/env.js';

async function main() {
  console.log('========================================================');
  console.log(' BalanceVault: First Administrator Bootstrap Ceremony');
  console.log('========================================================');

  const status = await BootstrapService.getStatus();
  if (status.isBootstrapped) {
    console.log(`[ALREADY_BOOTSTRAPPED] The system is already sealed.`);
    console.log(`Initial Admin: ${status.initialAdminEmail}`);
    console.log(`Bootstrapped At: ${status.bootstrappedAt}`);
    process.exit(0);
  }

  console.log(`Attempting bootstrap with operator secret...`);
  console.log(`Target Super Admin: ${config.initialAdminEmail}`);

  try {
    const result = await BootstrapService.bootstrapFirstAdmin({
      email: config.initialAdminEmail,
      password: config.initialAdminPassword,
      fullName: config.initialAdminName,
      secretKey: config.bootstrapSecretKey,
      clientIp: '127.0.0.1 (CLI)'
    });

    console.log(' Bootstrap successful!');
    console.log(` Admin ID: ${result.adminId}`);
    console.log(` Admin Email: ${result.adminEmail}`);
    console.log(` Sealed At: ${result.bootstrappedAt}`);
    console.log(' You may now log in to the Admin Control Center using these credentials.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Bootstrap ceremony failed:', err.message);
    process.exit(1);
  }
}

main();


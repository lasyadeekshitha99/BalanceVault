import { app } from './app.js';
import { config } from './config/env.js';
import { checkDatabaseConnection } from './config/prisma.js';
import { checkRedisConnection } from './config/redis.js';
import { BootstrapService } from './services/bootstrapService.js';

async function bootstrapServer() {
  console.log('---------------------------------------------------------');
  console.log(' BalanceVault — money movement with a ledger you can prove');
  console.log('---------------------------------------------------------');

  // Check subsystems on startup
  const dbStatus = await checkDatabaseConnection();
  console.log(` Database: ${dbStatus.connected ? ' Connected (' + dbStatus.latencyMs + 'ms)' : ' Not connected (' + dbStatus.error + ')'}`);

  const redisStatus = await checkRedisConnection();
  console.log(` Redis Rate Limiter: ${redisStatus.connected ? ' Connected (Redis)' : ' Active (' + redisStatus.provider + ')'}`);

  const bootstrapStatus = await BootstrapService.getStatus();
  if (bootstrapStatus.isBootstrapped) {
    console.log(` Admin Bootstrap:  Verified (Initial Admin: ${bootstrapStatus.initialAdminEmail || 'Configured'})`);
  } else {
    console.log(' Admin Bootstrap: ⚠️ PENDING — Run bootstrap script or use /api/v1/auth/bootstrap');
  }

  const server = app.listen(config.port, () => {
    console.log(` Server listening on port ${config.port} [${config.nodeEnv}]`);
    console.log(` Health check: ${config.apiBaseUrl}/healthz`);
    console.log(` Readiness:    ${config.apiBaseUrl}/readyz`);
    console.log('---------------------------------------------------------');
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n Shutting down BalanceVault server gracefully...');
    server.close(() => {
      console.log(' HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrapServer().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});


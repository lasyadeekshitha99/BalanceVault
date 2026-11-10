import { Router } from 'express';
import { checkDatabaseConnection } from '../config/prisma.js';
import { checkRedisConnection } from '../config/redis.js';
import { BootstrapService } from '../services/bootstrapService.js';

export const healthRouter = Router();

/**
 * Liveness Probe: Quick check if server process is running
 */
healthRouter.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

/**
 * Readiness Probe: In-depth check of dependent subsystems (DB, Redis, Bootstrap)
 */
healthRouter.get('/readyz', async (req, res) => {
  const [dbStatus, redisStatus, bootstrapStatus] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
    BootstrapService.getStatus()
  ]);

  const isReady = dbStatus.connected;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    subsystems: {
      database: {
        healthy: dbStatus.connected,
        latencyMs: dbStatus.latencyMs,
        error: dbStatus.error
      },
      redis: {
        healthy: redisStatus.connected,
        provider: redisStatus.provider,
        latencyMs: redisStatus.latencyMs
      },
      bootstrap: {
        isBootstrapped: bootstrapStatus.isBootstrapped,
        bootstrappedAt: bootstrapStatus.bootstrappedAt,
        adminConfigured: Boolean(bootstrapStatus.initialAdminEmail)
      }
    },
    system: {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version
    }
  });
});


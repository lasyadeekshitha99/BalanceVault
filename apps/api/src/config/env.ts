import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/balancevault?schema=public',
  bootstrapDatabaseUrl: process.env.BOOTSTRAP_DATABASE_URL || process.env.DATABASE_URL,
  
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  enableRedis: process.env.ENABLE_REDIS === 'true',
  
  jwtSecret: process.env.JWT_SECRET || 'super-secure-balancevault-jwt-secret-key-change-in-production-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  
  bootstrapSecretKey: process.env.BOOTSTRAP_SECRET_KEY || 'bv-bootstrap-super-secret-key-98765',
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL || 'admin@balancevault.internal',
  initialAdminName: process.env.INITIAL_ADMIN_NAME || 'System Super Administrator',
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || 'AdminSecureVaultPass2026!'
};


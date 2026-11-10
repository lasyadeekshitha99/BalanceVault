import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { adminRouter } from './routes/admin.js';
import { accountsRouter } from './routes/accounts.js';
import { config } from './config/env.js';

export const app = express();

// Trust proxy for secure headers and accurate IP detection behind reverse proxies/Neon/Vercel
app.set('trust proxy', 1);

// Standard Middlewares
app.use(cors({
  origin: [config.clientOrigin, 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Health & Readiness Endpoints (Liveness and Diagnostics)
app.use('/', healthRouter);

// API v1 Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/onboarding', onboardingRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/accounts', accountsRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(' [Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
  });
});


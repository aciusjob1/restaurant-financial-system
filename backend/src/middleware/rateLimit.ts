import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

// In tests we run many logins in one process; the limiter would trip at 10.
// Production and development keep the limiter active.
const noopLimiter: RequestHandler = (_req, _res, next) => next();

export const loginLimiter: RequestHandler =
  env.NODE_ENV === 'test'
    ? noopLimiter
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
        },
      });
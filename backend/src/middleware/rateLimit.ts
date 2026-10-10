import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

// In tests we run many logins in one process; the limiter would trip.
// Production and development keep the limiter active, but only failed
// logins count toward the ceiling, and the development ceiling is higher.
const noopLimiter: RequestHandler = (_req, _res, next) => next();

export const loginLimiter: RequestHandler =
  env.NODE_ENV === 'test'
    ? noopLimiter
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        // Production: 10 failed attempts per 15 min per IP.
        // Development: 100, so a normal day of testing never locks anyone out.
        // Successful logins do not consume a slot in either mode.
        max: env.NODE_ENV === 'production' ? 10 : 100,
        skipSuccessfulRequests: true,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
        },
      });

// PIN login uses the same IP-level rate limits as password login. The
// per-account lockout in User.failedPinAttempts / User.lockedUntil is the
// primary defense for PIN guessing; this limiter is the secondary layer
// that also caps attempts across different accounts from the same IP.
export const loginPinLimiter: RequestHandler = loginLimiter;

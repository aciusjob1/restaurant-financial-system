import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

// In tests we run many logins in one process; the limiter would trip. The
// factory makes that decision testable without booting a non-test process.
const noopLimiter: RequestHandler = (_req, _res, next) => next();

type LimiterConfig = {
  nodeEnv: string;
  windowMs: number;
  prodMax: number;
  devMax: number;
  message: string;
};

/**
 * Build a rate limiter as a pure function of its config. This is exported
 * so the test suite can construct limiters with production semantics
 * without needing a process whose NODE_ENV is 'production'.
 *
 * The application's own limiters below call this with `env.NODE_ENV`.
 * In test mode both return the noop limiter — the suite runs many
 * logins in one process and would otherwise trip on its own traffic.
 *
 * NOTE: these tests verify the limiter FACTORY, not the route wiring.
 * Whether the auth route actually mounts these handlers is a separate
 * concern (see outstanding follow-up in the E2E suite).
 */
export function createLoginLimiter(cfg: LimiterConfig): RequestHandler {
  if (cfg.nodeEnv === 'test') return noopLimiter;
  return rateLimit({
    windowMs: cfg.windowMs,
    max: cfg.nodeEnv === 'production' ? cfg.prodMax : cfg.devMax,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      code: 'RATE_LIMITED',
      message: cfg.message,
    },
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Password login.
//   Production: 10 failed attempts per 15 min per IP.
//   Development: 100, so a normal day of testing never locks anyone out.
//   Successful logins do not consume a slot in either mode.
export const loginLimiter: RequestHandler = createLoginLimiter({
  nodeEnv: env.NODE_ENV,
  windowMs: FIFTEEN_MINUTES,
  prodMax: 10,
  devMax: 100,
  message: 'Too many attempts. Please try again later.',
});

// PIN login (username + PIN) shares the SAME limiter instance as password
// login. The per-account lockout in User.failedPinAttempts / lockedUntil is
// the primary defense for PIN guessing; this limiter is the secondary layer
// that also caps attempts across different accounts from the same IP.
export const loginPinLimiter: RequestHandler = loginLimiter;

// PIN-only login: no username, so a wrong PIN resolves to no user row and
// the per-account lockout cannot be the primary defense. This limiter is
// the only guard, so it's tighter than the username+pin limiter. 5 failed
// attempts per 15 minutes per IP in production. Successful logins do not
// consume a slot.
export const loginPinOnlyLimiter: RequestHandler = createLoginLimiter({
  nodeEnv: env.NODE_ENV,
  windowMs: FIFTEEN_MINUTES,
  prodMax: 5,
  devMax: 50,
  message: 'Too many PIN attempts. Please try again later.',
});
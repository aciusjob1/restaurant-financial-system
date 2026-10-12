import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLoginLimiter } from '../src/middleware/rateLimit.js';

/**
 * Tests the limiter FACTORIES, not the route wiring.
 *
 * These tests verify:
 *   - the max / skipSuccessfulRequests / window settings the factory
 *     produces for production, development, and test environments
 *   - the 429 shape returned when the limit is hit
 *   - that NODE_ENV=test yields the noop passthrough
 *
 * These tests DO NOT verify:
 *   - that authRoutes.ts actually mounts loginPinOnlyLimiter on
 *     POST /api/v1/auth/login-pin-only
 *
 * Verifying the wiring requires booting the backend with NODE_ENV != 'test'
 * and hitting the real route. That is tracked as outstanding security
 * work and must be completed before treating rate-limit enforcement on
 * this endpoint as fully verified.
 *
 * Determinism notes:
 *   - Each test constructs its own limiter, so counters cannot leak
 *     between tests even though they share the process.
 *   - The window-expiry test passes a short windowMs instead of sleeping
 *     for 15 minutes.
 *   - No network ports are bound; supertest drives the app in-process.
 */

const WINDOW_MS = 60 * 1000; // default for most tests
const SHORT_WINDOW_MS = 200; // for the expiry test

// A minimal app that mimics what the route would look like: the limiter
// runs first, then a handler that returns 200 or 401 depending on a
// query flag. This mirrors the real route's ordering — the limiter
// runs before validateBody / asyncHandler — without pulling in the
// full app graph.
function buildApp(opts: {
  prodMax: number;
  devMax: number;
  nodeEnv: string;
  windowMs?: number;
  message?: string;
}) {
  const app = express();
  app.use(express.json());
  const limiter = createLoginLimiter({
    nodeEnv: opts.nodeEnv,
    windowMs: opts.windowMs ?? WINDOW_MS,
    prodMax: opts.prodMax,
    devMax: opts.devMax,
    message: opts.message ?? 'Too many attempts. Please try again later.',
  });
  app.post('/probe', limiter, (req, res) => {
    // If the caller wants a "successful" response (200) so it can test
    // skipSuccessfulRequests, they set succeed=1 in the body.
    if (req.body?.succeed === true) {
      res.status(200).json({ success: true });
      return;
    }
    res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS' });
  });
  return app;
}

describe('createLoginLimiter — PIN-only limiter config', () => {
  it('production allows 5 failures, 6th returns 429 RATE_LIMITED with the PIN message', async () => {
    const app = buildApp({
      nodeEnv: 'production',
      prodMax: 5,
      devMax: 50,
      message: 'Too many PIN attempts. Please try again later.',
    });

    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }

    const sixth = await request(app).post('/probe').send({});
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many PIN attempts. Please try again later.',
    });
  });

  it('development allows 50 failures, 51st returns 429', async () => {
    const app = buildApp({
      nodeEnv: 'development',
      prodMax: 5,
      devMax: 50,
    });

    for (let i = 1; i <= 50; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }

    const fiftyFirst = await request(app).post('/probe').send({});
    expect(fiftyFirst.status).toBe(429);
    expect(fiftyFirst.body.code).toBe('RATE_LIMITED');
  });

  it('test environment yields the noop passthrough — 100 requests all reach the handler', async () => {
    const app = buildApp({
      nodeEnv: 'test',
      prodMax: 5,
      devMax: 50,
    });

    for (let i = 1; i <= 100; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }
    // No 429 anywhere — the limiter never fired.
  });

  it('successful requests do not consume a slot (skipSuccessfulRequests)', async () => {
    const app = buildApp({
      nodeEnv: 'production',
      prodMax: 5,
      devMax: 50,
    });

    // Fire 10 successful requests. If skipSuccessfulRequests were false,
    // these would blow past the limit and the 11th would be 429.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/probe').send({ succeed: true });
      expect(res.status).toBe(200);
    }

    // Now 5 failures should still be allowed.
    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }

    // The 6th failure trips the limit.
    const sixth = await request(app).post('/probe').send({});
    expect(sixth.status).toBe(429);
  });

  it('window expiry resets the counter', async () => {
    const app = buildApp({
      nodeEnv: 'production',
      prodMax: 3,
      devMax: 50,
      windowMs: SHORT_WINDOW_MS,
    });

    // Exhaust the limit.
    for (let i = 1; i <= 3; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/probe').send({});
    expect(blocked.status).toBe(429);

    // Wait past the window.
    await new Promise((r) => setTimeout(r, SHORT_WINDOW_MS + 50));

    // Fresh slot — allowed again.
    const fresh = await request(app).post('/probe').send({});
    expect(fresh.status).toBe(401);
  });
});

describe('createLoginLimiter — username+pin limiter config', () => {
  it('production allows 10 failures, 11th returns 429 with the password message', async () => {
    const app = buildApp({
      nodeEnv: 'production',
      prodMax: 10,
      devMax: 100,
      message: 'Too many attempts. Please try again later.',
    });

    for (let i = 1; i <= 10; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }

    const eleventh = await request(app).post('/probe').send({});
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual({
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please try again later.',
    });
  });

  it('successful requests do not consume a slot (symmetry with PIN-only)', async () => {
    const app = buildApp({
      nodeEnv: 'production',
      prodMax: 10,
      devMax: 100,
    });

    for (let i = 0; i < 15; i++) {
      const res = await request(app).post('/probe').send({ succeed: true });
      expect(res.status).toBe(200);
    }

    for (let i = 1; i <= 10; i++) {
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(401);
    }

    const eleventh = await request(app).post('/probe').send({});
    expect(eleventh.status).toBe(429);
  });
});
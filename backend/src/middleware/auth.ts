import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashSessionToken, clearSessionCookie } from '../lib/session.js';
import { clearDeviceCookie } from '../lib/device.js';
import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

const LAST_SEEN_THROTTLE_MS = 60_000;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token || typeof token !== 'string') {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const tokenHash = hashSessionToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true, device: true },
    });

    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      clearSessionCookie(res);
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session has expired.');
    }
    if (session.revokedAt) {
      clearSessionCookie(res);
      throw new ApiError(401, 'SESSION_REVOKED', 'This session has been signed out.');
    }
    if (session.device?.status === 'BLOCKED') {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokedBy: 'system',
          revokedReason: 'Device blocked',
        },
      }).catch(() => {});
      clearSessionCookie(res);
      clearDeviceCookie(res);
      throw new ApiError(401, 'DEVICE_BLOCKED', 'This device has been blocked.');
    }
    if (!session.user.isActive) {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'Account is disabled.');
    }

    req.user = {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      role: session.user.role,
      isActive: session.user.isActive,
      phone: session.user.phone,
      language: session.user.language,
      autoApproveExpenses: session.user.autoApproveExpenses,
      autoReviewReconciliations: session.user.autoReviewReconciliations,
      autoConfirmHandovers: session.user.autoConfirmHandovers,
    };
    req.sessionToken = token;
    req.sessionId = session.id;
    req.deviceId = session.deviceId;

    // Monitoring heartbeat. Throttled so normal request traffic does not
    // write to the session/device rows on every call.
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      const now = new Date();
      const userAgent = req.get('user-agent') ?? undefined;
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, ipAddress: req.ip ?? session.ipAddress },
      }).catch(() => {});
      if (session.deviceId) {
        await prisma.device.update({
          where: { id: session.deviceId },
          data: {
            lastSeenAt: now,
            lastIp: req.ip ?? undefined,
            lastUserId: session.userId,
            userAgent,
          },
        }).catch(() => {});
      }
    }

    next();
  } catch (err) { next(err); }
}

export function requireRole(...allowed: Array<'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    if (!allowed.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission.'));
    }
    next();
  };
}
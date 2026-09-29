import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { hashSessionToken } from '../lib/session.js';
import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token || typeof token !== 'string') {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const tokenHash = hashSessionToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session has expired.');
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
    };
    req.sessionToken = token;
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
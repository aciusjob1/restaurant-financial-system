import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';

const DEVICE_COOKIE_NAME = 'rfs_device';
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function derivePlatform(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/Electron\//i.test(userAgent)) return 'Desktop app';
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return null;
}

function deriveBrowser(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/Electron\//i.test(userAgent)) return null;
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return null;
}

function defaultDeviceName(userAgent: string | null): string {
  const platform = derivePlatform(userAgent);
  const browser = deriveBrowser(userAgent);
  const label = [platform, browser].filter(Boolean).join(' - ');
  return (label || 'Unknown device').slice(0, 60);
}

function setDeviceCookie(res: Response, token: string): void {
  res.cookie(DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

export function clearDeviceCookie(res: Response): void {
  res.clearCookie(DEVICE_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Resolves the HttpOnly device cookie to a Device row, creating one on
 * first contact. Called only after credentials have been verified.
 *
 * The cookie is an opaque server-issued identifier; the database stores
 * its SHA-256 hash. It is not an authentication credential — it only ties
 * sessions to a manageable device record.
 */
export async function resolveDeviceForLogin(
  req: Request,
  res: Response,
  userId: string
): Promise<{ deviceId: string; deviceName: string }> {
  const existingToken = req.cookies?.[DEVICE_COOKIE_NAME];
  const now = new Date();
  const userAgent = req.get('user-agent') ?? null;
  const ipAddress = req.ip ?? null;

  if (typeof existingToken === 'string' && existingToken.length > 0) {
    const existing = await prisma.device.findUnique({
      where: { deviceKey: hashDeviceToken(existingToken) },
    });
    if (existing) {
      if (existing.status === 'BLOCKED') {
        throw new ApiError(
          403,
          'DEVICE_BLOCKED',
          'This device has been blocked. Ask an owner to restore access.'
        );
      }
      await prisma.device.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          lastIp: ipAddress,
          lastUserId: userId,
          userAgent: userAgent ?? existing.userAgent,
        },
      });
      return { deviceId: existing.id, deviceName: existing.name };
    }
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const created = await prisma.device.create({
    data: {
      deviceKey: hashDeviceToken(token),
      name: defaultDeviceName(userAgent),
      platform: derivePlatform(userAgent),
      userAgent,
      lastIp: ipAddress,
      lastSeenAt: now,
      lastUserId: userId,
      createdBy: userId,
    },
  });
  setDeviceCookie(res, token);
  return { deviceId: created.id, deviceName: created.name };
}

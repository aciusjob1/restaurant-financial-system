import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import type { DeviceAccessStatus, Role } from '@prisma/client';

type Actor = { id: string; role: Role };

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const ACTIVE_SESSION_SELECT = {
  id: true,
  ipAddress: true,
  userAgent: true,
  lastSeenAt: true,
  expiresAt: true,
  createdAt: true,
  user: {
    select: { id: true, username: true, fullName: true, role: true },
  },
} as const;

function serializeDevice(device: {
  id: string;
  name: string;
  status: DeviceAccessStatus;
  platform: string | null;
  userAgent: string | null;
  lastIp: string | null;
  lastSeenAt: Date | null;
  lastUserId: string | null;
  blockedAt: Date | null;
  blockedBy: string | null;
  blockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessions?: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    lastSeenAt: Date;
    expiresAt: Date;
    createdAt: Date;
    user: { id: string; username: string; fullName: string; role: Role };
  }>;
}) {
  const sessions = (device.sessions ?? []).map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    user: s.user,
  }));
  const users = new Map<string, { id: string; username: string; fullName: string; role: Role }>();
  for (const s of sessions) users.set(s.user.id, s.user);

  return {
    id: device.id,
    name: device.name,
    status: device.status,
    platform: device.platform,
    userAgent: device.userAgent,
    lastIp: device.lastIp,
    lastSeenAt: iso(device.lastSeenAt),
    lastUserId: device.lastUserId,
    blockedAt: iso(device.blockedAt),
    blockedBy: device.blockedBy,
    blockReason: device.blockReason,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    sessions,
    activeUsers: Array.from(users.values()),
  };
}

export async function listDevices() {
  const now = new Date();
  const [devices, unregisteredSessions] = await Promise.all([
    prisma.device.findMany({
      // Most recently active first. Devices that have never been seen
      // carry a null lastSeenAt and must sort after the active ones.
      orderBy: [
        { lastSeenAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: 200,
      include: {
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          orderBy: { lastSeenAt: 'desc' },
          select: ACTIVE_SESSION_SELECT,
        },
      },
    }),
    prisma.session.findMany({
      where: { deviceId: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      select: ACTIVE_SESSION_SELECT,
    }),
  ]);

  return {
    devices: devices.map((d) => serializeDevice(d)),
    unregisteredSessions: unregisteredSessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      user: s.user,
    })),
  };
}

export async function renameDevice(input: {
  id: string;
  actor: Actor;
  name: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can rename devices.');
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ApiError(400, 'INVALID_NAME', 'Device name cannot be empty.');
  }
  const existing = await prisma.device.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Device not found.');

  const updated = await prisma.device.update({
    where: { id: input.id },
    data: { name },
  });
  return serializeDevice(updated);
}

export async function setDeviceAccess(input: {
  id: string;
  actor: Actor;
  status: DeviceAccessStatus;
  reason?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can change device access.');
  }

  const device = await prisma.device.findUnique({
    where: { id: input.id },
    include: {
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { user: { select: { role: true } } },
      },
    },
  });
  if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found.');

  if (input.actor.role !== 'OWNER') {
    const lastUser = device.lastUserId
      ? await prisma.user.findUnique({
          where: { id: device.lastUserId },
          select: { role: true },
        })
      : null;
    const ownerInvolved =
      device.sessions.some((s) => s.user.role === 'OWNER') || lastUser?.role === 'OWNER';
    if (ownerInvolved) {
      throw new ApiError(
        403,
        'OWNER_DEVICE',
        'A manager cannot block or restore access for the owner\'s device.'
      );
    }
  }

  const now = new Date();
  const reason = input.reason?.trim() || null;

  if (input.status === 'BLOCKED') {
    const [updated, revoked] = await prisma.$transaction([
      prisma.device.update({
        where: { id: input.id },
        data: {
          status: 'BLOCKED',
          blockedAt: now,
          blockedBy: input.actor.id,
          blockReason: reason ?? 'Device access disabled',
        },
      }),
      prisma.session.updateMany({
        where: { deviceId: input.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokedBy: input.actor.id,
          revokedReason: reason ?? 'Device access disabled',
        },
      }),
    ]);
    return { device: serializeDevice(updated), revokedSessions: revoked.count };
  }

  const updated = await prisma.device.update({
    where: { id: input.id },
    data: {
      status: 'ALLOWED',
      blockedAt: null,
      blockedBy: null,
      blockReason: null,
    },
  });
  return { device: serializeDevice(updated), revokedSessions: 0 };
}

export async function revokeSession(input: {
  id: string;
  actor: Actor;
  currentSessionId?: string;
  reason?: string | null;
}) {
  const session = await prisma.session.findUnique({
    where: { id: input.id },
    include: { user: { select: { username: true, fullName: true, role: true } } },
  });
  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Session not found.');
  if (session.revokedAt) {
    throw new ApiError(409, 'ALREADY_REVOKED', 'This session is already signed out.');
  }
  if (input.currentSessionId && session.id === input.currentSessionId) {
    throw new ApiError(
      409,
      'SESSION_SELF',
      'You cannot sign out the session you are currently using. Use Log out instead.'
    );
  }
  if (input.actor.role !== 'OWNER' && session.user.role === 'OWNER') {
    throw new ApiError(
      403,
      'OWNER_SESSION',
      'A manager cannot sign out an owner\'s session.'
    );
  }

  const now = new Date();
  await prisma.session.update({
    where: { id: session.id },
    data: {
      revokedAt: now,
      revokedBy: input.actor.id,
      revokedReason: input.reason?.trim() || 'Signed out from device management',
    },
  });
  return {
    id: session.id,
    userId: session.userId,
    userName: session.user.fullName,
    revokedAt: now.toISOString(),
  };
}

/**
 * Emergency stop: blocks every device and signs out every session except the
 * caller's current device/session. The caller keeps working, so an owner can
 * never lock themselves out by accident. Restore access per device with
 * setDeviceAccess({ status: 'ALLOWED' }).
 */
export async function blockAllDevices(input: {
  actor: Actor;
  currentDeviceId?: string | null;
  currentSessionId?: string | null;
  reason?: string | null;
}) {
  if (input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owner can block all devices.');
  }

  const now = new Date();
  const reason = input.reason?.trim() || 'All devices blocked by owner';

  const deviceWhere: {
    status: { not: 'BLOCKED' };
    id?: { not: string };
  } = { status: { not: 'BLOCKED' } };
  if (input.currentDeviceId) deviceWhere.id = { not: input.currentDeviceId };

  const sessionWhere: {
    revokedAt: null;
    deviceId?: { not: string };
    id?: { not: string };
  } = { revokedAt: null };
  // Keep every session on the caller's device (including the caller's own).
  if (input.currentDeviceId) sessionWhere.deviceId = { not: input.currentDeviceId };
  // Also keep the caller's session when it is not tied to a device yet.
  if (input.currentSessionId) sessionWhere.id = { not: input.currentSessionId };

  const [devices, sessions] = await prisma.$transaction([
    prisma.device.updateMany({
      where: deviceWhere,
      data: {
        status: 'BLOCKED',
        blockedAt: now,
        blockedBy: input.actor.id,
        blockReason: reason,
      },
    }),
    prisma.session.updateMany({
      where: sessionWhere,
      data: {
        revokedAt: now,
        revokedBy: input.actor.id,
        revokedReason: reason,
      },
    }),
  ]);

  return {
    blockedDevices: devices.count,
    revokedSessions: sessions.count,
    keptDeviceId: input.currentDeviceId ?? null,
  };
}

/**
 * Restore sign-in access for every blocked device. Sessions revoked by the
 * earlier block stay revoked; users must sign in again on each device.
 * Owner-only: managers can already restore devices one at a time.
 */
export async function allowAllDevices(input: { actor: Actor }) {
  if (input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owner can restore all devices.');
  }

  const result = await prisma.device.updateMany({
    where: { status: 'BLOCKED' },
    data: {
      status: 'ALLOWED',
      blockedAt: null,
      blockedBy: null,
      blockReason: null,
    },
  });

  return { allowedDevices: result.count };
}

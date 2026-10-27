import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  deviceUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    device: { updateMany: mocks.deviceUpdateMany },
    session: { updateMany: mocks.sessionUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import { blockAllDevices, allowAllDevices } from '../src/services/deviceService.js';

beforeEach(() => {
  mocks.deviceUpdateMany.mockReset().mockResolvedValue({ count: 3 });
  mocks.sessionUpdateMany.mockReset().mockResolvedValue({ count: 4 });
  mocks.transaction
    .mockReset()
    .mockImplementation(async (ops: Array<Promise<unknown>>) => Promise.all(ops));
});

describe('blockAllDevices', () => {
  it('rejects managers without touching the database', async () => {
    await expect(
      blockAllDevices({
        actor: { id: 'manager-1', role: 'MANAGER' as const },
        currentDeviceId: 'dev-1',
        currentSessionId: 'sess-1',
      })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deviceUpdateMany).not.toHaveBeenCalled();
  });

  it('blocks every device except the caller device and revokes other sessions', async () => {
    const result = await blockAllDevices({
      actor: { id: 'owner-1', role: 'OWNER' as const },
      currentDeviceId: 'dev-current',
      currentSessionId: 'sess-current',
      reason: '  emergency lockdown  ',
    });

    expect(result).toEqual({
      blockedDevices: 3,
      revokedSessions: 4,
      keptDeviceId: 'dev-current',
    });

    expect(mocks.deviceUpdateMany).toHaveBeenCalledWith({
      where: { status: { not: 'BLOCKED' }, id: { not: 'dev-current' } },
      data: {
        status: 'BLOCKED',
        blockedAt: expect.any(Date),
        blockedBy: 'owner-1',
        blockReason: 'emergency lockdown',
      },
    });

    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        deviceId: { not: 'dev-current' },
        id: { not: 'sess-current' },
      },
      data: {
        revokedAt: expect.any(Date),
        revokedBy: 'owner-1',
        revokedReason: 'emergency lockdown',
      },
    });
  });

  it('keeps the caller session when it has no device, and still revokes unregistered sessions', async () => {
    await blockAllDevices({
      actor: { id: 'owner-1', role: 'OWNER' as const },
      currentDeviceId: null,
      currentSessionId: 'sess-current',
    });

    // No device filter means devices are all blocked; the caller keeps only
    // their current session, not an unregistered-session exemption.
    expect(mocks.deviceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { not: 'BLOCKED' } } })
    );
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { revokedAt: null, id: { not: 'sess-current' } },
        data: expect.objectContaining({
          revokedBy: 'owner-1',
          revokedReason: 'All devices blocked by owner',
        }),
      })
    );
  });

  it('is a no-op when there is nothing left to block', async () => {
    mocks.deviceUpdateMany.mockResolvedValue({ count: 0 });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 0 });

    const result = await blockAllDevices({
      actor: { id: 'owner-1', role: 'OWNER' as const },
      currentDeviceId: 'dev-current',
      currentSessionId: 'sess-current',
    });

    expect(result).toEqual({
      blockedDevices: 0,
      revokedSessions: 0,
      keptDeviceId: 'dev-current',
    });
  });
});

describe('allowAllDevices', () => {
  it('rejects managers without touching the database', async () => {
    await expect(
      allowAllDevices({ actor: { id: 'manager-1', role: 'MANAGER' as const } })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(mocks.deviceUpdateMany).not.toHaveBeenCalled();
  });

  it('restores every blocked device and clears block metadata', async () => {
    mocks.deviceUpdateMany.mockResolvedValue({ count: 2 });

    const result = await allowAllDevices({
      actor: { id: 'owner-1', role: 'OWNER' as const },
    });

    expect(result).toEqual({ allowedDevices: 2 });
    expect(mocks.deviceUpdateMany).toHaveBeenCalledWith({
      where: { status: 'BLOCKED' },
      data: {
        status: 'ALLOWED',
        blockedAt: null,
        blockedBy: null,
        blockReason: null,
      },
    });
  });

  it('reports zero when nothing is blocked', async () => {
    mocks.deviceUpdateMany.mockResolvedValue({ count: 0 });

    const result = await allowAllDevices({
      actor: { id: 'owner-1', role: 'OWNER' as const },
    });

    expect(result).toEqual({ allowedDevices: 0 });
  });
});

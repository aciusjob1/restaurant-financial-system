import type { Request, Response } from 'express';
import * as deviceService from '../services/deviceService.js';
import type { Role } from '@prisma/client';
import type {
  BlockAllDevicesInput,
  DeviceAccessInput,
  RenameDeviceInput,
  RevokeSessionInput,
} from '../validators/system.js';

export async function listDevices(_req: Request, res: Response) {
  const result = await deviceService.listDevices();
  res.json({ success: true, ...result });
}

export async function renameDevice(req: Request, res: Response) {
  const input = req.body as RenameDeviceInput;
  const device = await deviceService.renameDevice({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role as Role },
    name: input.name,
  });
  res.json({ success: true, device });
}

export async function setDeviceAccess(req: Request, res: Response) {
  const input = req.body as DeviceAccessInput;
  const result = await deviceService.setDeviceAccess({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role as Role },
    status: input.status,
    reason: input.reason ?? null,
  });
  res.json({ success: true, ...result });
}

export async function revokeSession(req: Request, res: Response) {
  const input = req.body as RevokeSessionInput;
  const session = await deviceService.revokeSession({
    id: req.params.id!,
    actor: { id: req.user!.id, role: req.user!.role as Role },
    currentSessionId: req.sessionId,
    reason: input.reason ?? null,
  });
  res.json({ success: true, session });
}

export async function blockAllDevices(req: Request, res: Response) {
  const input = req.body as BlockAllDevicesInput;
  const result = await deviceService.blockAllDevices({
    actor: { id: req.user!.id, role: req.user!.role as Role },
    currentDeviceId: req.deviceId ?? null,
    currentSessionId: req.sessionId ?? null,
    reason: input.reason ?? null,
  });
  res.json({ success: true, ...result });
}

export async function allowAllDevices(req: Request, res: Response) {
  const result = await deviceService.allowAllDevices({
    actor: { id: req.user!.id, role: req.user!.role as Role },
  });
  res.json({ success: true, ...result });
}

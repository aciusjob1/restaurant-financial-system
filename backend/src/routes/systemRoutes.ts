import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { systemAccess } from '../controllers/systemController.js';
import {
  listDevices,
  renameDevice,
  setDeviceAccess,
  revokeSession,
  blockAllDevices,
  allowAllDevices,
} from '../controllers/deviceController.js';
import {
  RenameDeviceSchema,
  DeviceAccessSchema,
  RevokeSessionSchema,
  BlockAllDevicesSchema,
} from '../validators/system.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const systemRouter = Router();

// Owner/Manager only. Read-only. Returns network-address metadata only.
systemRouter.get(
  '/access',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  systemAccess
);

// Connected devices and their active sessions. Owner/Manager only.
systemRouter.get(
  '/devices',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(listDevices)
);

systemRouter.patch(
  '/devices/:id',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  validateBody(RenameDeviceSchema),
  asyncHandler(renameDevice)
);

// Emergency stop. Owner only. Blocks every device and revokes every session
// except the caller's current device/session.
systemRouter.post(
  '/devices/block-all',
  requireAuth,
  requireRole('OWNER'),
  validateBody(BlockAllDevicesSchema),
  asyncHandler(blockAllDevices)
);

// Restore sign-in access for every blocked device. Owner only. Revoked
// sessions stay revoked, so each device must sign in again.
systemRouter.post(
  '/devices/allow-all',
  requireAuth,
  requireRole('OWNER'),
  asyncHandler(allowAllDevices)
);

// Blocking revokes every active session on the device. Managers cannot
// block a device the owner has used; the service enforces that rule.
systemRouter.post(
  '/devices/:id/access',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  validateBody(DeviceAccessSchema),
  asyncHandler(setDeviceAccess)
);

systemRouter.post(
  '/sessions/:id/revoke',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  validateBody(RevokeSessionSchema),
  asyncHandler(revokeSession)
);

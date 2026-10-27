import { z } from 'zod';

export const RenameDeviceSchema = z
  .object({
    name: z.string().trim().min(1, 'Device name is required').max(60),
  })
  .strict();

export const DeviceAccessSchema = z
  .object({
    status: z.enum(['ALLOWED', 'BLOCKED']),
    reason: z.string().trim().min(3).max(200).optional(),
  })
  .strict();

export const RevokeSessionSchema = z
  .object({
    reason: z.string().trim().min(3).max(200).optional(),
  })
  .strict();

export const BlockAllDevicesSchema = z
  .object({
    reason: z.string().trim().min(3).max(200).optional(),
  })
  .strict();

export type RenameDeviceInput = z.infer<typeof RenameDeviceSchema>;
export type DeviceAccessInput = z.infer<typeof DeviceAccessSchema>;
export type RevokeSessionInput = z.infer<typeof RevokeSessionSchema>;
export type BlockAllDevicesInput = z.infer<typeof BlockAllDevicesSchema>;

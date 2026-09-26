import { z } from 'zod';

export const LoginRequest = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const LoginResponse = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    username: z.string(),
    fullName: z.string(),
    role: z.enum(['OWNER', 'MANAGER', 'WAITER', 'AUDITOR']),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const MeResponse = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.string(),
    username: z.string(),
    fullName: z.string(),
    role: z.enum(['OWNER', 'MANAGER', 'WAITER', 'AUDITOR']),
    isActive: z.boolean(),
  }),
});
export type MeResponse = z.infer<typeof MeResponse>;
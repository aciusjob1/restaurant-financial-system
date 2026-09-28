import { z } from 'zod';

const ROLES = ['OWNER', 'MANAGER', 'WAITER', 'AUDITOR'] as const;

export const CreateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only contain letters, digits, _, ., or -.'),
  fullName: z.string().trim().min(1).max(128),
  phone: z.string().trim().max(32).nullable().optional(),
  role: z.enum(ROLES),
  password: z.string().min(12).max(256),
});

export const UpdateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(128).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;


export const ResetPasswordSchema = z
  .object({
    newPassword: z.string().min(12).max(256),
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

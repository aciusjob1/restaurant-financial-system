import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(12).max(256),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateMyProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(128).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
  })
  .strict();

export type UpdateMyProfileInput = z.infer<typeof UpdateMyProfileSchema>;

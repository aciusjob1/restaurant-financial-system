import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const LoginPinSchema = z.object({
  username: z.string().trim().min(3).max(64),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});
export const LoginPinOnlySchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

export const SetPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(12).max(256),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type LoginPinInput = z.infer<typeof LoginPinSchema>;
export type LoginPinOnlyInput = z.infer<typeof LoginPinOnlySchema>;
export type SetPinInput = z.infer<typeof SetPinSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateMyProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(128).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    language: z.enum(['en', 'sw']).nullable().optional(),
    autoApproveExpenses: z.boolean().optional(),
    autoReviewReconciliations: z.boolean().optional(),
    autoConfirmHandovers: z.boolean().optional(),
  })
  .strict();

export type UpdateMyProfileInput = z.infer<typeof UpdateMyProfileSchema>;

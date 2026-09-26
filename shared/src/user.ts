import { z } from 'zod';

export const ROLES = ['OWNER', 'MANAGER', 'WAITER', 'AUDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const PublicUser = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  lastLogin: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const CreateUserRequest = z.object({
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
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateUserRequest = z.object({
  fullName: z.string().trim().min(1).max(128).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const UsersListResponse = z.object({
  success: z.literal(true),
  users: z.array(PublicUser),
});
export type UsersListResponse = z.infer<typeof UsersListResponse>;

export const UserResponse = z.object({
  success: z.literal(true),
  user: PublicUser,
});
export type UserResponse = z.infer<typeof UserResponse>;
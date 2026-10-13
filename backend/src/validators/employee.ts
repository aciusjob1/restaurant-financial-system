import { z } from 'zod';
import { titleCaseName } from '../utils/textCase.js';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

export const CreatePositionSchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).nullable().optional(),
  defaultSalary: MoneyString,
});

export const UpdatePositionSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  defaultSalary: MoneyString.optional(),
  isActive: z.boolean().optional(),
});

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const LoginSubSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only contain letters, digits, _, ., or -.'),
  password: z.string().min(12).max(256),
  role: z.enum(['WAITER', 'MANAGER']),
});

export const CreateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(128).transform(titleCaseName),
  phone: z.string().trim().max(32).nullable().optional(),
  positionId: z.string().min(1),
  userId: z.string().nullable().optional(),
  startDate: DateOnly,
  notes: z.string().trim().max(500).nullable().optional(),
  login: LoginSubSchema.nullable().optional(),
});

export const UpdateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(128).transform(titleCaseName).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  positionId: z.string().min(1).optional(),
  userId: z.string().nullable().optional(),
  employmentStatus: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
  startDate: DateOnly.optional(),
  endDate: DateOnly.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreatePositionInput = z.infer<typeof CreatePositionSchema>;
export type UpdatePositionInput = z.infer<typeof UpdatePositionSchema>;
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
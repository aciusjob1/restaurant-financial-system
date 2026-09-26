import { z } from 'zod';

export const EMPLOYMENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

// Money on the wire is always a decimal string, never a JSON number.
// Example: "350000.00"
const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

// ---------- Position ----------

export const PublicPosition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  defaultSalary: MoneyString,
  isActive: z.boolean(),
  createdAt: z.string().optional(),
});
export type PublicPosition = z.infer<typeof PublicPosition>;

export const CreatePositionRequest = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).nullable().optional(),
  defaultSalary: MoneyString,
});
export type CreatePositionRequest = z.infer<typeof CreatePositionRequest>;

export const UpdatePositionRequest = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  defaultSalary: MoneyString.optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePositionRequest = z.infer<typeof UpdatePositionRequest>;

export const PositionsListResponse = z.object({
  success: z.literal(true),
  positions: z.array(PublicPosition),
});
export type PositionsListResponse = z.infer<typeof PositionsListResponse>;

export const PositionResponse = z.object({
  success: z.literal(true),
  position: PublicPosition,
});
export type PositionResponse = z.infer<typeof PositionResponse>;

// ---------- Employee ----------

export const PublicEmployee = z.object({
  id: z.string(),
  employeeNumber: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  positionId: z.string(),
  userId: z.string().nullable(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  startDate: z.string(),   // ISO date-only, e.g. "2026-09-24"
  endDate: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
});
export type PublicEmployee = z.infer<typeof PublicEmployee>;

// YYYY-MM-DD, matches @db.Date
const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const CreateEmployeeRequest = z.object({
  fullName: z.string().trim().min(1).max(128),
  phone: z.string().trim().max(32).nullable().optional(),
  positionId: z.string().min(1),
  userId: z.string().nullable().optional(),
  startDate: DateOnly,
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequest>;

export const UpdateEmployeeRequest = z.object({
  fullName: z.string().trim().min(1).max(128).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  positionId: z.string().min(1).optional(),
  userId: z.string().nullable().optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  startDate: DateOnly.optional(),
  endDate: DateOnly.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequest>;

export const EmployeesListResponse = z.object({
  success: z.literal(true),
  employees: z.array(PublicEmployee),
});
export type EmployeesListResponse = z.infer<typeof EmployeesListResponse>;

export const EmployeeResponse = z.object({
  success: z.literal(true),
  employee: PublicEmployee,
});
export type EmployeeResponse = z.infer<typeof EmployeeResponse>;
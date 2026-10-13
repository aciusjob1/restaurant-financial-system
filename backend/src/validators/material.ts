import { z } from 'zod';
import { titleCaseName } from '../utils/textCase.js';

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const NonNegativeMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-'),
  { message: 'Amount must not be negative.' }
);

const PositiveMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Amount must be positive.' }
);

export const CreateMaterialCategorySchema = z.object({
  name: z.string().trim().min(2).max(64).transform(titleCaseName),
  description: z.string().trim().max(500).nullable().optional(),
});

export const UpdateMaterialCategorySchema = z.object({
  name: z.string().trim().min(2).max(64).transform(titleCaseName).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const ListMaterialCategoriesQuerySchema = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const CreateMaterialSchema = z.object({
  name: z.string().trim().min(2).max(128).transform(titleCaseName),
  categoryId: z.string().min(1),
  unit: z.string().trim().min(1).max(16),
  currentPrice: PositiveMoneyString,
  minimumStock: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdateMaterialSchema = z.object({
  name: z.string().trim().min(2).max(128).transform(titleCaseName).optional(),
  categoryId: z.string().min(1).optional(),
  unit: z.string().trim().min(1).max(16).optional(),
  currentPrice: PositiveMoneyString.optional(),
  minimumStock: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const ListMaterialsQuerySchema = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  categoryId: z.string().min(1).optional(),
  search: z.string().trim().max(128).optional(),
});

export type CreateMaterialCategoryInput = z.infer<typeof CreateMaterialCategorySchema>;
export type UpdateMaterialCategoryInput = z.infer<typeof UpdateMaterialCategorySchema>;
export type ListMaterialCategoriesQuery = z.infer<typeof ListMaterialCategoriesQuerySchema>;
export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialSchema>;
export type ListMaterialsQuery = z.infer<typeof ListMaterialsQuerySchema>;
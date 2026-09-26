import { z } from 'zod';

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

// ---------- Material Category ----------

export const PublicMaterialCategory = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicMaterialCategory = z.infer<typeof PublicMaterialCategory>;

export const CreateMaterialCategoryRequest = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(500).nullable().optional(),
});
export type CreateMaterialCategoryRequest = z.infer<typeof CreateMaterialCategoryRequest>;

export const UpdateMaterialCategoryRequest = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMaterialCategoryRequest = z.infer<typeof UpdateMaterialCategoryRequest>;

export const MaterialCategoriesListResponse = z.object({
  success: z.literal(true),
  categories: z.array(PublicMaterialCategory),
});
export type MaterialCategoriesListResponse = z.infer<typeof MaterialCategoriesListResponse>;

export const MaterialCategoryResponse = z.object({
  success: z.literal(true),
  category: PublicMaterialCategory,
});
export type MaterialCategoryResponse = z.infer<typeof MaterialCategoryResponse>;

// ---------- Material ----------

export const PublicMaterial = z.object({
  id: z.string(),
  materialNumber: z.string(),
  name: z.string(),
  categoryId: z.string(),
  unit: z.string(),
  currentPrice: MoneyString,
  minimumStock: MoneyString,
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicMaterial = z.infer<typeof PublicMaterial>;

export const CreateMaterialRequest = z.object({
  name: z.string().trim().min(2).max(128),
  categoryId: z.string().min(1),
  unit: z.string().trim().min(1).max(16),
  currentPrice: PositiveMoneyString,
  minimumStock: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequest>;

export const UpdateMaterialRequest = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  categoryId: z.string().min(1).optional(),
  unit: z.string().trim().min(1).max(16).optional(),
  currentPrice: PositiveMoneyString.optional(),
  minimumStock: NonNegativeMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMaterialRequest = z.infer<typeof UpdateMaterialRequest>;

export const MaterialsListResponse = z.object({
  success: z.literal(true),
  materials: z.array(PublicMaterial),
});
export type MaterialsListResponse = z.infer<typeof MaterialsListResponse>;

export const MaterialResponse = z.object({
  success: z.literal(true),
  material: PublicMaterial,
});
export type MaterialResponse = z.infer<typeof MaterialResponse>;
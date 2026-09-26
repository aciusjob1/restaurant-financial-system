import type { Request, Response } from 'express';
import * as materialService from '../services/materialService.js';
import * as categoryService from '../services/materialCategoryService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListMaterialCategoriesQuerySchema,
  ListMaterialsQuerySchema,
  type CreateMaterialCategoryInput,
  type UpdateMaterialCategoryInput,
  type CreateMaterialInput,
  type UpdateMaterialInput,
} from '../validators/material.js';

// ---------- Categories ----------

export async function listCategories(req: Request, res: Response) {
  const parsed = ListMaterialCategoriesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const categories = await categoryService.listCategories({
    includeInactive: parsed.data.includeInactive,
  });
  res.json({ success: true, categories });
}

export async function getCategory(req: Request, res: Response) {
  const category = await categoryService.getCategoryById(req.params.id!);
  res.json({ success: true, category });
}

export async function createCategory(req: Request, res: Response) {
  const input = req.body as CreateMaterialCategoryInput;
  const category = await categoryService.createCategory({
    actor: { id: req.user!.id, role: req.user!.role },
    name: input.name,
    description: input.description ?? null,
  });
  res.status(201).json({ success: true, category });
}

export async function updateCategory(req: Request, res: Response) {
  const input = req.body as UpdateMaterialCategoryInput;
  const category = await categoryService.updateCategory(
    req.params.id!,
    { id: req.user!.id, role: req.user!.role },
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    }
  );
  res.json({ success: true, category });
}

// ---------- Materials ----------

export async function listMaterials(req: Request, res: Response) {
  const parsed = ListMaterialsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  const q = parsed.data;
  const materials = await materialService.listMaterials({
    includeInactive: q.includeInactive,
    categoryId: q.categoryId,
    search: q.search,
  });
  res.json({ success: true, materials });
}

export async function getMaterial(req: Request, res: Response) {
  const material = await materialService.getMaterialById(req.params.id!);
  res.json({ success: true, material });
}

export async function createMaterial(req: Request, res: Response) {
  const input = req.body as CreateMaterialInput;
  const material = await materialService.createMaterial({
    actor: { id: req.user!.id, role: req.user!.role },
    name: input.name,
    categoryId: input.categoryId,
    unit: input.unit,
    currentPrice: input.currentPrice,
    minimumStock: input.minimumStock,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, material });
}

export async function updateMaterial(req: Request, res: Response) {
  const input = req.body as UpdateMaterialInput;
  const material = await materialService.updateMaterial(
    req.params.id!,
    { id: req.user!.id, role: req.user!.role },
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.currentPrice !== undefined ? { currentPrice: input.currentPrice } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    }
  );
  res.json({ success: true, material });
}
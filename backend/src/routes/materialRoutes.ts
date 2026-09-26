import { Router } from 'express';
import * as materialController from '../controllers/materialController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateMaterialCategorySchema,
  UpdateMaterialCategorySchema,
  CreateMaterialSchema,
  UpdateMaterialSchema,
} from '../validators/material.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as stockMovementController from '../controllers/stockMovementController.js';

// ---------- /api/v1/material-categories ----------
export const materialCategoryRouter = Router();
materialCategoryRouter.use(requireAuth);

materialCategoryRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(materialController.listCategories)
);
materialCategoryRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(materialController.getCategory)
);
materialCategoryRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateMaterialCategorySchema),
  asyncHandler(materialController.createCategory)
);
materialCategoryRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateMaterialCategorySchema),
  asyncHandler(materialController.updateCategory)
);

// ---------- /api/v1/materials ----------
export const materialRouter = Router();
materialRouter.use(requireAuth);

materialRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(materialController.listMaterials)
);
materialRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(materialController.getMaterial)
);
materialRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateMaterialSchema),
  asyncHandler(materialController.createMaterial)
);
materialRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdateMaterialSchema),
  asyncHandler(materialController.updateMaterial)
);

materialRouter.get(
  '/:id/stock',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(stockMovementController.materialStock)
);
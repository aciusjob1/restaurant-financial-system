import { Router } from 'express';
import * as controller from '../controllers/stockMovementController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { CreateStockMovementSchema } from '../validators/stockMovement.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const stockMovementRouter = Router();
stockMovementRouter.use(requireAuth);

// Valuation must come before /:id so it isn't swallowed.
stockMovementRouter.get(
  '/valuation',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(controller.valuation)
);

stockMovementRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(controller.list)
);

stockMovementRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(controller.getOne)
);

stockMovementRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateStockMovementSchema),
  asyncHandler(controller.create)
);
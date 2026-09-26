import { Router } from 'express';
import * as handoverController from '../controllers/handoverController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateCashHandoverSchema,
  ConfirmCashHandoverSchema,
} from '../validators/handover.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const handoverRouter = Router();

handoverRouter.use(requireAuth);

// Read: all roles (WAITER scoped in service to their own).
handoverRouter.get('/', asyncHandler(handoverController.listHandovers));
handoverRouter.get('/:id', asyncHandler(handoverController.getHandover));

// Create: WAITER only (their own reconciliation).
handoverRouter.post(
  '/',
  requireRole('WAITER'),
  validateBody(CreateCashHandoverSchema),
  asyncHandler(handoverController.createHandover)
);

// Confirm: MANAGER / OWNER only.
handoverRouter.post(
  '/:id/confirm',
  requireRole('MANAGER', 'OWNER'),
  validateBody(ConfirmCashHandoverSchema),
  asyncHandler(handoverController.confirmHandover)
);
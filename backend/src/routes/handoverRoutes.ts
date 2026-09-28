import { Router } from 'express';
import * as handoverController from '../controllers/handoverController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateCashHandoverSchema,
  ConfirmCashHandoverSchema,
  VoidCashHandoverSchema,
} from '../validators/handover.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const handoverRouter = Router();

handoverRouter.use(requireAuth);

handoverRouter.get('/', asyncHandler(handoverController.listHandovers));
handoverRouter.get(
  '/receivable-users',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  asyncHandler(handoverController.listReceivableUsers)
);
handoverRouter.get('/:id', asyncHandler(handoverController.getHandover));

handoverRouter.post(
  '/',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  validateBody(CreateCashHandoverSchema),
  asyncHandler(handoverController.createHandover)
);

handoverRouter.post(
  '/:id/confirm',
  requireRole('MANAGER', 'OWNER'),
  validateBody(ConfirmCashHandoverSchema),
  asyncHandler(handoverController.confirmHandover)
);

handoverRouter.post(
  '/:id/void',
  requireRole('MANAGER', 'OWNER'),
  validateBody(VoidCashHandoverSchema),
  asyncHandler(handoverController.voidHandover)
);
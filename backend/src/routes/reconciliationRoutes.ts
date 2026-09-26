import { Router } from 'express';
import * as reconciliationController from '../controllers/reconciliationController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateReconciliationSchema,
  UpdateReconciliationSchema,
  ReviewReconciliationSchema,
} from '../validators/reconciliation.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth);

// Read: all roles (WAITER filtered to own in service).
reconciliationRouter.get('/', asyncHandler(reconciliationController.listReconciliations));
reconciliationRouter.get('/:id', asyncHandler(reconciliationController.getReconciliation));

// Create / edit / submit: WAITER only (their own shift).
reconciliationRouter.post(
  '/',
  requireRole('WAITER'),
  validateBody(CreateReconciliationSchema),
  asyncHandler(reconciliationController.createReconciliation)
);
reconciliationRouter.patch(
  '/:id',
  requireRole('WAITER'),
  validateBody(UpdateReconciliationSchema),
  asyncHandler(reconciliationController.updateReconciliation)
);
reconciliationRouter.post(
  '/:id/submit',
  requireRole('WAITER'),
  asyncHandler(reconciliationController.submitReconciliation)
);

// Review (approve or send back): MANAGER / OWNER only.
reconciliationRouter.post(
  '/:id/review',
  requireRole('MANAGER', 'OWNER'),
  validateBody(ReviewReconciliationSchema),
  asyncHandler(reconciliationController.reviewReconciliation)
);
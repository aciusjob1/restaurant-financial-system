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
// Receivers for the WAITER kiosk "create handover" dropdown.
// Reduced projection (id/fullName/role only), active MANAGER/OWNER only.
// Must come before /:id so it isn't swallowed by the wildcard route.
handoverRouter.get(
  '/receivable-users',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  asyncHandler(handoverController.listReceivableUsers)
);

handoverRouter.get('/:id', asyncHandler(handoverController.getHandover));

// Create: WAITER (own reconciliation) or MANAGER/OWNER (on behalf of a
// waiter via onBehalfOfUserId). AUDITOR excluded.
handoverRouter.post(
  '/',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
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
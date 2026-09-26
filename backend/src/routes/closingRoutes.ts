import { Router } from 'express';
import * as closingController from '../controllers/closingController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateDailyClosingSchema,
  ReopenDailyClosingSchema,
} from '../validators/closing.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const closingRouter = Router();

closingRouter.use(requireAuth);

// Read: OWNER, MANAGER, AUDITOR
closingRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(closingController.listClosings)
);
closingRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(closingController.getClosing)
);

// Create: OWNER, MANAGER
closingRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreateDailyClosingSchema),
  asyncHandler(closingController.createClosing)
);

// Reopen: OWNER only
closingRouter.post(
  '/:id/reopen',
  requireRole('OWNER'),
  validateBody(ReopenDailyClosingSchema),
  asyncHandler(closingController.reopenClosing)
);
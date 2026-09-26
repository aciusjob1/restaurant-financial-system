import { Router } from 'express';
import * as positionController from '../controllers/positionController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { CreatePositionSchema, UpdatePositionSchema } from '../validators/employee.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const positionRouter = Router();

positionRouter.use(requireAuth);

// Read: OWNER, MANAGER, AUDITOR
positionRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(positionController.listPositions)
);
positionRouter.get(
  '/:id',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(positionController.getPosition)
);

// Write: OWNER, MANAGER only
positionRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(CreatePositionSchema),
  asyncHandler(positionController.createPosition)
);
positionRouter.patch(
  '/:id',
  requireRole('OWNER', 'MANAGER'),
  validateBody(UpdatePositionSchema),
  asyncHandler(positionController.updatePosition)
);
import { Router } from 'express';
import * as settingsController from '../controllers/settingsController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { UpdateSettingsSchema } from '../validators/settings.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(settingsController.listSettings)
);

settingsRouter.patch(
  '/',
  requireRole('OWNER'),
  validateBody(UpdateSettingsSchema),
  asyncHandler(settingsController.updateSettings)
);

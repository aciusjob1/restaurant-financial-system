import { Router } from 'express';
import * as backupController from '../controllers/backupController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const backupRouter = Router();
backupRouter.use(requireAuth);

backupRouter.get(
  '/',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(backupController.listBackups)
);

backupRouter.post(
  '/',
  requireRole('OWNER'),
  asyncHandler(backupController.createBackup)
);

backupRouter.get(
  '/destinations',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(backupController.listDestinations)
);

backupRouter.post(
  '/destination',
  requireRole('OWNER'),
  asyncHandler(backupController.setDestination)
);

backupRouter.get(
  '/schedule',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(backupController.getSchedule)
);

backupRouter.post(
  '/schedule',
  requireRole('OWNER'),
  asyncHandler(backupController.updateSchedule)
);

backupRouter.get(
  '/:filename/download',
  requireRole('OWNER', 'MANAGER', 'AUDITOR'),
  asyncHandler(backupController.downloadBackup)
);

backupRouter.post(
  '/:filename/restore',
  requireRole('OWNER'),
  asyncHandler(backupController.restoreBackup)
);

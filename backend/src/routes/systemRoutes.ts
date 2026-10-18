import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { systemAccess } from '../controllers/systemController.js';

export const systemRouter = Router();

// Owner/Manager only. Read-only. Returns network-address metadata only.
systemRouter.get(
  '/access',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  systemAccess
);
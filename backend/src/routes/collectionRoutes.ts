import { Router } from 'express';
import * as collectionController from '../controllers/collectionController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateCollectionSchema,
  UpdateCollectionSchema,
  VoidCollectionSchema,
} from '../validators/collection.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const collectionRouter = Router();

collectionRouter.use(requireAuth);

// Read: all authenticated roles (WAITER filtered to own in service).
collectionRouter.get('/', asyncHandler(collectionController.listCollections));
collectionRouter.get('/:id', asyncHandler(collectionController.getCollection));

// Create: WAITER (own shift) or MANAGER/OWNER (on behalf of a waiter via
// onBehalfOfUserId). AUDITOR excluded.
collectionRouter.post(
  '/',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  validateBody(CreateCollectionSchema),
  asyncHandler(collectionController.createCollection)
);

// Edit: WAITER only (their own, shift must be OPEN).
collectionRouter.patch(
  '/:id',
  requireRole('WAITER'),
  validateBody(UpdateCollectionSchema),
  asyncHandler(collectionController.updateCollection)
);

// Void: WAITER (own) or MANAGER/OWNER (any), shift must be OPEN.
collectionRouter.post(
  '/:id/void',
  requireRole('WAITER', 'MANAGER', 'OWNER'),
  validateBody(VoidCollectionSchema),
  asyncHandler(collectionController.voidCollection)
);
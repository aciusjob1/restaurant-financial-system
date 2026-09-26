import type { Request, Response } from 'express';
import * as collectionService from '../services/collectionService.js';
import { ApiError } from '../errors/ApiError.js';
import {
  ListCollectionsQuerySchema,
  type CreateCollectionInput,
  type UpdateCollectionInput,
  type VoidCollectionInput,
  type ListCollectionsQuery,
} from '../validators/collection.js';
import type { PaymentMethod } from '@prisma/client';

export async function listCollections(req: Request, res: Response) {
  const parsed = ListCollectionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
  }
  const q: ListCollectionsQuery = parsed.data;
  const collections = await collectionService.listCollections({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: q.shiftId,
    userId: q.userId,
    includeVoided: q.includeVoided,
  });
  res.json({ success: true, collections });
}

export async function getCollection(req: Request, res: Response) {
  const collection = await collectionService.getCollectionById(req.params.id, {
    id: req.user!.id,
    role: req.user!.role,
  });
  res.json({ success: true, collection });
}

export async function createCollection(req: Request, res: Response) {
  const input = req.body as CreateCollectionInput;
  const collection = await collectionService.createCollection({
    actor: { id: req.user!.id, role: req.user!.role },
    shiftId: input.shiftId,
    paymentMethod: input.paymentMethod as PaymentMethod,
    amount: input.amount,
    mobileReference: input.mobileReference ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json({ success: true, collection });
}

export async function updateCollection(req: Request, res: Response) {
  const input = req.body as UpdateCollectionInput;
  const collection = await collectionService.updateCollection({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    amount: input.amount,
    mobileReference: input.mobileReference,
    notes: input.notes,
  });
  res.json({ success: true, collection });
}

export async function voidCollection(req: Request, res: Response) {
  const input = req.body as VoidCollectionInput;
  const collection = await collectionService.voidCollection({
    id: req.params.id,
    actor: { id: req.user!.id, role: req.user!.role },
    reason: input.reason,
  });
  res.json({ success: true, collection });
}
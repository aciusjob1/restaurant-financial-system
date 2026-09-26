import type { Request, Response } from 'express';
import * as positionService from '../services/positionService.js';
import type { CreatePositionInput, UpdatePositionInput } from '../validators/employee.js';

export async function listPositions(_req: Request, res: Response) {
  const positions = await positionService.listPositions();
  res.json({ success: true, positions });
}

export async function getPosition(req: Request, res: Response) {
  const position = await positionService.getPositionById(req.params.id!);
  res.json({ success: true, position });
}

export async function createPosition(req: Request, res: Response) {
  const input = req.body as CreatePositionInput;
  const position = await positionService.createPosition({
    name: input.name,
    description: input.description ?? null,
    defaultSalary: input.defaultSalary,
  });
  res.status(201).json({ success: true, position });
}

export async function updatePosition(req: Request, res: Response) {
  const input = req.body as UpdatePositionInput;
  const position = await positionService.updatePosition(req.params.id!, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.defaultSalary !== undefined ? { defaultSalary: input.defaultSalary } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
  res.json({ success: true, position });
}
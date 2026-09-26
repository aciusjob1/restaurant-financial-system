import type { Request, Response } from 'express';
import * as userService from '../services/userService.js';
import { ApiError } from '../errors/ApiError.js';
import type { CreateUserInput, UpdateUserInput } from '../validators/user.js';

export async function listUsers(_req: Request, res: Response) {
  const users = await userService.listUsers();
  res.json({ success: true, users });
}

export async function getUser(req: Request, res: Response) {
  const user = await userService.getUserById(req.params.id);
  res.json({ success: true, user });
}

export async function createUser(req: Request, res: Response) {
  const input = req.body as CreateUserInput;
  const user = await userService.createUser({
    username: input.username,
    fullName: input.fullName,
    phone: input.phone ?? null,
    role: input.role,
    password: input.password,
  });
  res.status(201).json({ success: true, user });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const input = req.body as UpdateUserInput;

  // Guardrails: an OWNER cannot lock themselves out.
  if (req.user!.id === id) {
    if (input.isActive === false) {
      throw new ApiError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account.');
    }
    if (input.role !== undefined && input.role !== 'OWNER') {
      throw new ApiError(
        400,
        'SELF_DEMOTE',
        'You cannot change your own role away from OWNER.'
      );
    }
  }

  const user = await userService.updateUser(id, input);
  res.json({ success: true, user });
}
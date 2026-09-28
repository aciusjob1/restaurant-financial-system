import type { Request, Response } from 'express';
import * as userService from '../services/userService.js';
import { ApiError } from '../errors/ApiError.js';
import type { CreateUserInput, UpdateUserInput, ResetPasswordInput } from '../validators/user.js';

export async function listUsers(_req: Request, res: Response) {
  const users = await userService.listUsers();
  res.json({ success: true, users });
}

export async function getUser(req: Request, res: Response) {
  const user = await userService.getUserById(req.params.id!);
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
  const id = req.params.id!;
  const input = req.body as UpdateUserInput;
  const actor = req.user!;
  const isSelf = actor.id === id;

  // Load target for role-aware guards. Throws 404 if missing.
  const target = await userService.getUserById(id);

  if (actor.role === 'MANAGER') {
    if (input.role !== undefined) {
      throw new ApiError(403, 'MANAGER_CANNOT_CHANGE_ROLE', 'Managers cannot change roles.');
    }
    if (input.isActive !== undefined) {
      throw new ApiError(403, 'MANAGER_CANNOT_CHANGE_STATUS', 'Managers cannot change account status.');
    }
    if (!isSelf && target.role !== 'WAITER') {
      throw new ApiError(403, 'MANAGER_CAN_ONLY_EDIT_WAITERS', 'Managers can only edit waiter profiles.');
    }
  }

  // Self-guards: no one can deactivate themselves or change their own role.
  if (isSelf) {
    if (input.isActive === false) {
      throw new ApiError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account.');
    }
    if (input.role !== undefined && input.role !== actor.role) {
      throw new ApiError(400, 'SELF_DEMOTE', 'You cannot change your own role.');
    }
  }

  const user = await userService.updateUser(id, input);
  res.json({ success: true, user });
}

export async function resetPassword(req: Request, res: Response) {
  const id = req.params.id!;
  const input = req.body as ResetPasswordInput;
  const actor = req.user!;

  if (actor.id === id) {
    throw new ApiError(400, 'SELF_RESET', 'Use the account page to change your own password.');
  }

  const target = await userService.getUserById(id);

  if (actor.role === 'MANAGER' && target.role !== 'WAITER') {
    throw new ApiError(403, 'MANAGER_CAN_ONLY_RESET_WAITERS', 'Managers can only reset waiter passwords.');
  }

  await userService.resetPassword(id, input.newPassword);
  res.json({ success: true });
}

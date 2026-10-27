import type { Request, Response } from 'express';
import * as employeeService from '../services/employeeService.js';
import { ApiError } from '../errors/ApiError.js';
import type { CreateEmployeeInput, UpdateEmployeeInput } from '../validators/employee.js';
import type { Role } from '@prisma/client';

export async function listEmployees(_req: Request, res: Response) {
  const employees = await employeeService.listEmployees();
  res.json({ success: true, employees });
}

export async function getEmployee(req: Request, res: Response) {
  const employee = await employeeService.getEmployeeById(req.params.id!);
  res.json({ success: true, employee });
}

export async function createEmployee(req: Request, res: Response) {
  const input = req.body as CreateEmployeeInput;
  const employee = await employeeService.createEmployee({
    fullName: input.fullName,
    phone: input.phone ?? null,
    positionId: input.positionId,
    userId: input.userId ?? null,
    startDate: input.startDate,
    notes: input.notes ?? null,
    login: input.login ?? null,
    actorRole: req.user!.role as Role,
  });
  res.status(201).json({ success: true, employee });
}

export async function deactivateEmployee(req: Request, res: Response) {
  const employee = await employeeService.deactivateEmployee(req.params.id!, req.user!.role as Role);
  res.json({ success: true, employee });
}

export async function updateEmployee(req: Request, res: Response) {
  const input = req.body as UpdateEmployeeInput;
  const employee = await employeeService.updateEmployee(req.params.id!, input);
  res.json({ success: true, employee });
}

/**
 * Minimal active-employee list for the kiosk salary picker.
 * Gated at the route to WAITER | MANAGER | OWNER.
 * MANAGER/OWNER may pass ?userId=<waiter> when operating the kiosk on
 * that waiter's behalf; everyone else is always scoped to themselves.
 */
export async function listEmployeesForKiosk(req: Request, res: Response) {
  const requested = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  let targetUserId = req.user!.id;
  if (requested && requested !== targetUserId) {
    const role = req.user!.role as Role;
    if (role !== 'OWNER' && role !== 'MANAGER') {
      throw new ApiError(403, 'FORBIDDEN', 'You can only view your own kiosk employee record.');
    }
    targetUserId = requested;
  }
  const employees = await employeeService.listEmployeesForKiosk(targetUserId);
  res.json({ success: true, employees });
}

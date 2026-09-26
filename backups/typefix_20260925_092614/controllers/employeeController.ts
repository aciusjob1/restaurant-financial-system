import type { Request, Response } from 'express';
import * as employeeService from '../services/employeeService.js';
import type { CreateEmployeeInput, UpdateEmployeeInput } from '../validators/employee.js';

export async function listEmployees(_req: Request, res: Response) {
  const employees = await employeeService.listEmployees();
  res.json({ success: true, employees });
}

export async function getEmployee(req: Request, res: Response) {
  const employee = await employeeService.getEmployeeById(req.params.id);
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
  });
  res.status(201).json({ success: true, employee });
}

export async function updateEmployee(req: Request, res: Response) {
  const input = req.body as UpdateEmployeeInput;
  const employee = await employeeService.updateEmployee(req.params.id, input);
  res.json({ success: true, employee });
}
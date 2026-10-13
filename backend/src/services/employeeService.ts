import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { hashPassword } from '../lib/password.js';
import type { Prisma, Role } from '@prisma/client';

function toDateOnly(d: Date): string {
  // Prisma returns @db.Date as a Date at UTC midnight; slice to YYYY-MM-DD.
  return d.toISOString().slice(0, 10);
}

function serializeEmployee(e: {
  id: string;
  employeeNumber: string;
  fullName: string;
  phone: string | null;
  positionId: string;
  userId: string | null;
  employmentStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    fullName: e.fullName,
    phone: e.phone,
    positionId: e.positionId,
    userId: e.userId,
    employmentStatus: e.employmentStatus,
    startDate: toDateOnly(e.startDate),
    endDate: e.endDate ? toDateOnly(e.endDate) : null,
    notes: e.notes,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

async function nextEmployeeNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Uses the sequence created in prisma/sql/sequences.sql.
  const rows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    "SELECT nextval('employee_number_seq') AS nextval"
  );
  const n = rows[0]?.nextval ?? 1n;
  return `EMP-${n.toString().padStart(4, '0')}`;
}

export async function listEmployees() {
  const rows = await prisma.employee.findMany({
    orderBy: { employeeNumber: 'asc' },
  });
  return rows.map(serializeEmployee);
}

/**
 * Minimal active-employee list for the kiosk salary picker.
 * Only returns fields a waiter needs: identity and number. No salary,
 * position, phone, or notes.
 */
export async function listEmployeesForKiosk(userId: string) {
  // Returns only the calling user's own active Employee record, or [].
  // Employee.userId is @unique, so this returns at most one row.
  const rows = await prisma.employee.findMany({
    where: { userId, isActive: true },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      isActive: true,
    },
  });
  return rows;
}

export async function getEmployeeById(id: string) {
  const row = await prisma.employee.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Employee not found.');
  return serializeEmployee(row);
}

export async function createEmployee(input: {
  fullName: string;
  phone?: string | null;
  positionId: string;
  userId?: string | null;
  startDate: string;
  notes?: string | null;
  login?: { username: string; password: string; role: 'WAITER' | 'MANAGER' } | null;
  actorRole: Role;
}) {
  const position = await prisma.position.findUnique({ where: { id: input.positionId } });
  if (!position) throw new ApiError(400, 'INVALID_POSITION', 'Position does not exist.');
  if (!position.isActive) {
    throw new ApiError(400, 'POSITION_INACTIVE', 'Position is not active.');
  }

  if (input.userId && input.login) {
    throw new ApiError(400, 'LOGIN_AND_USER_ID_CONFLICT', 'Provide either userId or login, not both.');
  }

  if (input.login && input.actorRole !== 'OWNER') {
    throw new ApiError(403, 'LOGIN_REQUIRES_OWNER', 'Only OWNER can create login accounts.');
  }

  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new ApiError(400, 'INVALID_USER', 'User does not exist.');
    const linked = await prisma.employee.findUnique({ where: { userId: input.userId } });
    if (linked) {
      throw new ApiError(409, 'USER_ALREADY_LINKED', 'That user is already linked to an employee.');
    }
  }

  if (input.login) {
    const existing = await prisma.user.findUnique({ where: { username: input.login.username } });
    if (existing) throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already in use.');
  }

  const row = await prisma.$transaction(async (tx) => {
    let linkedUserId = input.userId ?? null;

    if (input.login) {
      const passwordHash = await hashPassword(input.login.password);
      const user = await tx.user.create({
        data: {
          username: input.login.username,
          fullName: input.fullName,
          phone: input.phone ?? null,
          role: input.login.role,
          passwordHash,
          isActive: true,
        },
      });
      linkedUserId = user.id;
    }

    const employeeNumber = await nextEmployeeNumber(tx);
    return tx.employee.create({
      data: {
        employeeNumber,
        fullName: input.fullName,
        phone: input.phone ?? null,
        positionId: input.positionId,
        userId: linkedUserId,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
        notes: input.notes ?? null,
      },
    });
  });

  return serializeEmployee(row);
}

export async function updateEmployee(
  id: string,
  input: {
    fullName?: string;
    phone?: string | null;
    positionId?: string;
    userId?: string | null;
    employmentStatus?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
    startDate?: string;
    endDate?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
) {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Employee not found.');

  if (input.positionId !== undefined) {
    const position = await prisma.position.findUnique({ where: { id: input.positionId } });
    if (!position) throw new ApiError(400, 'INVALID_POSITION', 'Position does not exist.');
  }

  if (input.userId !== undefined && input.userId !== null) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new ApiError(400, 'INVALID_USER', 'User does not exist.');
    const linked = await prisma.employee.findUnique({ where: { userId: input.userId } });
    if (linked && linked.id !== id) {
      throw new ApiError(409, 'USER_ALREADY_LINKED', 'That user is already linked to an employee.');
    }
  }

  const row = await prisma.employee.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.positionId !== undefined ? { positionId: input.positionId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.employmentStatus !== undefined
        ? { employmentStatus: input.employmentStatus }
        : {}),
      ...(input.startDate !== undefined
        ? { startDate: new Date(`${input.startDate}T00:00:00.000Z`) }
        : {}),
      ...(input.endDate !== undefined
        ? { endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serializeEmployee(row);
}

export async function deactivateEmployee(id: string, actorRole: Role) {
  if (actorRole !== 'OWNER') {
    throw new ApiError(403, 'DEACTIVATE_REQUIRES_OWNER', 'Only OWNER can deactivate staff.');
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Employee not found.');

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id },
      data: { isActive: false },
    });

    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      });
      await tx.session.deleteMany({ where: { userId: existing.userId } });
    }

    return updated;
  });

  return serializeEmployee(row);
}

import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { ApiError } from '../errors/ApiError.js';
import type { Role } from '@prisma/client';

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  language: true,
  lastLogin: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: PUBLIC_USER_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: PUBLIC_USER_SELECT,
  });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  return user;
}

export async function createUser(params: {
  username: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  password: string;
  language?: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { username: params.username } });
  if (existing) throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already in use.');

  const passwordHash = await hashPassword(params.password);

  return prisma.user.create({
    data: {
      username: params.username,
      fullName: params.fullName,
      phone: params.phone ?? null,
      role: params.role,
      language: params.language ?? null,
      passwordHash,
      isActive: true,
    },
    select: PUBLIC_USER_SELECT,
  });
}

export async function updateUser(
  id: string,
  input: {
    fullName?: string;
    phone?: string | null;
    isActive?: boolean;
    role?: Role;
    language?: string | null;
  }
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
      },
      select: PUBLIC_USER_SELECT,
    });

    // Deactivation must revoke every active session atomically.
    if (input.isActive === false) {
      await tx.session.deleteMany({ where: { userId: id } });
    }

    return user;
  });
}


export async function resetPassword(id: string, newPassword: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
}

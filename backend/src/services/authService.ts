import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { ApiError } from '../errors/ApiError.js';

// A real Argon2id hash, computed once at module load. Used only when the
// username doesn't exist, so the code path runs the same Argon2 verify
// (and therefore takes the same time) regardless of whether the user exists.
// This is what closes the user-enumeration timing side-channel.
const DUMMY_PASSWORD = 'this-is-not-a-real-password-4f8a1c9b';
let DUMMY_HASH: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH) {
    DUMMY_HASH = await hashPassword(DUMMY_PASSWORD);
  }
  return DUMMY_HASH;
}

export async function authenticateUser(params: { username: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { username: params.username } });
  const hash = user?.passwordHash ?? (await getDummyHash());
  const ok = await verifyPassword(hash, params.password);

  if (!user || !ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'Account is disabled.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  return user;
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

  const ok = await verifyPassword(user.passwordHash, params.currentPassword);
  if (!ok) throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');

  const passwordHash = await hashPassword(params.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return true;
}

export async function updateMyProfile(
  userId: string,
  input: { fullName?: string; phone?: string | null; language?: string | null }
) {
  const data: { fullName?: string; phone?: string | null; language?: string | null } = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.language !== undefined) data.language = input.language;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      fullName: true,
      phone: true,
      language: true,
      role: true,
      isActive: true,
    },
  });
  return user;
}

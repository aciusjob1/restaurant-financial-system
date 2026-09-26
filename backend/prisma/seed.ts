import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_OWNER_USERNAME?.trim();
  const password = process.env.SEED_OWNER_PASSWORD;
  const fullName = process.env.SEED_OWNER_FULLNAME?.trim() ?? 'System Owner';
  const phone = process.env.SEED_OWNER_PHONE?.trim() || null;

  if (!username || !password) {
    throw new Error('SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD must be set.');
  }
  if (password.length < 12) {
    throw new Error('SEED_OWNER_PASSWORD must be at least 12 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`[seed] Owner user "${username}" already exists - skipping.`);
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: { username, fullName, phone, passwordHash, role: Role.OWNER, isActive: true },
  });

  console.log(`[seed] Created OWNER user: ${user.username} (${user.id})`);
}

main()
  .catch((err) => { console.error('[seed] Failed:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
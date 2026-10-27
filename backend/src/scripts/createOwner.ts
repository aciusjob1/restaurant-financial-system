import { prisma } from '../lib/prisma.js';
import argon2 from 'argon2';

async function main(): Promise<void> {
  const username = process.env.OWNER_USER;
  const password = process.env.OWNER_PW;
  if (!username || !password) {
    throw new Error('OWNER_USER and OWNER_PW are required');
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      fullName: 'Owner',
      passwordHash: hash,
      role: 'OWNER',
      isActive: true,
    },
  });
  await prisma.$disconnect();
  console.log('owner created');
}

main().catch((err) => {
  console.error('Failed to create owner:', err);
  process.exit(1);
});
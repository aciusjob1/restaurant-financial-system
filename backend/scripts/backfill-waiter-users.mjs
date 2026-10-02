// One-shot: link every active waiter Employee that has no User to a fresh User.
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function deriveUsername(fullName) {
  return String(fullName)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]+/g, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join('.');
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const candidates = await prisma.employee.findMany({
    where: {
      isActive: true,
      userId: null,
      position: { name: { contains: 'Waiter' } },
    },
    include: { position: true },
    orderBy: { employeeNumber: 'asc' },
  });

  console.log('Candidates (active, position contains Waiter, no User linked): ' + candidates.length);
  for (const e of candidates) {
    console.log('  ' + e.employeeNumber + ' | ' + e.fullName + ' | position=' + e.position.name);
  }
  console.log('');

  if (candidates.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const derived = candidates.map((e) => ({ emp: e, username: deriveUsername(e.fullName) }));

  const seen = new Map();
  for (const d of derived) {
    if (!d.username) throw new Error('Cannot derive username for ' + d.emp.fullName);
    if (seen.has(d.username)) {
      throw new Error('Username collision inside candidates: ' + d.username);
    }
    seen.set(d.username, d.emp);
  }

  const existing = await prisma.user.findMany({
    where: { username: { in: derived.map((d) => d.username) } },
    select: { username: true },
  });
  if (existing.length > 0) {
    console.log('COLLISION: these usernames already exist in User table:');
    for (const u of existing) console.log('  ' + u.username);
    throw new Error('Refusing to run. Resolve the collisions, then re-run.');
  }
  console.log('No username collisions. Proceeding.');
  console.log('');

  const created = [];
  for (const d of derived) {
    const password = randomPassword();
    const passwordHash = await argon2.hash(password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: d.username,
          fullName: d.emp.fullName,
          phone: d.emp.phone ?? null,
          role: 'WAITER',
          passwordHash,
          isActive: true,
        },
      });
      await tx.employee.update({
        where: { id: d.emp.id },
        data: { userId: user.id },
      });
      return user;
    });

    created.push({ employeeNumber: d.emp.employeeNumber, fullName: d.emp.fullName, username: result.username, password });
    console.log('  created: ' + d.emp.employeeNumber + ' -> user ' + result.username);
  }

  console.log('');
  console.log('================= TEMPORARY CREDENTIALS =================');
  console.log('Write these down. They are printed once and never again.');
  console.log('========================================================');
  for (const c of created) {
    console.log('  ' + c.employeeNumber + ' | ' + c.fullName);
    console.log('     username: ' + c.username);
    console.log('     password: ' + c.password);
    console.log('');
  }
  console.log('Done. ' + created.length + ' User account(s) created and linked.');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error('FAILED:', err.message); await prisma.$disconnect(); process.exit(1); });

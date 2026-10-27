import pkg from '@prisma/client';
const { PrismaClient } = pkg;

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
});
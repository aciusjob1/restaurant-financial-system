import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

beforeAll(async () => { await prisma.$queryRaw`SELECT 1`; });
afterAll(async () => { await prisma.$disconnect(); });
// Runs every *.sql file in backend/prisma/sql/ against DATABASE_URL.
// Idempotent because every script uses IF NOT EXISTS.
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(__dirname, '..', 'prisma', 'sql');

const prisma = new PrismaClient();

async function main() {
  const files = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('[raw-sql] No .sql files to apply.');
    return;
  }

  for (const f of files) {
    const body = readFileSync(join(sqlDir, f), 'utf8');
    const statements = body
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        console.log(`[raw-sql] ${f}: OK`);
      } catch (err) {
        console.error(`[raw-sql] ${f}: FAILED`);
        console.error(err);
        process.exit(1);
      }
    }
  }
  console.log('[raw-sql] All raw SQL applied.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
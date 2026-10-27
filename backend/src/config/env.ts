import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // The API is reached through the Next.js proxy on the same machine.
  // Keep it off the LAN unless a deployment explicitly opts in.
  API_HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_COOKIE_NAME: z.string().min(1).default('rfs_session'),
  // Secure cookie flag — set COOKIE_SECURE=true only when serving over HTTPS.
  // NODE_ENV=production does not imply HTTPS; LAN deployments run over plain HTTP.
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  PIN_LOOKUP_SECRET: z.string().min(32, 'PIN_LOOKUP_SECRET must be at least 32 chars'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ATTACHMENTS_ROOT: z.string().min(1).default('./storage/attachments'),
  BACKUP_LOCAL_PATH: z.string().min(1).default('./storage/backups'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
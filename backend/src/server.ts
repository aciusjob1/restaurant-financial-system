import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import * as schedulerService from './services/schedulerService.js';

async function main() {
  const app = createApp();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[rfs] Backend listening on http://localhost:${env.PORT}`);
  });

  void schedulerService.start().catch((e) => {
    console.error('[rfs] scheduler failed to start:', e);
  });

  const shutdown = async (signal: string) => {
    console.log(`[rfs] Received ${signal}. Shutting down...`);
    await schedulerService.stop();
    server.close(() => {});
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[rfs] Fatal startup error:', err);
  process.exit(1);
});

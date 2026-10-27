import { prisma } from '../src/lib/prisma.js';
import { syncDocumentSequences } from '../src/utils/documentNumber.js';

export default async function () {
  await syncDocumentSequences(prisma);
  await prisma.$disconnect();
}

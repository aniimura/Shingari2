import { PrismaClient } from '@prisma/client';

let prismaSingleton: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      log: process.env.PRISMA_LOG === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return prismaSingleton;
}

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

import { PrismaClient } from '@prisma/client';
// Forced reload to pick up new Prisma Client schema definitions
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient; pool: Pool };

let prisma: PrismaClient;

const connectionString = process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'production') {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  if (!globalForPrisma.prisma) {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  prisma = globalForPrisma.prisma;
}

export const db = prisma;
export const pool = globalForPrisma.pool;

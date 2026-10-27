// EXPLICIT LOCAL CONFIGURATION. Never selected by normal builds or deployments.
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { requireRunner } from './guard';

const profile = requireRunner();
export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  migrations: { path: path.resolve('.local/snipers/phase1-migrations') },
  datasource: { url: profile.DATABASE_URL },
});

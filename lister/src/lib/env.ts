import { z } from "zod";

/** MongoDB pentru Prisma. */
const database = z.object({
  DATABASE_URL: z.string().min(1),
});

const serverExtras = z.object({
  DEFAULT_ADMIN_EMAIL: z.string().email().optional(),
});

/** Validare MongoDB + configurări aplicație (route handlers Prisma etc.). */
export function getDbServerEnv() {
  return database.merge(serverExtras).parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL,
  });
}

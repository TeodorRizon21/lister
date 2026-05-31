import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function assertDatabaseEnv(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  throw new Error(
    "Lipsește `DATABASE_URL`. Adaugă în `.env` connection string-ul MongoDB " +
      "(ex. MongoDB Atlas: Connect → Drivers → URI). Vezi `SETUP.md` și `.env.example`.",
  );
}

function assertMongoUrlParses(raw: string): void {
  try {
    const url = new URL(raw);
    const ok =
      url.protocol === "mongodb:" || url.protocol === "mongodb+srv:";
    if (!ok || !url.hostname) throw new Error("invalid");
  } catch {
    throw new Error(
      "DATABASE_URL nu e un URL MongoDB valid (mongodb:// sau mongodb+srv://). " +
        "Dacă parola conține caractere speciale, codifică-le în URL (encodeURIComponent). " +
        "Pe Windows, variabilele de mediu la nivel de sistem pot suprascrie `.env` — verifică și repornește `npm run dev`.",
    );
  }
}

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    assertDatabaseEnv();
    assertMongoUrlParses(process.env.DATABASE_URL!.trim());
    return new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  })();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

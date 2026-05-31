import { prisma } from "@/lib/prisma";

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "eveniment";
}

export async function createUniqueEventSlug(title: string): Promise<string> {
  const base = slugifyTitle(title);
  let candidate = base;
  let n = 0;
  while (await prisma.event.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export function registrationPath(slug: string): string {
  return `/e/${slug}`;
}

/**
 * Rulează o dată: npm run db:backfill-slugs
 * Completează slug pentru evenimente vechi (slug null în MongoDB).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugifyTitle(title) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "eveniment";
}

async function slugExists(slug) {
  const raw = await prisma.$runCommandRaw({
    find: "Event",
    filter: { slug },
    limit: 1,
  });
  return (raw.cursor?.firstBatch?.length ?? 0) > 0;
}

async function createUniqueSlug(title) {
  const base = slugifyTitle(title);
  let candidate = base;
  let n = 0;
  while (await slugExists(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

async function main() {
  const raw = await prisma.$runCommandRaw({
    find: "Event",
    filter: { $or: [{ slug: null }, { slug: { $exists: false } }] },
  });
  const batch = raw.cursor?.firstBatch ?? [];
  console.log(`Evenimente fără slug: ${batch.length}`);

  for (const doc of batch) {
    const id = doc._id?.$oid ?? doc._id;
    const title = doc.title?.trim() || "eveniment";
    const slug = await createUniqueSlug(title);
    await prisma.$runCommandRaw({
      update: "Event",
      updates: [
        {
          q: { _id: { $oid: id } },
          u: { $set: { slug, registrationOpen: true } },
        },
      ],
    });
    console.log(`  ${id} → ${slug}`);
  }

  console.log("Gata.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

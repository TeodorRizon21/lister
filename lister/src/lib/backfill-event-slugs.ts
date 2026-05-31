import { prisma } from "@/lib/prisma";
import { createUniqueEventSlug } from "@/lib/slug";

type MongoOid = { $oid: string };

type RawEventDoc = {
  _id: MongoOid | string;
  title?: string;
  slug?: string | null;
};

function eventIdFromDoc(doc: RawEventDoc): string {
  const id = doc._id;
  if (typeof id === "string") return id;
  return id.$oid;
}

/** Completează slug (și câmpuri implicite) pentru evenimente create înainte de migrare. */
export async function backfillMissingEventSlugs(): Promise<number> {
  const raw = (await prisma.$runCommandRaw({
    find: "Event",
    filter: {
      $or: [{ slug: null }, { slug: { $exists: false } }],
    },
  })) as { cursor?: { firstBatch?: RawEventDoc[] } };

  const batch = raw.cursor?.firstBatch ?? [];
  let updated = 0;

  for (const doc of batch) {
    const id = eventIdFromDoc(doc);
    const title = doc.title?.trim() || "eveniment";
    const slug = await createUniqueEventSlug(title);

    await prisma.$runCommandRaw({
      update: "Event",
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $set: {
              slug,
              registrationOpen: true,
            },
          },
        },
      ],
    });
    updated += 1;
  }

  return updated;
}

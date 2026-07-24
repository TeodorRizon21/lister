/**
 * Import Bal UAUIM — 3 facultăți, mese globale unice.
 *
 *   Interior     → mese 1–5   (din „Lista mese Bal interior”)
 *   Urbanism     → mese 6–11  (încă fără componență)
 *   Arhitectura  → mese 12–32 (din „Jocurile Foamei”: masa locală N → N+11)
 *
 *   node --env-file=.env scripts/import-uauim-bal.mjs --event bal-uauim [--dry-run] [--replace]
 *
 * --replace șterge toți participanții existenți ai evenimentului înainte de import.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const eventRef = arg("event") ?? "bal-uauim";
const dryRun = hasFlag("dry-run");
const replace = hasFlag("replace");
const jsonPath =
  arg("json") ??
  path.join(__dirname, "_tmp-pdf-extract", "uauim-participants.json");

/** Masa locală în PDF-ul JF → masă globală (Arhitectura începe la 12). */
const ARHITECTURA_TABLE_OFFSET = 11;

const prisma = new PrismaClient();

const event =
  (await prisma.event.findUnique({ where: { slug: eventRef } }).catch(() => null)) ??
  (await prisma.event.findUnique({ where: { id: eventRef } }).catch(() => null));
if (!event) {
  console.error(`Eveniment negăsit: ${eventRef}`);
  process.exit(1);
}
console.log(`Eveniment: ${event.title} (${event.id})`);

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function toInterior(p) {
  return {
    firstName: p.firstName || "—",
    lastName: p.lastName,
    email: p.email || null,
    group: "Interior",
    floor: "Interior",
    tableNumber: p.tableNumber,
    busReturn: Boolean(p.busReturn),
    menuType: p.menuType || null,
    teacher: false,
  };
}

function toArhitectura(p) {
  const local = p.tableNumber;
  return {
    firstName: p.firstName || "—",
    lastName: p.lastName,
    email: p.email || null,
    group: "Arhitectura",
    floor: "Arhitectura",
    tableNumber: local + ARHITECTURA_TABLE_OFFSET,
    busReturn: Boolean(p.busReturn),
    menuType: p.menuType || null,
    teacher: false,
    localTable: local,
  };
}

const key = (p) =>
  `${p.firstName}\u0001${p.lastName}\u0001${p.group}`.toLowerCase();

const rows = [...data.interior.map(toInterior), ...data.jocurileFoamei.map(toArhitectura)];

// Dezambiguare nume identice în aceeași facultate
const claimedNames = new Set();
for (const p of rows) {
  let k = key(p);
  if (!claimedNames.has(k)) {
    claimedNames.add(k);
    continue;
  }
  p.group = "";
  k = key(p);
  let n = 2;
  while (claimedNames.has(k)) {
    p.group = String(n);
    k = key(p);
    n += 1;
  }
  claimedNames.add(k);
  console.warn(
    `  Dezambiguare: ${p.lastName} ${p.firstName} (Masa ${p.tableNumber}) → group „${p.group || "(gol)"}”`,
  );
}

if (replace && !dryRun) {
  const del = await prisma.participant.deleteMany({ where: { eventId: event.id } });
  console.log(`Șterși ${del.count} participanți existenți.`);
} else if (replace && dryRun) {
  const n = await prisma.participant.count({ where: { eventId: event.id } });
  console.log(`[dry-run] Ar șterge ${n} participanți.`);
}

const existing = await prisma.participant.findMany({
  where: { eventId: event.id },
  select: { firstName: true, lastName: true, group: true, email: true },
});
const existingKeys = new Set(existing.map(key));
const existingEmails = new Set(
  existing.map((p) => p.email?.toLowerCase()).filter(Boolean),
);

const toInsert = [];
const seen = new Set();
const seenEmails = new Set();
let skippedDup = 0;
let skippedEmail = 0;

for (const p of rows) {
  const k = key(p);
  if (existingKeys.has(k) || seen.has(k)) {
    skippedDup += 1;
    continue;
  }
  if (p.email) {
    const e = p.email.toLowerCase();
    if (existingEmails.has(e) || seenEmails.has(e)) {
      console.warn(`  Email duplicat sărit: ${p.email} (${p.lastName} ${p.firstName})`);
      skippedEmail += 1;
      continue;
    }
    seenEmails.add(e);
  }
  seen.add(k);
  toInsert.push(p);
}

const withEmail = toInsert.filter((p) => p.email);
const noEmail = toInsert.filter((p) => !p.email);

console.log(`\nTotal sursă: ${rows.length} (fără Urbanism — încă fără listă)`);
console.log(`De inserat: ${toInsert.length}`);
console.log(`  cu email: ${withEmail.length}`);
console.log(`  fără email: ${noEmail.length}`);
console.log(`  sărite duplicate: ${skippedDup}, email: ${skippedEmail}`);

const byFaculty = new Map();
const byTable = new Map();
for (const p of toInsert) {
  byFaculty.set(p.floor, (byFaculty.get(p.floor) ?? 0) + 1);
  const t = p.tableNumber;
  if (!byTable.has(t)) byTable.set(t, { floor: p.floor, n: 0 });
  byTable.get(t).n += 1;
}
console.log("Pe facultate:", Object.fromEntries(byFaculty));
console.log("Pe masă:");
for (const t of [...byTable.keys()].sort((a, b) => a - b)) {
  const { floor, n } = byTable.get(t);
  console.log(`  Masa ${String(t).padStart(2, "0")} (${floor}): ${n} p`);
}

if (dryRun) {
  console.log("\n[dry-run] Fără scriere. Exemple:");
  for (const p of toInsert.filter((x) => x.floor === "Interior").slice(0, 2)) {
    console.log(`  Interior Masa ${p.tableNumber}: ${p.lastName} ${p.firstName} <${p.email}>`);
  }
  for (const p of toInsert.filter((x) => x.floor === "Arhitectura").slice(0, 2)) {
    console.log(
      `  Arhitectura Masa ${p.tableNumber} (local ${p.localTable}): ${p.lastName} ${p.firstName} <${p.email}>`,
    );
  }
} else {
  const CHUNK = 300;
  let created = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    const res = await prisma.participant.createMany({
      data: slice.map((p) => ({
        eventId: event.id,
        firstName: p.firstName,
        lastName: p.lastName,
        ...(p.email ? { email: p.email } : {}),
        group: p.group,
        tableNumber: p.tableNumber,
        floor: p.floor,
        busReturn: p.busReturn,
        ...(p.menuType ? { menuType: p.menuType } : {}),
        teacher: false,
        qrToken: randomUUID(),
      })),
    });
    created += res.count;
  }

  // Actualizează descrierea evenimentului cu cele 3 facultăți
  const description = [
    "Bal UAUIM — 3 facultăți:",
    "• Interior — mesele 1–5",
    "• Urbanism — mesele 6–11",
    "• Arhitectura — mesele 12–32",
  ].join("\n");
  await prisma.event.update({
    where: { id: event.id },
    data: { description },
  });

  console.log(`\nInserate: ${created} persoane în „${event.title}”.`);
  console.log("Descriere eveniment actualizată (3 facultăți + intervale mese).");
}

await prisma.$disconnect();

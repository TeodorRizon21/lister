/**
 * Import Bal UAUIM din JSON (generat de scripts/_tmp-parse-uauim.py).
 *
 *   node --env-file=.env scripts/import-uauim-bal.mjs --event bal-uauim [--dry-run]
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
const jsonPath =
  arg("json") ??
  path.join(__dirname, "_tmp-pdf-extract", "uauim-participants.json");

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

/**
 * Mesele se suprapun între Interior / Jocurile Foamei / VIP —
 * nu setăm tableNumber/floor; păstrăm doar zona ca grup.
 */
function toRow(p) {
  const teacher = Boolean(p.teacher);
  const group = teacher
    ? p.groupLabel ?? "VIP"
    : p.floor === "Interior"
      ? "Interior"
      : p.floor === "Jocurile Foamei"
        ? "Jocurile Foamei"
        : p.floor ?? "";
  return {
    firstName: p.firstName || "—",
    lastName: p.lastName,
    email: p.email || null,
    group,
    busReturn: Boolean(p.busReturn),
    menuType: p.menuType || null,
    teacher,
  };
}

const key = (p) =>
  `${p.firstName}\u0001${p.lastName}\u0001${p.group}`.toLowerCase();

const rows = [
  ...data.interior.map(toRow),
  ...data.jocurileFoamei.map(toRow),
  ...data.faculty.map(toRow),
];

// Dezambiguare: același nume în același grup (ex. două „Sandu Laura” la Interior)
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

const withEmail = toInsert.filter((p) => p.email && !p.teacher);
const noEmail = toInsert.filter((p) => !p.email);
const teachers = toInsert.filter((p) => p.teacher);

console.log(`\nTotal sursă: ${rows.length}`);
console.log(`De inserat: ${toInsert.length}`);
console.log(`  cu email (QR pe mail): ${withEmail.length}`);
console.log(`  fără email (fără QR pe mail): ${noEmail.length}`);
console.log(`  VIP/facultate (teacher): ${teachers.length}`);
console.log(`  sărite duplicate nume: ${skippedDup}, email: ${skippedEmail}`);

const byGroup = new Map();
for (const p of toInsert) {
  byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + 1);
}
console.log("Pe grup:", Object.fromEntries(byGroup));

if (dryRun) {
  console.log("\n[dry-run] Fără scriere. Exemple:");
  for (const p of withEmail.slice(0, 3)) {
    console.log(`  [${p.group}] ${p.lastName} ${p.firstName} <${p.email}>`);
  }
  for (const p of noEmail.slice(0, 3)) {
    console.log(`  fără email [${p.group}]: ${p.lastName} ${p.firstName}`);
  }
  for (const p of teachers.slice(0, 3)) {
    console.log(`  VIP [${p.group}]: ${p.lastName} ${p.firstName}`);
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
        busReturn: p.busReturn,
        ...(p.menuType ? { menuType: p.menuType } : {}),
        teacher: p.teacher,
        qrToken: randomUUID(),
      })),
    });
    created += res.count;
  }
  console.log(`\nInserate: ${created} persoane în „${event.title}”.`);
}

await prisma.$disconnect();

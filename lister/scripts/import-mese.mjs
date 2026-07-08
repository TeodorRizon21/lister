/**
 * Import "Mese" (așezare la mese) într-un eveniment existent.
 *
 * Format Excel așteptat (o singură foaie):
 *   Etaj | Număr masă | Nume | Prenume | Adresă mail | Tip meniu | Autocar? | Observații
 * Etajul și numărul mesei sunt completate doar pe primul rând al mesei
 * (celule îmbinate) — se propagă în jos.
 *
 * Rulare:
 *   node --env-file=.env scripts/import-mese.mjs --file "../Mese Libao.xlsx" --event <eventId sau slug> [--dry-run]
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const filePath = arg("file");
const eventRef = arg("event");
const dryRun = hasFlag("dry-run");

if (!filePath || !eventRef) {
  console.error(
    'Utilizare: node --env-file=.env scripts/import-mese.mjs --file "<cale.xlsx>" --event <eventId|slug> [--dry-run]',
  );
  process.exit(1);
}

const text = (v) => (v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " "));

/** Repară typo-uri frecvente de TLD; returnează null dacă emailul rămâne invalid. */
function cleanEmail(raw) {
  let email = text(raw).toLowerCase();
  if (!email) return { email: null, fixed: false };
  const before = email;
  email = email.replace(/\.con$/, ".com").replace(/\.comm$/, ".com");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!valid) return { email: null, fixed: false, invalid: before };
  return { email, fixed: email !== before };
}

function parseMenu(raw) {
  const s = text(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s || s === "-") return null;
  if (s.includes("vegetari")) return "vegetarian";
  if (s.includes("porc") && s.includes("vita")) return "no_pork_no_beef";
  if (s.includes("porc")) return "no_pork";
  return "normal";
}

const prisma = new PrismaClient();

const event =
  (await prisma.event.findUnique({ where: { slug: eventRef } }).catch(() => null)) ??
  (await prisma.event.findUnique({ where: { id: eventRef } }).catch(() => null));
if (!event) {
  console.error(`Eveniment negăsit: ${eventRef}`);
  process.exit(1);
}
console.log(`Eveniment: ${event.title} (${event.id})`);

const workbook = XLSX.readFile(path.resolve(filePath));
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

let floor = null;
let table = null;
const people = [];
const warnings = [];

for (let i = 1; i < rows.length; i += 1) {
  const r = rows[i] ?? [];
  const excelRow = i + 1;
  if (text(r[0])) floor = text(r[0]);
  if (r[1] !== null && r[1] !== undefined && text(r[1])) table = Number(r[1]);

  const lastNameRaw = text(r[2]);
  const firstName = text(r[3]);
  const { email, fixed, invalid } = cleanEmail(r[4]);

  // Rând gol sau doar artefact de celule îmbinate (ex. „33” fără prenume/email).
  if (!firstName && !email) {
    if (lastNameRaw && !/^\d+$/.test(lastNameRaw)) {
      warnings.push(`Rând ${excelRow}: are doar nume („${lastNameRaw}”) — sărit.`);
    }
    continue;
  }

  // Numele de familie pierdut (celulă îmbinată peste coloana Nume) apare ca număr.
  const lastName = /^\d+$/.test(lastNameRaw) ? "" : lastNameRaw;
  if (!lastName) warnings.push(`Rând ${excelRow}: fără nume de familie (${firstName}, ${email ?? "fără email"}).`);
  if (fixed) warnings.push(`Rând ${excelRow}: email corectat → ${email}`);
  if (invalid) warnings.push(`Rând ${excelRow}: email invalid ignorat („${invalid}”).`);

  people.push({
    excelRow,
    firstName: firstName || lastName,
    lastName,
    email,
    floor,
    tableNumber: table,
    group: table ? `Masa ${String(table).padStart(2, "0")}` : "",
    menuType: parseMenu(r[5]),
    busReturn: r[6] === true || text(r[6]).toLowerCase() === "true" || text(r[6]).toLowerCase() === "da",
    teacher: masa === 51,
  });
}

console.log(`\nRânduri de persoane găsite: ${people.length}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);

// Idempotent: sar peste persoanele deja existente (nume + prenume + masă).
const existing = await prisma.participant.findMany({
  where: { eventId: event.id },
  select: { firstName: true, lastName: true, group: true },
});
const key = (p) => `${p.firstName}\u0001${p.lastName}\u0001${p.group}`.toLowerCase();
const existingKeys = new Set(existing.map(key));

const seen = new Set();
const toInsert = [];
let skipped = 0;
for (const p of people) {
  const k = key(p);
  if (existingKeys.has(k) || seen.has(k)) {
    skipped += 1;
    continue;
  }
  seen.add(k);
  toInsert.push(p);
}

console.log(`De inserat: ${toInsert.length} (sărite ca duplicate: ${skipped})`);

const stats = toInsert.reduce((acc, p) => {
  acc.menus[p.menuType ?? "necunoscut"] = (acc.menus[p.menuType ?? "necunoscut"] ?? 0) + 1;
  if (!p.email) acc.noEmail += 1;
  acc.tables.add(`${p.floor}/${p.tableNumber}`);
  return acc;
}, { menus: {}, noEmail: 0, tables: new Set() });
console.log(`Mese: ${stats.tables.size} | Fără email: ${stats.noEmail} | Meniuri: ${JSON.stringify(stats.menus)}`);

if (dryRun) {
  console.log("\n[dry-run] Nu am scris nimic în baza de date.");
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
        floor: p.floor,
        tableNumber: p.tableNumber,
        busReturn: p.busReturn,
        teacher: p.teacher,
        ...(p.menuType ? { menuType: p.menuType } : {}),
        qrToken: randomUUID(),
      })),
    });
    created += res.count;
  }
  console.log(`\nInserate: ${created} persoane în „${event.title}”.`);
}

await prisma.$disconnect();

/**
 * Generează Excel cu meniurile speciale — Bal Automatica.
 * Rulare: node --env-file=.env scripts/export-meniuri-speciale.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const p = new PrismaClient();
const eventId = "6a4adf88408edddf43b6f833";

const LABELS = {
  vegetarian: "Vegetarian",
  no_pork: "Fără porc",
  no_pork_no_beef: "Fără porc și vită",
};

const event = await p.event.findUnique({
  where: { id: eventId },
  select: { title: true },
});
if (!event) throw new Error("Eveniment negăsit.");

const special = await p.participant.findMany({
  where: {
    eventId,
    menuType: { in: ["vegetarian", "no_pork", "no_pork_no_beef"] },
  },
  select: {
    firstName: true,
    lastName: true,
    tableNumber: true,
    floor: true,
    menuType: true,
    email: true,
    busReturn: true,
  },
  orderBy: [{ tableNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
});

const byMenu = { vegetarian: 0, no_pork: 0, no_pork_no_beef: 0 };
for (const x of special) {
  if (x.menuType) byMenu[x.menuType] += 1;
}

const sheetRezumat = [
  ["Eveniment", event.title],
  [],
  ["Tip meniu", "Număr persoane"],
  ["Fără porc", byMenu.no_pork],
  ["Vegetarian", byMenu.vegetarian],
  ["Fără porc și vită", byMenu.no_pork_no_beef],
  [],
  ["Total meniuri speciale", special.length],
];

const byTable = new Map();
for (const x of special) {
  const t = x.tableNumber ?? 0;
  if (!byTable.has(t)) {
    byTable.set(t, {
      masa: t,
      etaj: x.floor ?? "",
      faraPorc: 0,
      vegetarian: 0,
      faraPorcVita: 0,
      total: 0,
    });
  }
  const row = byTable.get(t);
  row.total += 1;
  if (x.menuType === "no_pork") row.faraPorc += 1;
  if (x.menuType === "vegetarian") row.vegetarian += 1;
  if (x.menuType === "no_pork_no_beef") row.faraPorcVita += 1;
}

const sheetMese = [
  [
    "Masă",
    "Etaj",
    "Nr. speciale",
    "Fără porc",
    "Vegetarian",
    "Fără porc și vită",
  ],
  ...[...byTable.values()]
    .sort((a, b) => a.masa - b.masa)
    .map((r) => [
      r.masa,
      r.etaj,
      r.total,
      r.faraPorc,
      r.vegetarian,
      r.faraPorcVita,
    ]),
];

const sheetPersoane = [
  ["Masă", "Etaj", "Nume", "Prenume", "Meniu special", "Email", "Autocar"],
  ...special.map((x) => [
    x.tableNumber ?? "",
    x.floor ?? "",
    x.lastName,
    x.firstName,
    LABELS[x.menuType ?? ""] ?? x.menuType,
    x.email ?? "",
    x.busReturn ? "Da" : "Nu",
  ]),
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet(sheetRezumat),
  "Rezumat",
);
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet(sheetMese),
  "Pe mese",
);
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet(sheetPersoane),
  "Lista persoane",
);

const outDir = path.resolve("exports");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "Meniuri-speciale-Bal-Automatica.xlsx");
XLSX.writeFile(wb, outPath);

console.log(`Generat: ${outPath}`);
console.log(`  Rezumat: ${special.length} meniuri speciale`);
console.log(`  Mese afectate: ${byTable.size}`);

await p.$disconnect();

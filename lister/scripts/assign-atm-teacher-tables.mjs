/**
 * Atribuie mese profesorilor Bal ATM + înlocuire Soare→Roman + 2 invitați la masa 6.
 *
 *   node --env-file=.env scripts/assign-atm-teacher-tables.mjs [--dry-run]
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const text = (v) =>
  v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " ");

function stripDiacritics(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i");
}

function norm(s) {
  return stripDiacritics(text(s).toLowerCase())
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Listele din mesaj — tipuri scurte, potrivite pe DB. */
const SEATING = [
  {
    table: 1,
    label: "Conducere",
    names: [
      "Vizitiu",
      "Rorya",
      "Depărățeanu",
      "Constantin",
      "Togan",
      "Dima",
      "Moldoveanu el",
      "Moldoveanu ea",
      "Subașu el",
      "Subașu ea",
      "Rotariu", // Traian (conducere) — nu Adrian (fac. A)
      "Băncilă",
    ],
  },
  {
    table: 2,
    label: "Batalion",
    names: [
      "Gava",
      "Negoiță",
      "Rădulescu",
      "Almășanu",
      "Niculae",
      "Marcu",
      "Popa",
      "Neagoe Claudia",
      "Maghsoudi Teodora",
      "Clincescu",
      "Roman Andrada", // înlocuiește Soare Liviu
    ],
  },
  {
    table: 3,
    label: "Facultatea A",
    names: [
      "Baciu Cătălin",
      "Budan Constantin",
      "Buliga Dan-Ilie",
      "Chiotan Corina",
      "Coțovanu Anabella",
      "Petcu Claudia",
      "Elisei Cojan",
      "Guță Octavian",
      "Eftimie Florin",
      "Stanciu Angelica",
      "Bogdan Gheorghe",
      "Zdrenghea Doru",
    ],
  },
  {
    table: 4,
    label: "Facultatea A",
    names: [
      "Rotariu Adrian",
      "Șomoiag Pamfil",
      "Vedinaș Ioan",
      "Vedinaș Cristina",
      "Matache Liviu",
      "Mircioagă Răzvan",
      "Pulpea Bogdan",
      "Bucur Florina",
      "Haller Laviniu",
      "Bunduc Nicoleta",
      "Dîrloman Florin",
      "Cîrmaci Marius",
    ],
  },
  {
    table: 5,
    label: "Facultatea B",
    names: [
      "Adochiei Ioana",
      "Adochiei Felix",
      "Boglis",
      "Cucu",
      "Fuiorea",
      "Grigorie",
      "Larco",
      "Mihaila",
      "Mustata",
      "Nacu",
      "Vidan",
      "Vatavu",
    ],
  },
  {
    table: 6,
    label: "Combinat",
    names: [
      "Vilau",
      "Vinturis",
      "Herascu",
      "Bădoi",
      "Pașcan",
      "Preda",
      "Nastasiu Dragos",
      "Nati Marius",
    ],
  },
  {
    table: 7,
    label: "Facultatea C",
    names: [
      "Aciobăniței",
      "Bica",
      "Coca",
      "Conchințoiu",
      "Cujbă",
      "Dobre",
      "Grumăzescu",
      "Marzavan",
      "Medvei",
      "Morogan",
      "Tiță",
      "Vlăduță",
    ],
  },
  {
    table: 8,
    label: "Facultatea E",
    names: [
      "Ciotîrnae",
      "Enache",
      "Frunză",
      "Gorgoteanu",
      "Nicolaescu",
      "Nicula",
      "Rîncu",
      "Stănescu",
      "Nuțu",
      "Pantazi",
      "Păunescu",
    ],
  },
];

/** Preferințe când mai mulți candidați / ordine inversă nume-prenume. */
const MANUAL = new Map([
  ["rotariu", "rotariu traian"], // masa 1
  ["rotariu adrian", "rotariu adrian"],
  ["moldoveanu el", "moldoveanu cristian"],
  ["moldoveanu ea", "moldoveanu daniela"],
  ["subasu el", "subasu catalin"],
  ["subasu ea", "subasu georgiana"],
  ["elisei cojan", "cojan elisei"],
  ["bogdan gheorghe", "gheorghe bogdan"],
  ["boglis", "boglis carmen"],
  ["mihaila", "mihaila mihai"],
  ["mustata", "mustata stefan"],
  ["vilau", "vilau radu"],
  ["vinturis", "vinturis valentin"],
  ["vedinas cristina", "vedinas cristina georgeta"],
  ["rorya", "rizea romeo"], // listă „Rorya”; DB/nominal: Rizea Romeo
]);

function groupFor(table, label) {
  return `Profesori · Masa ${String(table).padStart(2, "0")} · ${label}`;
}

function personKey(lastName, firstName) {
  return norm(`${lastName} ${firstName}`);
}

function scoreMatch(queryNorm, personNorm, queryTok, personTok) {
  if (queryNorm === personNorm) return 1;
  if (personNorm.startsWith(queryNorm + " ") || personNorm === queryNorm) return 0.95;
  // toate tokenurile query apar în persoană
  if ([...queryTok].every((t) => [...personTok].some((u) => u === t || u.startsWith(t) || t.startsWith(u)))) {
    return 0.9;
  }
  // ordine inversă (prenume nume)
  const qParts = queryNorm.split(" ");
  if (qParts.length >= 2) {
    const swapped = `${qParts.slice(1).join(" ")} ${qParts[0]}`;
    if (personNorm === swapped || personNorm.startsWith(swapped + " ")) return 0.92;
  }
  return 0;
}

const event = await prisma.event.findUnique({ where: { slug: "bal-atm" } });
if (!event) {
  console.error("bal-atm negăsit");
  process.exit(1);
}

const teachers = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: true },
});

const byNorm = new Map();
for (const t of teachers) {
  byNorm.set(personKey(t.lastName, t.firstName), t);
}

const usedIds = new Set();
const updates = [];
const creates = [];
const unmatched = [];

/** Persoane noi (nu în DB încă). */
const NEW_PEOPLE = new Map([
  ["roman andrada", { lastName: "Roman", firstName: "Andrada" }],
  ["nastasiu dragos", { lastName: "Nastasiu", firstName: "Dragoș" }],
  ["nati marius", { lastName: "Nati", firstName: "Marius" }],
]);

for (const seat of SEATING) {
  for (const raw of seat.names) {
    const qNorm = norm(raw);
    const qTok = new Set(qNorm.split(" ").filter(Boolean));

    // New people not yet in DB
    if (NEW_PEOPLE.has(qNorm) || (qNorm === "roman andrada" || qNorm === "nastasiu dragos" || qNorm === "nati marius")) {
      const nKey = qNorm === "nastasiu dragos" ? "nastasiu dragos" : qNorm;
      const info =
        NEW_PEOPLE.get(nKey) ??
        NEW_PEOPLE.get(qNorm) ??
        (qNorm === "roman andrada"
          ? { lastName: "Roman", firstName: "Andrada" }
          : qNorm === "nastasiu dragos"
            ? { lastName: "Nastasiu", firstName: "Dragoș" }
            : { lastName: "Nati", firstName: "Marius" });
      creates.push({
        ...info,
        tableNumber: seat.table,
        group: groupFor(seat.table, seat.label),
        floor: "Profesori",
        teacher: true,
        sourceRaw: raw,
      });
      continue;
    }

    let best = null;
    let bestScore = 0;

    const manualTarget = MANUAL.get(qNorm);
    if (manualTarget) {
      const hit = byNorm.get(manualTarget);
      if (hit && !usedIds.has(hit.id)) {
        best = hit;
        bestScore = 1;
      }
    }

    if (!best) {
      for (const t of teachers) {
        if (usedIds.has(t.id)) continue;
        const pNorm = personKey(t.lastName, t.firstName);
        const pTok = new Set(pNorm.split(" ").filter(Boolean));
        const sc = scoreMatch(qNorm, pNorm, qTok, pTok);
        if (sc > bestScore) {
          bestScore = sc;
          best = t;
        }
      }
    }

    if (!best || bestScore < 0.85) {
      unmatched.push({ raw, table: seat.table, label: seat.label, bestScore, best: best ? `${best.lastName} ${best.firstName}` : null });
      continue;
    }

    usedIds.add(best.id);
    updates.push({
      id: best.id,
      name: `${best.lastName} ${best.firstName}`,
      tableNumber: seat.table,
      group: groupFor(seat.table, seat.label),
      floor: "Profesori",
      sourceRaw: raw,
      score: bestScore,
    });
  }
}

const leftover = teachers.filter((t) => !usedIds.has(t.id));
const soare = leftover.find((t) => norm(`${t.lastName} ${t.firstName}`) === "soare liviu");

console.log(`Eveniment: ${event.title}`);
console.log(`Updates: ${updates.length}, Creates: ${creates.length}, Unmatched: ${unmatched.length}`);
console.log(`Leftover teachers: ${leftover.length}`);
for (const u of unmatched) {
  console.log(`  ✗ „${u.raw}” masa ${u.table} (best=${u.best} @${u.bestScore})`);
}
for (const t of leftover) {
  console.log(`  leftover: ${t.lastName} ${t.firstName}${t === soare ? " ← Soare (de șters)" : ""}`);
}
console.log("\nExemplu updates:");
for (const u of updates.slice(0, 8)) {
  console.log(`  Masa ${u.tableNumber}: ${u.name} ← „${u.sourceRaw}”`);
}
console.log("Creates:");
for (const c of creates) {
  console.log(`  Masa ${c.tableNumber}: ${c.lastName} ${c.firstName} ← „${c.sourceRaw}”`);
}

if (unmatched.length) {
  console.error("\n❌ Matching incomplet — oprire.");
  process.exit(1);
}

if (dryRun) {
  console.log("\n[dry-run] Nicio scriere.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of updates) {
  await prisma.participant.update({
    where: { id: u.id },
    data: {
      tableNumber: u.tableNumber,
      group: u.group,
      floor: u.floor,
    },
  });
}
console.log(`Actualizați: ${updates.length}`);

if (soare) {
  await prisma.participant.delete({ where: { id: soare.id } });
  console.log(`Șters: Soare Liviu (${soare.id})`);
}

for (const c of creates) {
  await prisma.participant.create({
    data: {
      eventId: event.id,
      firstName: c.firstName,
      lastName: c.lastName,
      group: c.group,
      tableNumber: c.tableNumber,
      floor: c.floor,
      teacher: true,
      qrToken: randomUUID(),
    },
  });
}
console.log(`Creați: ${creates.length}`);

const finalTeachers = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: true },
  select: { tableNumber: true, lastName: true, firstName: true, group: true },
  orderBy: [{ tableNumber: "asc" }, { lastName: "asc" }],
});
const byTable = {};
for (const t of finalTeachers) {
  const k = t.tableNumber ?? "null";
  (byTable[k] ??= []).push(`${t.lastName} ${t.firstName}`);
}
console.log(`\nTotal profesori: ${finalTeachers.length}`);
for (const [t, people] of Object.entries(byTable).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  Masa ${t}: ${people.length} — ${people.join(", ")}`);
}

await prisma.$disconnect();

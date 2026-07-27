/**
 * Sync Bal ATM din Excel-urile actualizate:
 * - studenți: mese 9–28 + emailuri din nominal
 * - profesori: rămân pe 1–8 (deja setați)
 *
 *   node --env-file=.env scripts/sync-atm-from-docs.mjs [--dry-run]
 */
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const NOMINAL = path.resolve("../tabel nominal absolvire ATM 2026 (1).xlsx");
const MESE = path.resolve("../mese bal ATM 2026 (1).xlsx");

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

function tokens(s) {
  return new Set(norm(s).split(" ").filter(Boolean));
}

function cleanEmail(raw) {
  let email = text(raw).toLowerCase();
  if (!email) return null;
  email = email
    .replace(/\s+/g, "")
    .replace(/@gmailcom$/, "@gmail.com")
    .replace(/@yahoo(?:ro)?$/, (m) => (m.endsWith("ro") ? "@yahoo.ro" : "@yahoo.com"))
    .replace(/\.con$/, ".com")
    .replace(/\.comm$/, ".com");
  if (!email.includes(".") && email.includes("@")) {
    email = email.replace(/@(gmail|yahoo|icloud|outlook|hotmail)(com|ro)$/, "@$1.$2");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/** Mapări explicite mese → nominal / DB (din import-atm-bal). */
const MANUAL = new Map([
  ["florea gabriel", "florea cristian"],
  ["dinu andrei", "dinu liviu"],
  ["vasi cinar", "cinar vasile"],
  ["andrei bianca", "andrei bianca cristiana"],
  ["maria serban", "serban ana maria"],
  ["bondor bogdan", "bondor negraru bogdan"],
  ["lepadatu", "lepadatu tudor"],
  ["steopoae ana", "steopoae anamaria"],
  ["cozonac tina", "cozonac leontina ancuta"],
  // variante din Excel actualizat
  ["muresanu dan alexandru", "muresanu dan alexandru"],
  ["bulimar mihai alexandru", "bulimar mihai"],
]);

function scorePair(aTok, bTok) {
  if (!aTok.size || !bTok.size) return 0;
  const shorter = aTok.size <= bTok.size ? aTok : bTok;
  const longer = aTok.size <= bTok.size ? bTok : aTok;
  let contained = true;
  for (const t of shorter) {
    if (![...longer].some((u) => u === t || u.startsWith(t) || t.startsWith(u))) {
      contained = false;
      break;
    }
  }
  if (contained) return 0.96;
  let inter = 0;
  for (const t of aTok) if (bTok.has(t)) inter += 1;
  if (inter >= 2) return 0.8 + 0.05 * inter;
  if (aTok.size === 2 && bTok.size === 2 && [...aTok].every((t) => bTok.has(t))) return 1;
  return inter / (aTok.size + bTok.size - inter);
}

function loadNominal(filePath) {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const students = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] ?? [];
    const name = text(r[1]).replace(/\u00a0/g, " ");
    if (!name) continue;
    const excelRow = i + 1;
    if (excelRow > 236) break; // profesori de la 237
    students.push({
      name,
      email: cleanEmail(r[2]),
      norm: norm(name),
      tok: tokens(name),
    });
  }
  return students;
}

function loadMese(filePath) {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const seated = [];
  const currentTables = [null, null, null, null];

  for (let i = 0; i < rows.length; i += 1) {
    const vals = rows[i] ?? [];
    let isHeader = false;
    const headers = [];
    for (let col = 0; col < 12; col += 3) {
      const v = vals[col];
      if (v != null && /masa/i.test(String(v))) {
        const m = String(v).match(/(\d+)/);
        headers.push(m ? Number(m[1]) : null);
        isHeader = true;
      } else {
        headers.push(null);
      }
    }
    if (isHeader && headers.some((h) => h != null)) {
      for (let j = 0; j < 4; j += 1) {
        if (headers[j] != null) currentTables[j] = headers[j];
      }
      continue;
    }

    for (let j = 0; j < 4; j += 1) {
      const table = currentTables[j];
      if (table == null) continue;
      const col = j * 3;
      const seat = vals[col];
      const name = text(vals[col + 1]).replace(/\u00a0/g, " ");
      if (!name) continue;
      seated.push({
        table,
        seat: seat != null && text(seat) ? Number(seat) : null,
        name,
        norm: norm(name),
        tok: tokens(name),
      });
    }
  }
  return seated;
}

function personKey(lastName, firstName) {
  return norm(`${lastName} ${firstName}`);
}

function matchToDb(seated, dbStudents) {
  const used = new Set();
  const matches = [];
  const unmatched = [];

  const byNorm = new Map();
  for (const s of dbStudents) {
    byNorm.set(personKey(s.lastName, s.firstName), s);
  }

  const byToken = new Map();
  for (const s of dbStudents) {
    const tok = tokens(`${s.lastName} ${s.firstName}`);
    for (const t of tok) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(s);
    }
  }

  for (const seat of seated) {
    let found = null;
    let kind = null;
    let score = 0;

    const manualTarget = MANUAL.get(seat.norm);
    if (manualTarget) {
      found = dbStudents.find(
        (st) => !used.has(st.id) && personKey(st.lastName, st.firstName) === manualTarget,
      );
      // also try: manual maps to nominal form; DB may have hyphen/extra names
      if (!found) {
        const mTok = new Set(manualTarget.split(" ").filter(Boolean));
        let best = null;
        let bestSc = 0;
        for (const st of dbStudents) {
          if (used.has(st.id)) continue;
          const sc = scorePair(mTok, tokens(`${st.lastName} ${st.firstName}`));
          if (sc > bestSc) {
            bestSc = sc;
            best = st;
          }
        }
        if (best && bestSc >= 0.9) {
          found = best;
        }
      }
      if (found) {
        kind = "manual";
        score = 1;
      }
    }

    if (!found) {
      found = byNorm.get(seat.norm);
      if (found && !used.has(found.id)) {
        kind = "exact";
        score = 1;
      } else {
        found = null;
      }
    }

    if (!found) {
      const candidates = [];
      const seen = new Set();
      for (const t of seat.tok) {
        for (const st of byToken.get(t) ?? []) {
          if (used.has(st.id) || seen.has(st.id)) continue;
          seen.add(st.id);
          const pTok = tokens(`${st.lastName} ${st.firstName}`);
          let sc = scorePair(seat.tok, pTok);
          const subset =
            [...seat.tok].every((x) => pTok.has(x)) ||
            [...pTok].every((x) => seat.tok.has(x));
          if (subset) sc = Math.max(sc, 0.96);
          candidates.push({ sc, st });
        }
      }
      candidates.sort((a, b) => b.sc - a.sc);
      if (candidates[0]?.sc >= 0.7) {
        found = candidates[0].st;
        kind = "fuzzy";
        score = candidates[0].sc;
      }
    }

    if (found) {
      used.add(found.id);
      matches.push({ seat, db: found, kind, score });
    } else {
      unmatched.push(seat);
    }
  }

  const leftover = dbStudents.filter((st) => !used.has(st.id));
  return { matches, unmatched, leftover };
}

const event = await prisma.event.findUnique({ where: { slug: "bal-atm" } });
if (!event) {
  console.error("bal-atm negăsit");
  process.exit(1);
}

const nominal = loadNominal(NOMINAL);
const seated = loadMese(MESE);
const dbStudents = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: false },
});
const dbTeachers = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: true },
  select: { id: true, tableNumber: true, lastName: true, firstName: true },
});

console.log(`Eveniment: ${event.title}`);
console.log(`Nominal studenți: ${nominal.length}`);
console.log(`Mese studenți: ${seated.length} pe ${new Set(seated.map((s) => s.table)).size} mese`);
console.log(`DB: ${dbStudents.length} studenți, ${dbTeachers.length} profesori`);

const tables = [...new Set(seated.map((s) => s.table))].sort((a, b) => a - b);
if (tables.some((t) => t < 9)) {
  console.error("❌ Excel mese conține mese < 9 pentru studenți — oprire.");
  process.exit(1);
}

const teachersOnWrong = dbTeachers.filter(
  (t) => t.tableNumber == null || t.tableNumber < 1 || t.tableNumber > 8,
);
if (teachersOnWrong.length) {
  console.warn(`⚠ ${teachersOnWrong.length} profesori în afara meselor 1–8`);
  for (const t of teachersOnWrong) {
    console.warn(`  ${t.lastName} ${t.firstName}: masa ${t.tableNumber}`);
  }
}

const { matches, unmatched, leftover } = matchToDb(seated, dbStudents);
console.log(
  `Match: ${matches.length} (exact=${matches.filter((m) => m.kind === "exact").length}, fuzzy=${matches.filter((m) => m.kind === "fuzzy").length}, manual=${matches.filter((m) => m.kind === "manual").length})`,
);

if (unmatched.length || leftover.length) {
  console.error("\n❌ Match incomplet:");
  for (const u of unmatched) console.error(`  mese: Masa ${u.table} „${u.name}”`);
  for (const u of leftover) console.error(`  DB liber: ${u.lastName} ${u.firstName}`);
  process.exit(1);
}

// Email updates from nominal (match by DB name)
const emailByNorm = new Map();
for (const n of nominal) {
  if (n.email) emailByNorm.set(n.norm, n.email);
}

const tableUpdates = [];
const emailUpdates = [];
for (const m of matches) {
  const group = `Masa ${String(m.seat.table).padStart(2, "0")}`;
  const needTable =
    m.db.tableNumber !== m.seat.table || m.db.group !== group || m.db.floor != null;
  if (needTable) {
    tableUpdates.push({
      id: m.db.id,
      name: `${m.db.lastName} ${m.db.firstName}`,
      from: m.db.tableNumber,
      to: m.seat.table,
      group,
      kind: m.kind,
    });
  }

  const dbKey = personKey(m.db.lastName, m.db.firstName);
  let newEmail = emailByNorm.get(dbKey);
  if (!newEmail) {
    // try nominal fuzzy via MANUAL reverse / token match
    for (const n of nominal) {
      if (scorePair(tokens(`${m.db.lastName} ${m.db.firstName}`), n.tok) >= 0.96) {
        newEmail = n.email;
        break;
      }
    }
  }
  if (newEmail && (m.db.email || "").toLowerCase() !== newEmail.toLowerCase()) {
    emailUpdates.push({
      id: m.db.id,
      name: `${m.db.lastName} ${m.db.firstName}`,
      from: m.db.email,
      to: newEmail,
    });
  }
}

console.log(`\nUpdate mese: ${tableUpdates.length}`);
console.log(`Update email: ${emailUpdates.length}`);
for (const e of emailUpdates) {
  console.log(`  ${e.name}: ${e.from} → ${e.to}`);
}

const byNew = {};
for (const m of matches) {
  byNew[m.seat.table] = (byNew[m.seat.table] || 0) + 1;
}
console.log("\nDistribuție nouă:");
for (const t of Object.keys(byNew)
  .map(Number)
  .sort((a, b) => a - b)) {
  console.log(`  Masa ${t}: ${byNew[t]}`);
}

if (dryRun) {
  console.log("\n[dry-run] Nicio scriere.");
  console.log("Exemple mutări:");
  for (const u of tableUpdates.slice(0, 10)) {
    console.log(`  ${u.name}: ${u.from} → ${u.to}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of tableUpdates) {
  await prisma.participant.update({
    where: { id: u.id },
    data: {
      tableNumber: u.to,
      group: u.group,
      floor: null,
    },
  });
}
console.log(`Mese actualizate: ${tableUpdates.length}`);

for (const e of emailUpdates) {
  await prisma.participant.update({
    where: { id: e.id },
    data: { email: e.to },
  });
}
console.log(`Emailuri actualizate: ${emailUpdates.length}`);

// Final verify
const finalStudents = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: false },
  select: { tableNumber: true },
});
const finalTeachers = await prisma.participant.findMany({
  where: { eventId: event.id, teacher: true },
  select: { tableNumber: true },
});
const sOnLow = finalStudents.filter((s) => s.tableNumber != null && s.tableNumber <= 8);
const tOnHigh = finalTeachers.filter((t) => t.tableNumber != null && t.tableNumber >= 9);
console.log(`\nVerificare: studenți pe 1–8: ${sOnLow.length} (trebuie 0)`);
console.log(`Verificare: profesori pe ≥9: ${tOnHigh.length} (trebuie 0)`);
console.log(
  `Profesori pe 1–8: ${finalTeachers.filter((t) => t.tableNumber >= 1 && t.tableNumber <= 8).length}/${finalTeachers.length}`,
);
console.log(
  `Studenți pe 9–28: ${finalStudents.filter((s) => s.tableNumber >= 9 && s.tableNumber <= 28).length}/${finalStudents.length}`,
);

await prisma.$disconnect();

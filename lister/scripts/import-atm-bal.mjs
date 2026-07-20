/**
 * Import Bal ATM: unește tabelul nominal (email) cu așezarea pe mese,
 * plus profesorii (fără email / fără trimitere QR).
 *
 *   node --env-file=.env scripts/import-atm-bal.mjs \
 *     --nominal "../tabel nominal absolvire ATM 2026.xlsx" \
 *     --mese "../mese bal ATM 2026.xlsx" \
 *     --event bal-atm [--dry-run]
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

const nominalPath = arg("nominal");
const mesePath = arg("mese");
const eventRef = arg("event");
const dryRun = hasFlag("dry-run");

if (!nominalPath || !mesePath || !eventRef) {
  console.error(
    'Utilizare: node --env-file=.env scripts/import-atm-bal.mjs --nominal "<nominal.xlsx>" --mese "<mese.xlsx>" --event <slug|id> [--dry-run]',
  );
  process.exit(1);
}

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

/** Liste oficiale RO: Nume Prenume… */
function splitOfficialName(fullName) {
  const parts = text(fullName).replace(/\u00a0/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}

function cleanEmail(raw) {
  let email = text(raw).toLowerCase();
  if (!email) return null;
  // Typo-uri frecvente: spațiu înainte de TLD, .con/.comm
  email = email
    .replace(/\s+/g, "")
    .replace(/@gmailcom$/, "@gmail.com")
    .replace(/@yahoo(?:ro)?$/, (m) => (m.endsWith("ro") ? "@yahoo.ro" : "@yahoo.com"))
    .replace(/\.con$/, ".com")
    .replace(/\.comm$/, ".com");
  // „gmail com” / „yahoo ro” după ce am scos spațiile rămâne gmailcom
  if (!email.includes(".") && email.includes("@")) {
    email = email.replace(/@(gmail|yahoo|icloud|outlook|hotmail)(com|ro)$/, "@$1.$2");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/** Mapări explicite mese → nominal (confirmate). */
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
  const professors = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] ?? [];
    const name = text(r[1]).replace(/\u00a0/g, " ");
    if (!name) continue;
    const excelRow = i + 1;
    const entry = {
      name,
      email: cleanEmail(r[2]),
      norm: norm(name),
      tok: tokens(name),
      excelRow,
    };
    // Rânduri 2–236 = 235 studenți; de la 237 = profesori (nr. crt. reîncepe de la 1).
    if (excelRow <= 236) students.push(entry);
    else professors.push(entry);
  }
  return { students, professors };
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
        excelRow: i + 1,
      });
    }
  }
  return seated;
}

function matchSeated(seated, students) {
  const used = new Set();
  const matches = [];
  const unmatched = [];

  const byToken = new Map();
  for (const st of students) {
    for (const t of st.tok) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(st);
    }
  }

  for (const s of seated) {
    let found = null;
    let kind = null;
    let score = 0;

    const manualTarget = MANUAL.get(s.norm);
    if (manualTarget) {
      found = students.find((st) => !used.has(st.name) && st.norm === manualTarget);
      if (found) {
        kind = "manual";
        score = 1;
      }
    }

    if (!found) {
      found = students.find((st) => !used.has(st.name) && st.norm === s.norm);
      if (found) {
        kind = "exact";
        score = 1;
      }
    }

    if (!found) {
      const candidates = [];
      const seen = new Set();
      for (const t of s.tok) {
        for (const st of byToken.get(t) ?? []) {
          if (used.has(st.name) || seen.has(st.name)) continue;
          seen.add(st.name);
          let sc = scorePair(s.tok, st.tok);
          const subset =
            [...s.tok].every((x) => st.tok.has(x)) ||
            [...st.tok].every((x) => s.tok.has(x));
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
      used.add(found.name);
      matches.push({
        ...s,
        matchName: found.name,
        email: found.email,
        kind,
        score,
      });
    } else {
      unmatched.push(s);
    }
  }

  const unmatchedStudents = students.filter((st) => !used.has(st.name));
  return { matches, unmatched, unmatchedStudents };
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

const { students, professors } = loadNominal(nominalPath);
const seated = loadMese(mesePath);
const { matches, unmatched, unmatchedStudents } = matchSeated(seated, students);

console.log(`\nNominal: ${students.length} studenți, ${professors.length} profesori`);
console.log(`Mese: ${seated.length} locuri pe ${new Set(seated.map((s) => s.table)).size} mese`);
console.log(
  `Match: ${matches.length} (exact=${matches.filter((m) => m.kind === "exact").length}, fuzzy=${matches.filter((m) => m.kind === "fuzzy").length}, manual=${matches.filter((m) => m.kind === "manual").length})`,
);

if (unmatched.length || unmatchedStudents.length) {
  console.error("\n❌ Match incomplet — oprire:");
  for (const u of unmatched) console.error(`  mese: Masa ${u.table}/${u.seat} „${u.name}”`);
  for (const u of unmatchedStudents) console.error(`  nominal liber: „${u.name}” <${u.email}>`);
  process.exit(1);
}

const emailCounts = new Map();
for (const m of matches) {
  if (!m.email) continue;
  emailCounts.set(m.email, (emailCounts.get(m.email) ?? 0) + 1);
}
const sharedEmails = [...emailCounts.entries()].filter(([, n]) => n > 1);
if (sharedEmails.length) {
  console.log("\nEmailuri partajate (2 bilete pe aceeași adresă):");
  for (const [email, n] of sharedEmails) {
    const who = matches.filter((m) => m.email === email).map((m) => m.matchName);
    console.log(`  ${email} ×${n}: ${who.join(" + ")}`);
  }
}

const noEmail = matches.filter((m) => !m.email);
if (noEmail.length) {
  console.warn(`\n⚠ ${noEmail.length} studenți fără email:`);
  for (const m of noEmail) console.warn(`  ${m.matchName}`);
}

const studentRows = matches.map((m) => {
  const { firstName, lastName } = splitOfficialName(m.matchName);
  return {
    firstName,
    lastName,
    email: m.email,
    group: `Masa ${String(m.table).padStart(2, "0")}`,
    tableNumber: m.table,
    teacher: false,
    sourceLabel: `${m.matchName} ← „${m.name}” [${m.kind}]`,
  };
});

const professorRows = professors.map((p) => {
  const { firstName, lastName } = splitOfficialName(p.name);
  return {
    firstName,
    lastName,
    email: null,
    group: "Profesori",
    tableNumber: null,
    teacher: true,
    sourceLabel: p.name,
  };
});

const existing = await prisma.participant.findMany({
  where: { eventId: event.id },
  select: { firstName: true, lastName: true, group: true },
});
const key = (p) => `${p.firstName}\u0001${p.lastName}\u0001${p.group}`.toLowerCase();
const existingKeys = new Set(existing.map(key));

const all = [...studentRows, ...professorRows];
const toInsert = [];
let skipped = 0;
const seen = new Set();
for (const p of all) {
  const k = key(p);
  if (existingKeys.has(k) || seen.has(k)) {
    skipped += 1;
    continue;
  }
  seen.add(k);
  toInsert.push(p);
}

console.log(`\nDe inserat: ${toInsert.length} (studenți ${studentRows.length} + profesori ${professorRows.length}; sărite duplicate: ${skipped})`);
console.log(`  cu email: ${toInsert.filter((p) => p.email && !p.teacher).length}`);
console.log(`  profesori (fără QR email): ${toInsert.filter((p) => p.teacher).length}`);

if (dryRun) {
  console.log("\n[dry-run] Nu am scris nimic. Exemplu studenți:");
  for (const p of toInsert.filter((x) => !x.teacher).slice(0, 5)) {
    console.log(`  Masa ${p.tableNumber}: ${p.lastName} ${p.firstName} <${p.email}>`);
  }
  console.log("Exemplu profesori:");
  for (const p of toInsert.filter((x) => x.teacher).slice(0, 3)) {
    console.log(`  ${p.lastName} ${p.firstName}`);
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
        teacher: p.teacher,
        qrToken: randomUUID(),
      })),
    });
    created += res.count;
  }
  console.log(`\nInserate: ${created} persoane în „${event.title}”.`);
}

await prisma.$disconnect();

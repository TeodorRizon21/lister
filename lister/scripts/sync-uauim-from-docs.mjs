/**
 * Sync Bal UAUIM din documentele noi:
 *   ../interior.pdf, ../urbanism.xlsx, ../arhitectura.xlsx
 *
 *   node --env-file=.env scripts/sync-uauim-from-docs.mjs [--dry-run]
 *
 * - Adaugă persoanele lipsă (în special Urbanism)
 * - Actualizează email / bus / meniu unde lipseau
 * - Nu șterge participanți existenți
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dryRun = process.argv.includes("--dry-run");

const text = (v) =>
  v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " ");

function stripDiacritics(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș/gi, "s")
    .replace(/ț/gi, "t");
}

function normName(s) {
  return stripDiacritics(text(s).toLowerCase())
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleName(s) {
  if (!s || s === "—") return s;
  return s
    .split(" ")
    .filter(Boolean)
    .map((chunk) =>
      chunk
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join("-"),
    )
    .join(" ");
}

function cleanEmail(raw) {
  let email = text(raw).toLowerCase();
  if (!email || email === "-") return null;
  // „ana udrea.um@yahoo.com” → ana.udrea.um@yahoo.com
  if (email.includes(" ") && email.includes("@")) {
    email = email.replace(/\s+/g, ".");
    email = email.replace(/\.+@/, "@").replace(/\.{2,}/g, ".");
  } else {
    email = email.replace(/\s+/g, "");
  }
  email = email.replace("&", "@");
  email = email.replace(/\.+$/, "");
  email = email.replace("@gamil.com", "@gmail.com");
  email = email.replace(/\.con$/, ".com").replace(/\.comm$/, ".com");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

function parseBus(raw) {
  const s = text(raw).toLowerCase();
  if (!s || s === "-") return false;
  return s === "da" || s === "yes";
}

function parseMenu(raw) {
  const s = stripDiacritics(text(raw).toLowerCase());
  if (!s || s === "-" || s === "nu") return null;
  if (s.includes("vegetari")) return "vegetarian";
  if (s.includes("porc") && s.includes("vita")) return "no_pork_no_beef";
  if (s.includes("porc") || s.includes("fara carne de porc") || s.includes("fara porc"))
    return "no_pork";
  return null;
}

const COMMON_FIRST = new Set(
  [
    "maria", "ana", "ioana", "andrei", "alexandru", "andreea", "mihai", "elena",
    "cristina", "alexandra", "stefan", "ștefan", "lorena", "ruben", "diana",
    "mara", "laura", "gabriel", "daniel", "alexia", "bianca", "teodora",
  ].map((x) => stripDiacritics(x)),
);

function splitOfficialName(fullName, email = null) {
  const original = text(fullName).replace(/\u00a0/g, " ");
  let name = original;

  // „INVITAT BUTCARU; BOBOHALMA IOANA”
  if (/invitat/i.test(name) && name.includes(";")) {
    name = name.split(";").pop().trim();
  }

  const invitatPrefix = name.match(/^\s*invitat(?:a)?\s*[:\-–—]?\s*(.+)$/i);
  const wasInvitatPrefix = Boolean(invitatPrefix);
  if (invitatPrefix) name = invitatPrefix[1].trim();

  name = name.replace(/\s*[-–—]?\s*invitat(?:a)?\b.*$/i, "").trim();
  name = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "—", lastName: "?" };
  if (parts.length === 1) return { lastName: titleName(parts[0]), firstName: "—" };

  // „invitat: RUBEN BACIU” (prenume nume) — detectăm din email
  if (wasInvitatPrefix && parts.length === 2 && email) {
    const e = email.toLowerCase();
    const a = stripDiacritics(parts[0].toLowerCase());
    const b = stripDiacritics(parts[1].toLowerCase());
    if (e.includes(b) && !e.includes(a)) {
      return { lastName: titleName(parts[1]), firstName: titleName(parts[0]) };
    }
  }

  // „LORENA DIACONU” / „MARIA TIRSA” — prenume + nume
  if (
    parts.length === 2 &&
    COMMON_FIRST.has(stripDiacritics(parts[0].toLowerCase())) &&
    !COMMON_FIRST.has(stripDiacritics(parts[1].toLowerCase()))
  ) {
    return { lastName: titleName(parts[1]), firstName: titleName(parts[0]) };
  }

  return {
    lastName: titleName(parts[0]),
    firstName: titleName(parts.slice(1).join(" ")),
  };
}

/** Liste urbanism: nume prenume (ex. „ghinea ilinca”). */
function splitUrbanismName(fullName) {
  const name = text(fullName).replace(/\u00a0/g, " ");
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "—", lastName: "?" };
  if (parts.length === 1) return { lastName: titleName(parts[0]), firstName: "—" };
  // excepție clară prenume+nume
  if (stripDiacritics(parts[0].toLowerCase()) === "maria" && parts.length === 2) {
    return { lastName: titleName(parts[1]), firstName: "Maria" };
  }
  return {
    lastName: titleName(parts[0]),
    firstName: titleName(parts.slice(1).join(" ")),
  };
}

function loadInteriorFromJson() {
  // Reuse previous parser output if present; else parse PDF text extract
  const jsonPath = path.join(__dirname, "_tmp-pdf-extract", "uauim-participants.json");
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return data.interior.map((p) => ({
      lastName: p.lastName,
      firstName: p.firstName,
      email: p.email,
      tableNumber: p.tableNumber,
      floor: "Interior",
      group: "Interior",
      busReturn: Boolean(p.busReturn),
      menuType: p.menuType || null,
      source: "interior.pdf",
    }));
  }
  return [];
}

function loadUrbanism() {
  const file = path.join(root, "urbanism.xlsx");
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
  });
  const people = [];
  let localMasa = null;
  for (const r of rows) {
    const c0 = text(r[0]);
    if (/^masa\s*\d+/i.test(c0)) {
      localMasa = Number(c0.match(/\d+/)[0]);
      continue;
    }
    const name = text(r[1]);
    if (!localMasa || !name || /^\d+\.?$/.test(name)) continue;
    const allergy = text(r[2]);
    const email = cleanEmail(r[3]);
    // fix spațiu în email tip „ana udrea.um@yahoo.com”
    let emailFixed = email;
    if (!emailFixed) {
      const raw = text(r[3]).toLowerCase().replace(/\s+/g, "");
      emailFixed = cleanEmail(raw);
    }
    const { lastName, firstName } = splitUrbanismName(name);
    people.push({
      lastName,
      firstName,
      email: emailFixed,
      tableNumber: localMasa + 5, // local 1–6 → global 6–11
      floor: "Urbanism",
      group: "Urbanism",
      busReturn: parseBus(r[4]),
      menuType: parseMenu(allergy),
      allergyRaw: allergy,
      source: "urbanism.xlsx",
      rawName: name,
    });
  }
  return people;
}

function loadArhitectura() {
  const file = path.join(root, "arhitectura.xlsx");
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
  });
  const people = [];
  let masa = null;
  for (const r of rows) {
    const c0 = text(r[0]);
    const nameRaw = text(r[1]);
    if (/^masa\s*\d+/i.test(c0)) {
      masa = Number(c0.match(/\d+/)[0]);
      if (nameRaw) {
        // first person on same row as MASA header
        const { lastName, firstName } = splitOfficialName(nameRaw, cleanEmail(r[2]));
        people.push({
          lastName,
          firstName,
          email: cleanEmail(r[2]),
          tableNumber: masa,
          floor: "Arhitectura",
          group: "Arhitectura",
          busReturn: parseBus(r[3]),
          menuType: parseMenu(r[4]),
          source: "arhitectura.xlsx",
          rawName: nameRaw,
        });
      }
      continue;
    }
    if (!masa || !nameRaw) continue;
    if (/^nume prenume$/i.test(nameRaw)) continue;
    const email = cleanEmail(r[2]);
    const { lastName, firstName } = splitOfficialName(nameRaw, email);
    people.push({
      lastName,
      firstName,
      email,
      tableNumber: masa,
      floor: "Arhitectura",
      group: "Arhitectura",
      busReturn: parseBus(r[3]),
      menuType: parseMenu(r[4]),
      source: "arhitectura.xlsx",
      rawName: nameRaw,
    });
  }
  return people;
}

const prisma = new PrismaClient();
const event = await prisma.event.findUnique({ where: { slug: "bal-uauim" } });
if (!event) {
  console.error("Eveniment bal-uauim negăsit");
  process.exit(1);
}
console.log(`Eveniment: ${event.title} (${event.id})`);

const interior = loadInteriorFromJson();
const urbanism = loadUrbanism();
const arhitectura = loadArhitectura();
const source = [...interior, ...urbanism, ...arhitectura];

console.log(
  `\nSursă: Interior ${interior.length}, Urbanism ${urbanism.length}, Arhitectura ${arhitectura.length} = ${source.length}`,
);

const existing = await prisma.participant.findMany({
  where: { eventId: event.id },
});

function matchKey(p) {
  return `${normName(p.lastName)}|${normName(p.firstName)}|${(p.floor || p.group || "").toLowerCase()}`;
}
function emailKey(e) {
  return e ? e.toLowerCase() : null;
}

const byKey = new Map();
const byEmail = new Map();
for (const p of existing) {
  byKey.set(matchKey(p), p);
  if (p.email) byEmail.set(p.email.toLowerCase(), p);
}

const toCreate = [];
const toUpdate = [];
const matched = [];
const ambiguous = [];

for (const s of source) {
  let hit =
    (s.email && byEmail.get(s.email.toLowerCase())) ||
    byKey.get(matchKey(s)) ||
    null;

  // fuzzy: same faculty + last name + first token of first name
  if (!hit) {
    const ln = normName(s.lastName);
    const fn0 = normName(s.firstName).split(" ")[0];
    const floor = (s.floor || "").toLowerCase();
    const cands = existing.filter(
      (p) =>
        (p.floor || "").toLowerCase() === floor &&
        normName(p.lastName) === ln &&
        (normName(p.firstName).startsWith(fn0) ||
          fn0.startsWith(normName(p.firstName).split(" ")[0])),
    );
    if (cands.length === 1) hit = cands[0];
    else if (cands.length > 1) {
      ambiguous.push({ source: s, cands });
      continue;
    }
  }

  if (!hit) {
    toCreate.push(s);
    continue;
  }

  matched.push({ source: s, db: hit });
  const patch = {};
  if (s.email && !hit.email) patch.email = s.email;
  if (s.email && hit.email && s.email.toLowerCase() !== hit.email.toLowerCase()) {
    // keep existing email unless clearly a typo fix (.con → .com)
    if (hit.email.endsWith(".con") && s.email.endsWith(".com")) patch.email = s.email;
  }
  if (s.tableNumber != null && hit.tableNumber !== s.tableNumber) {
    patch.tableNumber = s.tableNumber;
  }
  if (s.floor && hit.floor !== s.floor) patch.floor = s.floor;
  if (s.group && hit.group !== s.group && !hit.group.includes("·")) {
    // don't overwrite disambiguation empty group with faculty if name collision
    if (hit.group === "" || hit.group === s.group) {
      /* keep */
    } else if (hit.group !== s.group) {
      patch.group = s.group;
    }
  }
  if (s.busReturn && !hit.busReturn) patch.busReturn = true;
  if (s.menuType && !hit.menuType) patch.menuType = s.menuType;

  if (Object.keys(patch).length) {
    toUpdate.push({ id: hit.id, patch, label: `${hit.lastName} ${hit.firstName}`, from: s.source });
  }
}

// Persoane în DB care nu apar în surse (pe facultățile acoperite)
const sourceKeys = new Set(source.map(matchKey));
const sourceEmails = new Set(source.map((s) => s.email).filter(Boolean).map((e) => e.toLowerCase()));
const onlyInDb = existing.filter((p) => {
  if (sourceEmails.has((p.email || "").toLowerCase())) return false;
  if (sourceKeys.has(matchKey(p))) return false;
  return true;
});

console.log(`\nMatch: ${matched.length}`);
console.log(`De creat: ${toCreate.length}`);
console.log(`De actualizat: ${toUpdate.length}`);
console.log(`Ambiguu: ${ambiguous.length}`);
console.log(`Doar în DB (nu în documente): ${onlyInDb.length}`);

if (toCreate.length) {
  console.log("\n=== NOI ===");
  const byF = {};
  for (const p of toCreate) {
    byF[p.floor] = (byF[p.floor] ?? 0) + 1;
    console.log(
      `  + [${p.floor}] Masa ${p.tableNumber}: ${p.lastName} ${p.firstName} <${p.email ?? "fără email"}> (${p.source})`,
    );
  }
  console.log("  pe facultate:", byF);
}

if (toUpdate.length) {
  console.log("\n=== UPDATE ===");
  for (const u of toUpdate.slice(0, 40)) {
    console.log(`  ~ ${u.label}:`, u.patch);
  }
  if (toUpdate.length > 40) console.log(`  ... +${toUpdate.length - 40} more`);
}

if (onlyInDb.length) {
  console.log("\n=== DOAR ÎN DB (păstrăm) ===");
  for (const p of onlyInDb) {
    console.log(
      `  = [${p.floor}] Masa ${p.tableNumber}: ${p.lastName} ${p.firstName} <${p.email ?? "-"}>`,
    );
  }
}

if (ambiguous.length) {
  console.log("\n=== AMBIGUU ===");
  for (const a of ambiguous) {
    console.log(`  ? ${a.source.lastName} ${a.source.firstName}`, a.cands.map((c) => c.email));
  }
}

// Emailuri invalide în sursă
for (const p of [...urbanism, ...arhitectura]) {
  if (!p.email && p.source === "urbanism.xlsx") {
    // already logged as no email if creating
  }
}

if (dryRun) {
  console.log("\n[dry-run] Nu scriu nimic.");
} else {
  let created = 0;
  let updated = 0;

  // uniquify creates against existing + batch
  const usedKeys = new Set(existing.map(matchKey));
  const usedEmails = new Set(
    existing.map((p) => p.email?.toLowerCase()).filter(Boolean),
  );

  const createData = [];
  for (const p of toCreate) {
    let group = p.group;
    let k = `${normName(p.lastName)}|${normName(p.firstName)}|${group.toLowerCase()}`;
    // unique constraint uses firstName,lastName,group exact
    let uniq = `${p.firstName}\u0001${p.lastName}\u0001${group}`.toLowerCase();
    const existingUniq = new Set(
      [...existing, ...createData].map(
        (x) => `${x.firstName}\u0001${x.lastName}\u0001${x.group}`.toLowerCase(),
      ),
    );
    if (existingUniq.has(uniq) || usedKeys.has(matchKey({ ...p, group }))) {
      group = "";
      uniq = `${p.firstName}\u0001${p.lastName}\u0001`.toLowerCase();
      let n = 2;
      while (existingUniq.has(uniq)) {
        group = String(n);
        uniq = `${p.firstName}\u0001${p.lastName}\u0001${group}`.toLowerCase();
        n += 1;
      }
    }
    if (p.email && usedEmails.has(p.email.toLowerCase())) {
      console.warn(`  skip create email dup: ${p.email}`);
      continue;
    }
    if (p.email) usedEmails.add(p.email.toLowerCase());
    usedKeys.add(matchKey({ ...p, group: p.floor }));
    createData.push({
      eventId: event.id,
      firstName: p.firstName,
      lastName: p.lastName,
      ...(p.email ? { email: p.email } : {}),
      group,
      floor: p.floor,
      tableNumber: p.tableNumber,
      busReturn: p.busReturn,
      ...(p.menuType ? { menuType: p.menuType } : {}),
      teacher: false,
      qrToken: randomUUID(),
    });
  }

  if (createData.length) {
    const CHUNK = 300;
    for (let i = 0; i < createData.length; i += CHUNK) {
      const res = await prisma.participant.createMany({
        data: createData.slice(i, i + CHUNK),
      });
      created += res.count;
    }
  }

  for (const u of toUpdate) {
    await prisma.participant.update({ where: { id: u.id }, data: u.patch });
    updated += 1;
  }

  // refresh description
  await prisma.event.update({
    where: { id: event.id },
    data: {
      description: [
        "Bal UAUIM — 3 facultăți:",
        "• Interior — mesele 1–5",
        "• Urbanism — mesele 6–11",
        "• Arhitectura — mesele 12–32",
      ].join("\n"),
    },
  });

  const total = await prisma.participant.count({ where: { eventId: event.id } });
  console.log(`\nCreat: ${created}, actualizat: ${updated}, total acum: ${total}`);
}

await prisma.$disconnect();

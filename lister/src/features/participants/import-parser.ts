import * as XLSX from "xlsx";
import { participantImportRowSchema } from "@/features/participants/import-schema";

/** Normalizare cheie pentru mapare tolerantă între CSV/XLS și variante în română/engleză. */
export function normalizeHeaderLabel(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "");
}

/** Index coloană după liste de sinonime (compar după normalizeHeaderLabel). */
function columnIndex(headers: Map<string, number>, synonyms: string[]) {
  for (const s of synonyms) {
    const key = normalizeHeaderLabel(s);
    const idx = headers.get(key);
    if (typeof idx === "number") return idx;
  }
  return undefined;
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/** Acceptă DA/NU, true/false, 1/0 etc.; gol = false. */
export function coerceBoolean(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = coerceText(raw).toLowerCase();
  if (["da", "yes", "y", "true", "1", "x"].includes(s)) return true;
  if (["nu", "no", "n", "false", "0", ""].includes(s)) return false;
  return false;
}

const SYNONYMS = {
  firstName: ["First Name", "Prenume", "Given name", "FirstName"],
  lastName: ["Last Name", "Nume", "Surname", "LastName"],
  email: ["Email", "E-mail", "Mail", "Email Address"],
  phone: ["Phone", "Telefon", "Mobile", "Tel"],
  teacher: ["Teacher", "Profesor", "Instructor"],
  paid: ["Paid", "Platit", "Plătit", "Paid?"],
  group: ["Group", "Grupa", "Grupă", "Clasa", "Class", "Clasă"],
  fullName: ["Nume și Prenume", "Nume si Prenume", "Nume Prenume"],
  menu: ["Meniu Special / Restricții", "Meniu Special", "Meniu", "Restricții"],
  minor: ["Minor"],
};

const INITIALS_IN_NAME_RE =
  /^(\S+)\s+((?:[A-Za-zĂÂÎȘȚăâîșț]\.\s*)+)\s+(.+)$/;

function titleCaseWord(word: string): string {
  if (!word) return word;
  return word
    .split("-")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join("-");
}

/** Desparte „Nume și Prenume” din listele de clasă / profesori. */
export function splitFullName(fullName: string, isTeacherSheet: boolean) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };

  const initialsMatch = normalized.match(INITIALS_IN_NAME_RE);
  if (initialsMatch) {
    return {
      lastName: titleCaseWord(initialsMatch[1]!),
      firstName: titleCaseWord(initialsMatch[3]!),
    };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    const only = titleCaseWord(parts[0]!);
    return { firstName: only, lastName: only };
  }

  const isAllCaps = parts.every(
    (part) => part === part.toUpperCase() && /[A-ZĂÂÎȘȚ]/.test(part),
  );
  if (isAllCaps) {
    return {
      lastName: titleCaseWord(parts[0]!),
      firstName: titleCaseWord(parts.slice(1).join(" ")),
    };
  }

  if (isTeacherSheet && parts.length === 2) {
    return {
      firstName: titleCaseWord(parts[0]!),
      lastName: titleCaseWord(parts[1]!),
    };
  }

  return {
    lastName: titleCaseWord(parts[0]!),
    firstName: titleCaseWord(parts.slice(1).join(" ")),
  };
}

function parseMenuType(raw: string): "normal" | "vegetarian" | null {
  const s = coerceText(raw).toLowerCase();
  if (!s || s === "-") return null;
  if (s.includes("vegetari")) return "vegetarian";
  return "normal";
}

function parseSchoolLevel(raw: string): "minor" | "major" | null {
  const s = coerceText(raw).toLowerCase();
  if (!s || s === "-") return null;
  if (s === "da") return "minor";
  if (s === "nu") return "major";
  return null;
}

function buildHeaderIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const label = coerceText(cell);
    if (!label) return;
    const key = normalizeHeaderLabel(label);
    if (!map.has(key)) map.set(key, index);
  });
  return map;
}

function findHeaderRowIndex(rows: unknown[][], nameSynonyms: string[]) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const headers = buildHeaderIndex(rows[i]!);
    if (typeof columnIndex(headers, nameSynonyms) === "number") return i;
  }
  return -1;
}

function extractGroupFromBaSheet(rows: unknown[][], sheetName: string) {
  for (const row of rows.slice(0, 6)) {
    for (const cell of row) {
      const text = coerceText(cell);
      const match = text.match(/clasa\s+a\s+xii-a\s+([a-z])/i);
      if (match) return `12${match[1]!.toUpperCase()}`;
    }
  }
  const trimmed = sheetName.trim();
  if (/^[a-g]$/i.test(trimmed)) return `12${trimmed.toUpperCase()}`;
  return trimmed;
}

function isTeacherSheet(sheetName: string, rows: unknown[][]) {
  if (normalizeHeaderLabel(sheetName) === "profesori") return true;
  return rows.slice(0, 3).some((row) =>
    row.some((cell) => coerceText(cell).toLowerCase().includes("profesori")),
  );
}

function looksLikeStandardImport(rows: unknown[][]) {
  if (!rows.length) return false;
  const headers = buildHeaderIndex(rows[0]!);
  return (
    typeof columnIndex(headers, SYNONYMS.firstName) === "number" &&
    typeof columnIndex(headers, SYNONYMS.lastName) === "number"
  );
}

export type ParsedParticipantRow =
  import("@/features/participants/import-schema").ParticipantImportRow;

export type ParseOutcome =
  | { ok: true; rowNumber: number; data: ParsedParticipantRow }
  | { ok: false; rowNumber: number; errors: string[] };

function parseRowsMatrix(
  rows: unknown[][],
  /** Număr Excel-like al primului rând de date după header (în mod normal 2). */
  bodyStartExcelRowNumber: number,
): ParseOutcome[] {
  const outcomes: ParseOutcome[] = [];
  if (!rows.length) {
    outcomes.push({
      ok: false,
      rowNumber: bodyStartExcelRowNumber,
      errors: ["Fișier gol."],
    });
    return outcomes;
  }

  const headerRow = rows[0]!;
  const headers = buildHeaderIndex(headerRow);

  const firstIdx = columnIndex(headers, SYNONYMS.firstName);
  const lastIdx = columnIndex(headers, SYNONYMS.lastName);
  const emailIdx = columnIndex(headers, SYNONYMS.email);
  const phoneIdx = columnIndex(headers, SYNONYMS.phone);
  const teacherIdx = columnIndex(headers, SYNONYMS.teacher);
  const paidIdx = columnIndex(headers, SYNONYMS.paid);
  const groupIdx = columnIndex(headers, SYNONYMS.group);

  if (
    typeof firstIdx !== "number" ||
    typeof lastIdx !== "number" ||
    typeof emailIdx !== "number" ||
    typeof phoneIdx !== "number" ||
    typeof teacherIdx !== "number" ||
    typeof paidIdx !== "number"
  ) {
    outcomes.push({
      ok: false,
      rowNumber: 1,
      errors: [
        "Nu am găsit anteturi valide. Prima linie trebuie să conțină coloanele: First Name, Last Name, Email, Phone, Teacher, Paid (acceptăm și variante RO). Group/Clasă e opțional.",
      ],
    });
    return outcomes;
  }

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    const rowNumber = bodyStartExcelRowNumber + (r - 1);

    const allEmpty =
      row.every((c) => coerceText(c) === "") ||
      [firstIdx, lastIdx, emailIdx, phoneIdx, teacherIdx, paidIdx].every(
        (i) => coerceText(row[i]) === "",
      );
    if (allEmpty) continue;

    const firstName = coerceText(row[firstIdx]);
    const lastName = coerceText(row[lastIdx]);
    const emailRaw = coerceText(row[emailIdx]);
    const phoneRaw = coerceText(row[phoneIdx]);
    const teacher = coerceBoolean(row[teacherIdx]);
    const paid = coerceBoolean(row[paidIdx]);
    const groupRaw =
      typeof groupIdx === "number" ? coerceText(row[groupIdx]) : "";

    const candidate = participantImportRowSchema.safeParse({
      firstName,
      lastName,
      email: emailRaw,
      phone: phoneRaw,
      group: groupRaw,
      teacher,
      paid,
    });

    if (!candidate.success) {
      const flat = candidate.error.flatten().fieldErrors;
      const errors = [
        ...(flat.firstName ?? []),
        ...(flat.lastName ?? []),
        ...(flat.email ?? []),
        ...(flat.phone ?? []),
      ];
      outcomes.push({ ok: false, rowNumber, errors });
      continue;
    }

    outcomes.push({ ok: true, rowNumber, data: candidate.data });
  }

  return outcomes;
}

function parseBaClassListWorkbook(workbook: XLSX.WorkBook): ParseOutcome[] | null {
  const outcomes: ParseOutcome[] = [];
  let parsedSheets = 0;
  let totalDataRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    const headerRowIdx = findHeaderRowIndex(rows, SYNONYMS.fullName);
    if (headerRowIdx < 0) continue;

    parsedSheets += 1;
    const headerRow = rows[headerRowIdx]!;
    const headers = buildHeaderIndex(headerRow);
    const nameIdx = columnIndex(headers, SYNONYMS.fullName);
    const menuIdx = columnIndex(headers, SYNONYMS.menu);
    const minorIdx = columnIndex(headers, SYNONYMS.minor);

    if (typeof nameIdx !== "number") continue;

    const teacherSheet = isTeacherSheet(sheetName, rows);
    const group = teacherSheet ? "" : extractGroupFromBaSheet(rows, sheetName);

    for (let r = headerRowIdx + 1; r < rows.length; r += 1) {
      const row = rows[r]!;
      const fullName = coerceText(row[nameIdx]);
      if (!fullName || fullName === "-") continue;

      totalDataRows += 1;
      if (totalDataRows > MAX_ROWS) {
        return [
          {
            ok: false,
            rowNumber: r + 1,
            errors: [
              `Prea multe rânduri (max ${MAX_ROWS}). Împarte fișierul.`,
            ],
          },
        ];
      }

      const { firstName, lastName } = splitFullName(fullName, teacherSheet);
      const menuRaw = typeof menuIdx === "number" ? coerceText(row[menuIdx]) : "";
      const minorRaw = typeof minorIdx === "number" ? coerceText(row[minorIdx]) : "";

      const candidate = participantImportRowSchema.safeParse({
        firstName,
        lastName,
        email: "",
        phone: "",
        group,
        teacher: teacherSheet,
        paid: false,
        menuType: teacherSheet ? null : parseMenuType(menuRaw),
        schoolLevel: teacherSheet ? null : parseSchoolLevel(minorRaw),
      });

      const rowNumber = r + 1;
      if (!candidate.success) {
        const flat = candidate.error.flatten().fieldErrors;
        outcomes.push({
          ok: false,
          rowNumber,
          errors: [
            `Foaia „${sheetName}”, rând ${rowNumber}`,
            ...(flat.firstName ?? []),
            ...(flat.lastName ?? []),
          ],
        });
        continue;
      }

      outcomes.push({ ok: true, rowNumber, data: candidate.data });
    }
  }

  if (parsedSheets === 0) return null;
  return outcomes;
}

const MAX_ROWS = 50_000;

export function participantsFromSpreadsheet(_fileName: string, buffer: Buffer): ParseOutcome[] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [{ ok: false, rowNumber: 1, errors: ["Fișier fără foi de calcul."] }];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [{ ok: false, rowNumber: 1, errors: ["Nu pot citi foaia de calcul."] }];
  }

  const firstRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (firstRows.length > MAX_ROWS + 1) {
    return [
      {
        ok: false,
        rowNumber: 1,
        errors: [
          `Prea multe rânduri (max ${MAX_ROWS} plus antet). Împarte fișierul.`,
        ],
      },
    ];
  }

  if (looksLikeStandardImport(firstRows)) {
    return parseRowsMatrix(firstRows, 2);
  }

  const baOutcomes = parseBaClassListWorkbook(workbook);
  if (baOutcomes) return baOutcomes;

  return parseRowsMatrix(firstRows, 2);
}

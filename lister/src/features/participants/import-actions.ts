"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { participantsFromSpreadsheet } from "@/features/participants/import-parser";
import type { ParticipantImportRow } from "@/features/participants/import-schema";

export type ImportParticipantsState =
  | { status: "idle" }
  | {
      status: "success";
      created: number;
      skippedDuplicates: number;
      invalidCount: number;
      invalidSamples: { row: number; errors: string[] }[];
      totalParsedRows: number;
    }
  | { status: "error"; message: string };

const MAX_FILE_BYTES = 15 * 1024 * 1024;

type NormalizedImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  group: string;
  teacher: boolean;
  paid: boolean;
  menuType: "normal" | "vegetarian" | null;
  schoolLevel: "minor" | "major" | null;
};

function normalizeRow(
  rowNumber: number,
  data: ParticipantImportRow,
): NormalizedImportRow {
  return {
    rowNumber,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email,
    phone: data.phone,
    group: data.group?.trim() ?? "",
    teacher: data.teacher,
    paid: data.paid,
    menuType: data.menuType ?? null,
    schoolLevel: data.schoolLevel ?? null,
  };
}

export async function importParticipantsAction(
  _prev: ImportParticipantsState,
  formData: FormData,
): Promise<ImportParticipantsState> {
  await requireAdmin();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) {
    return { status: "error", message: "Eveniment invalid." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { status: "error", message: "Te rugăm să alegi un fișier .xlsx sau .csv." };
  }
  const nameLc = file.name.toLowerCase();
  if (!(nameLc.endsWith(".csv") || nameLc.endsWith(".xlsx") || nameLc.endsWith(".xls"))) {
    return {
      status: "error",
      message: "Format acceptat: CSV sau Excel (.xlsx / .xls).",
    };
  }
  if (file.size === 0) return { status: "error", message: "Fișier gol." };
  if (file.size > MAX_FILE_BYTES) {
    return {
      status: "error",
      message:
        "Fișier prea mare. Limita curentă este 15MB (creștem în next.config dacă ai nevoie).",
    };
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { status: "error", message: "Eveniment negăsit." };

  const buf = Buffer.from(await file.arrayBuffer());
  const outcomes = participantsFromSpreadsheet(file.name, buf);

  const invalidSamples: { row: number; errors: string[] }[] = [];
  let invalidCount = 0;
  const valid: NormalizedImportRow[] = [];

  for (const o of outcomes) {
    if (!o.ok) {
      invalidCount++;
      if (invalidSamples.length < 30) {
        invalidSamples.push({ row: o.rowNumber, errors: o.errors });
      }
      continue;
    }
    valid.push(normalizeRow(o.rowNumber, o.data));
  }

  const seenEmailInFile = new Set<string>();
  const seenPersonInFile = new Set<string>();
  const dedupedInFile: NormalizedImportRow[] = [];

  let skippedDuplicates = 0;

  const personKey = (r: NormalizedImportRow) =>
    `${r.firstName}\u0001${r.lastName}\u0001${r.group}`.toLowerCase();

  for (const r of valid) {
    const pk = personKey(r);
    if (seenPersonInFile.has(pk)) {
      skippedDuplicates++;
      continue;
    }
    if (r.email) {
      const key = r.email.toLowerCase();
      if (seenEmailInFile.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seenEmailInFile.add(key);
    }
    seenPersonInFile.add(pk);
    dedupedInFile.push(r);
  }

  const existingRows = await prisma.participant.findMany({
    where: { eventId },
    select: { firstName: true, lastName: true, group: true, email: true },
  });

  const existingPersonKeys = new Set(
    existingRows.map((p) =>
      `${p.firstName}\u0001${p.lastName}\u0001${p.group}`.toLowerCase(),
    ),
  );
  const existingEmails = new Set(
    existingRows
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e))
      .map((e) => e.toLowerCase()),
  );

  const toInsert: NormalizedImportRow[] = [];
  for (const r of dedupedInFile) {
    const em = r.email?.toLowerCase() ?? null;
    if (existingPersonKeys.has(personKey(r))) {
      skippedDuplicates++;
      continue;
    }
    if (em && existingEmails.has(em)) {
      skippedDuplicates++;
      continue;
    }
    toInsert.push(r);
  }

  const CHUNK = 300;
  let created = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    const res = await prisma.participant.createMany({
      data: slice.map((r) => ({
        eventId,
        firstName: r.firstName,
        lastName: r.lastName,
        ...(r.email ? { email: r.email } : {}),
        ...(r.phone ? { phone: r.phone } : {}),
        teacher: r.teacher,
        paid: r.paid,
        group: r.group ?? "",
        ...(r.menuType ? { menuType: r.menuType } : {}),
        ...(r.schoolLevel ? { schoolLevel: r.schoolLevel } : {}),
        qrToken: randomUUID(),
      })),
    });
    created += res.count;
  }

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/participants`);
  revalidatePath(`/admin/events/${eventId}/import`);

  return {
    status: "success",
    created,
    skippedDuplicates,
    invalidCount,
    invalidSamples,
    totalParsedRows: outcomes.length,
  };
}

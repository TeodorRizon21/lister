import QRCode from "qrcode";

/** Conținut codificat în QR — token opac, fără date personale. */
export function qrPayloadFromToken(qrToken: string): string {
  return qrToken;
}

export async function qrPngBuffer(
  payload: string,
  width = 512,
): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

export function safeQrFilename(
  firstName: string,
  lastName: string,
  index: number,
): string {
  const base = `${String(index).padStart(4, "0")}-${lastName}-${firstName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .slice(0, 80);
  return `${base}.png`;
}

export function slugifyForDownload(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "eveniment";
}

/** Nume sigur de folder în arhiva ZIP (clasă, categorie). */
export function safeFolderName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return base || "fara_clasa";
}

export function qrExportFolder(participant: {
  teacher: boolean;
  group: string;
}): string {
  if (participant.teacher) return "profesori";
  const group = participant.group.trim();
  if (!group) return "fara_clasa";
  return safeFolderName(group);
}

export function sortQrExportFolders(a: string, b: string): number {
  if (a === "profesori") return -1;
  if (b === "profesori") return 1;
  if (a === "fara_clasa") return 1;
  if (b === "fara_clasa") return -1;
  return a.localeCompare(b, "ro");
}

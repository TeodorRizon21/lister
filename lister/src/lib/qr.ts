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

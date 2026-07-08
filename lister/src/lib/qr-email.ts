import type { Prisma } from "@prisma/client";
import type { Event, Participant } from "@prisma/client";
import { qrPngBuffer } from "@/lib/qr";
import { createSmtpTransport, getSmtpFrom } from "@/lib/mail";

type ParticipantForEmail = Pick<
  Participant,
  | "id"
  | "firstName"
  | "lastName"
  | "email"
  | "qrToken"
  | "tableNumber"
  | "floor"
>;

type EventForEmail = Pick<Event, "title" | "startDate" | "location">;

export function pendingQrEmailWhere(eventId: string): Prisma.ParticipantWhereInput {
  return {
    eventId,
    email: { not: null },
    OR: [{ qrEmailSentAt: null }, { qrEmailSentAt: { isSet: false } }],
  };
}

export function buildQrEmailHtml(
  event: EventForEmail,
  participant: ParticipantForEmail,
) {
  const fullName = `${participant.firstName} ${participant.lastName}`.trim();
  const dateStr = event.startDate.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const masa = participant.tableNumber
    ? `<p style="font-size:18px;margin:16px 0"><strong>Masa ${participant.tableNumber}</strong>${participant.floor ? ` — ${participant.floor}` : ""}</p>`
    : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
    <h2 style="margin:0 0 8px">${event.title}</h2>
    <p style="color:#666;margin:0 0 20px">${dateStr}${event.location ? ` · ${event.location}` : ""}</p>
    <p>Salut, <strong>${fullName}</strong>!</p>
    <p>Acesta este biletul tău de acces. Prezintă codul QR de mai jos la intrare (îl poți arăta direct de pe telefon).</p>
    ${masa}
    <div style="text-align:center;margin:24px 0">
      <img src="cid:qrcode" alt="Cod QR acces" width="280" height="280" style="border:1px solid #eee;border-radius:12px" />
    </div>
    <p style="color:#666;font-size:13px">Codul este personal — te rugăm să nu îl distribui. Ne vedem la bal!</p>
  </div>`;
}

export async function sendParticipantQrEmail(
  event: EventForEmail,
  participant: ParticipantForEmail,
  options?: { to?: string; markSent?: boolean },
) {
  if (!participant.email && !options?.to) {
    throw new Error("Participant fără email.");
  }

  const to = options?.to ?? participant.email!;
  const png = await qrPngBuffer(participant.qrToken, 560);
  const transporter = createSmtpTransport();

  await transporter.sendMail({
    from: getSmtpFrom(),
    to,
    subject: `Biletul tău — ${event.title}`,
    html: buildQrEmailHtml(event, participant),
    attachments: [{ filename: "bilet-qr.png", content: png, cid: "qrcode" }],
  });

  return { to, markSent: options?.markSent !== false };
}

export const QR_EMAIL_BATCH_SIZE = 20;
export const QR_EMAIL_DELAY_MS = 400;

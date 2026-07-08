"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { isSmtpConfigured } from "@/lib/mail";
import {
  pendingQrEmailWhere,
  QR_EMAIL_BATCH_SIZE,
  QR_EMAIL_DELAY_MS,
  sendParticipantQrEmail,
} from "@/lib/qr-email";

export type SendQrEmailsState =
  | { status: "idle" }
  | {
      status: "success";
      sent: number;
      failed: number;
      remaining: number;
      message: string;
    }
  | { status: "error"; message: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendQrEmailsBatchAction(
  _prev: SendQrEmailsState,
  formData: FormData,
): Promise<SendQrEmailsState> {
  await requireAdmin();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) {
    return { status: "error", message: "Eveniment invalid." };
  }

  if (!isSmtpConfigured()) {
    return {
      status: "error",
      message:
        "SMTP neconfigurat. Adaugă SMTP_HOST, SMTP_USER, SMTP_PASS și SMTP_FROM în .env.",
    };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startDate: true, location: true },
  });
  if (!event) {
    return { status: "error", message: "Eveniment negăsit." };
  }

  const pending = await prisma.participant.findMany({
    where: pendingQrEmailWhere(eventId),
    orderBy: [{ tableNumber: "asc" }, { lastName: "asc" }],
    take: QR_EMAIL_BATCH_SIZE,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      qrToken: true,
      tableNumber: true,
      floor: true,
    },
  });

  if (pending.length === 0) {
    return {
      status: "success",
      sent: 0,
      failed: 0,
      remaining: 0,
      message: "Toate codurile QR au fost deja trimise pe email.",
    };
  }

  let sent = 0;
  let failed = 0;

  for (const participant of pending) {
    try {
      await sendParticipantQrEmail(event, participant);
      await prisma.participant.update({
        where: { id: participant.id },
        data: { qrEmailSentAt: new Date() },
      });
      sent += 1;
    } catch {
      failed += 1;
      if (failed >= 3 && sent === 0) break;
    }

    if (pending.length > 1) {
      await sleep(QR_EMAIL_DELAY_MS);
    }
  }

  const remaining = await prisma.participant.count({
    where: pendingQrEmailWhere(eventId),
  });

  revalidatePath(`/admin/events/${eventId}/participants`);

  if (sent === 0 && failed > 0) {
    return {
      status: "error",
      message:
        "Nu am putut trimite emailuri. Verifică setările SMTP și cota zilnică a providerului.",
    };
  }

  const message =
    remaining > 0
      ? `Trimise ${sent} emailuri. Mai rămân ${remaining} — apasă din nou pentru a continua.`
      : `Gata! Ultimele ${sent} emailuri au fost trimise.`;

  return {
    status: "success",
    sent,
    failed,
    remaining,
    message,
  };
}

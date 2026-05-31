"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrAdmin, requireAdmin } from "@/lib/auth/server";

export type CheckInResponse = {
  status: "success" | "already_checked_in" | "invalid_ticket" | "error";
  message: string;
  participant?: {
    firstName: string;
    lastName: string;
    group: string;
    eventId: string;
    eventTitle: string;
    checkedInAt: string | null;
  };
};

function normalizeQrToken(raw: string): string {
  return raw.trim();
}

export async function checkInByQrTokenAction(
  rawToken: string,
): Promise<CheckInResponse> {
  const { userId } = await requireStaffOrAdmin();
  const qrToken = normalizeQrToken(rawToken);

  if (!qrToken) {
    return {
      status: "invalid_ticket",
      message: "Cod QR invalid.",
    };
  }

  const participant = await prisma.participant.findUnique({
    where: { qrToken },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      group: true,
      checkedIn: true,
      checkedInAt: true,
      eventId: true,
      event: { select: { title: true } },
    },
  });

  if (!participant) {
    return {
      status: "invalid_ticket",
      message: "Bilet invalid — codul QR nu corespunde niciunui participant.",
    };
  }

  const participantInfo = {
    firstName: participant.firstName,
    lastName: participant.lastName,
    group: participant.group,
    eventId: participant.eventId,
    eventTitle: participant.event.title,
    checkedInAt: participant.checkedInAt?.toISOString() ?? null,
  };

  if (participant.checkedIn) {
    await prisma.checkInLog.create({
      data: {
        participantId: participant.id,
        scannedBy: userId,
        result: "already_checked_in",
      },
    });

    revalidatePath(`/admin/events/${participant.eventId}/participants`);
    revalidatePath("/scanner");

    return {
      status: "already_checked_in",
      message: `${participant.lastName} ${participant.firstName} — deja intrat.`,
      participant: participantInfo,
    };
  }

  const now = new Date();
  const updated = await prisma.participant.updateMany({
    where: { id: participant.id, checkedIn: false },
    data: { checkedIn: true, checkedInAt: now },
  });

  if (updated.count === 0) {
    const fresh = await prisma.participant.findUnique({
      where: { id: participant.id },
      select: { checkedInAt: true },
    });

    await prisma.checkInLog.create({
      data: {
        participantId: participant.id,
        scannedBy: userId,
        result: "already_checked_in",
      },
    });

    revalidatePath(`/admin/events/${participant.eventId}/participants`);
    revalidatePath("/scanner");

    return {
      status: "already_checked_in",
      message: `${participant.lastName} ${participant.firstName} — deja intrat.`,
      participant: {
        ...participantInfo,
        checkedInAt: fresh?.checkedInAt?.toISOString() ?? participantInfo.checkedInAt,
      },
    };
  }

  await prisma.checkInLog.create({
    data: {
      participantId: participant.id,
      scannedBy: userId,
      result: "success",
    },
  });

  revalidatePath(`/admin/events/${participant.eventId}/participants`);
  revalidatePath("/scanner");

  return {
    status: "success",
    message: `Check-in reușit — ${participant.lastName} ${participant.firstName}.`,
    participant: {
      ...participantInfo,
      checkedInAt: now.toISOString(),
    },
  };
}

export type ResetCheckInState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function resetCheckInAction(
  _prev: ResetCheckInState,
  formData: FormData,
): Promise<ResetCheckInState> {
  await requireAdmin();

  const participantId = String(formData.get("participantId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();

  if (!participantId || !eventId) {
    return { status: "error", message: "Date invalide." };
  }

  const participant = await prisma.participant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true, firstName: true, lastName: true, checkedIn: true },
  });

  if (!participant) {
    return { status: "error", message: "Participant negăsit." };
  }

  if (!participant.checkedIn) {
    return { status: "success", message: "Participantul nu era marcat ca intrat." };
  }

  await prisma.participant.update({
    where: { id: participant.id },
    data: { checkedIn: false, checkedInAt: null },
  });

  revalidatePath(`/admin/events/${eventId}/participants`);
  revalidatePath("/scanner");

  return {
    status: "success",
    message: `Check-in resetat — ${participant.lastName} ${participant.firstName}.`,
  };
}

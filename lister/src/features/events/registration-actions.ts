"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { hashRegistrationPassword } from "@/lib/registration-password";
import { registrationPath } from "@/lib/slug";
import { eventRegistrationSettingsSchema } from "@/features/events/registration-settings";

export type EventRegistrationSettingsState = {
  error?: string;
  success?: string;
  registrationUrl?: string;
};

export async function updateEventRegistrationAction(
  _prev: EventRegistrationSettingsState | undefined,
  formData: FormData,
): Promise<EventRegistrationSettingsState> {
  await requireAdmin();

  const parsed = eventRegistrationSettingsSchema.safeParse({
    eventId: formData.get("eventId"),
    registrationOpen: formData.get("registrationOpen"),
    registrationPassword: formData.get("registrationPassword"),
  });

  if (!parsed.success) {
    return { error: "Date invalide." };
  }

  const { eventId, registrationOpen, registrationPassword } = parsed.data;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { slug: true, registrationPasswordHash: true },
  });

  if (!event) {
    return { error: "Eveniment negăsit." };
  }

  const passwordTrim = registrationPassword?.trim() ?? "";
  let registrationPasswordHash = event.registrationPasswordHash;

  if (passwordTrim.length > 0) {
    if (passwordTrim.length < 4) {
      return { error: "Parola trebuie să aibă minim 4 caractere." };
    }
    registrationPasswordHash = await hashRegistrationPassword(passwordTrim);
  }

  if (!registrationPasswordHash) {
    return {
      error:
        "Setează o parolă pentru înscriere (minim 4 caractere) înainte de a activa linkul public.",
    };
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      registrationOpen,
      registrationPasswordHash,
    },
  });

  const registrationUrl = registrationPath(event.slug);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e/${event.slug}`);

  return {
    success: "Setările de înscriere au fost salvate.",
    registrationUrl,
  };
}

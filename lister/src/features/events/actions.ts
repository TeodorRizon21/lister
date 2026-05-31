"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/server";
import { eventInputSchema } from "@/features/events/schema";
import { createUniqueEventSlug } from "@/lib/slug";
import { hashRegistrationPassword } from "@/lib/registration-password";

export type EventFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"title" | "startDate" | "endDate", string>>;
};

function parseEventForm(formData: FormData) {
  return eventInputSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    location: formData.get("location") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
}

export async function createEventAction(
  _prevState: EventFormState | undefined,
  formData: FormData,
): Promise<EventFormState | undefined> {
  const { dbUser } = await requireAdmin();
  const parsed = parseEventForm(formData);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      error: "Date invalide. Verifica campurile obligatorii.",
      fieldErrors: {
        title: errors.title?.[0],
        startDate: errors.startDate?.[0],
        endDate: errors.endDate?.[0],
      },
    };
  }

  const slug = await createUniqueEventSlug(parsed.data.title);
  const regPassword = String(formData.get("registrationPassword") ?? "").trim();
  let registrationPasswordHash: string | null = null;
  if (regPassword.length >= 4) {
    registrationPasswordHash = await hashRegistrationPassword(regPassword);
  }

  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      createdBy: dbUser.id,
      slug,
      registrationPasswordHash,
      registrationOpen: true,
    },
  });

  revalidatePath("/admin/events");
  redirect(`/admin/events/${event.id}`);
}

export async function updateEventAction(
  _prevState: EventFormState | undefined,
  formData: FormData,
): Promise<EventFormState | undefined> {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  if (!eventId) {
    return { error: "Eveniment invalid." };
  }

  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      error: "Date invalide. Verifica campurile obligatorii.",
      fieldErrors: {
        title: errors.title?.[0],
        startDate: errors.startDate?.[0],
        endDate: errors.endDate?.[0],
      },
    };
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    },
  });

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}`);
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = String(formData.get("eventId") || "");
  if (!eventId) {
    redirect("/admin/events");
  }

  await prisma.event.delete({
    where: { id: eventId },
  });

  revalidatePath("/admin/events");
  redirect("/admin/events");
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRegistrationAccess,
  setRegistrationAccess,
} from "@/lib/registration-access";
import { verifyRegistrationPassword } from "@/lib/registration-password";
import { selfRegistrationSchema } from "@/features/registration/schema";

export type RegistrationPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string };

export type SelfRegisterState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          | "firstName"
          | "lastName"
          | "group"
          | "menuType"
          | "schoolLevel"
          | "parentalConsent",
          string
        >
      >;
    };

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      registrationOpen: true,
      registrationPasswordHash: true,
      endDate: true,
    },
  });
}

export async function verifyRegistrationPasswordAction(
  _prev: RegistrationPasswordState,
  formData: FormData,
): Promise<RegistrationPasswordState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!slug || !password) {
    return { status: "error", message: "Parola este obligatorie." };
  }

  const event = await getEventBySlug(slug);
  if (!event?.registrationPasswordHash) {
    return { status: "error", message: "Eveniment negăsit sau înscriere neconfigurată." };
  }
  if (!event.registrationOpen) {
    return { status: "error", message: "Înscrierile sunt închise." };
  }

  const ok = await verifyRegistrationPassword(
    password,
    event.registrationPasswordHash,
  );
  if (!ok) {
    return { status: "error", message: "Parolă incorectă." };
  }

  await setRegistrationAccess(event.id, slug);
  revalidatePath(`/e/${slug}`);
  return { status: "idle" };
}

export async function selfRegisterAction(
  _prev: SelfRegisterState,
  formData: FormData,
): Promise<SelfRegisterState> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return { status: "error", message: "Eveniment invalid." };
  }

  const event = await getEventBySlug(slug);
  if (!event) {
    return { status: "error", message: "Eveniment negăsit." };
  }
  if (!event.registrationPasswordHash) {
    return {
      status: "error",
      message: "Înscrierea online nu este configurată pentru acest eveniment.",
    };
  }
  if (!event.registrationOpen) {
    return { status: "error", message: "Înscrierile sunt închise." };
  }
  if (event.endDate < new Date()) {
    return { status: "error", message: "Evenimentul s-a încheiat." };
  }

  const hasAccess = await assertRegistrationAccess(event.id, slug);
  if (!hasAccess) {
    return {
      status: "error",
      message: "Introdu mai întâi parola evenimentului.",
    };
  }

  const parsed = selfRegistrationSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    group: formData.get("group"),
    menuType: formData.get("menuType"),
    schoolLevel: formData.get("schoolLevel"),
    parentalConsent: formData.get("parentalConsent"),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Verifică datele din formular.",
      fieldErrors: {
        firstName: flat.firstName?.[0],
        lastName: flat.lastName?.[0],
        group: flat.group?.[0],
        menuType: flat.menuType?.[0],
        schoolLevel: flat.schoolLevel?.[0],
        parentalConsent: flat.parentalConsent?.[0],
      },
    };
  }

  const { firstName, lastName, group, menuType, schoolLevel, parentalConsent } =
    parsed.data;

  const existing = await prisma.participant.findFirst({
    where: {
      eventId: event.id,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
      group: { equals: group, mode: "insensitive" },
    },
  });

  if (existing) {
    return {
      status: "error",
      message:
        "Există deja o înscriere cu același nume, prenume și clasă/grupă la acest eveniment.",
    };
  }

  try {
    await prisma.participant.create({
      data: {
        eventId: event.id,
        firstName,
        lastName,
        group,
        menuType,
        schoolLevel,
        parentalConsent: schoolLevel === "minor" ? Boolean(parentalConsent) : false,
        source: "self",
        qrToken: randomUUID(),
      },
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
    if (code === "P2002") {
      return {
        status: "error",
        message:
          "Există deja o înscriere cu aceleași date la acest eveniment.",
      };
    }
    throw e;
  }

  revalidatePath(`/e/${slug}`);
  revalidatePath(`/admin/events/${event.id}/participants`);

  return {
    status: "success",
    message:
      "Te-ai înscris cu succes! La intrare vei primi / folosi codul QR de check-in.",
  };
}

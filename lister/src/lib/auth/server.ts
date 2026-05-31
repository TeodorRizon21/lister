import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role, User } from "@prisma/client";
import type { User as ClerkUser } from "@clerk/nextjs/server";
import { isAdminRole, isStaffRole } from "@/lib/auth/roles";

function adminFromMetadata(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  if (m.isAdmin === true) return true;
  if (typeof m.role === "string" && m.role.toLowerCase() === "admin") return true;
  return false;
}

/** Clerk metadata sau JWT session claims — ex. `{ "isAdmin": true }`. */
export function isClerkAdmin(clerkUser: ClerkUser): boolean {
  return (
    adminFromMetadata(clerkUser.publicMetadata) ||
    adminFromMetadata(clerkUser.privateMetadata)
  );
}

export function isClerkAdminFromSessionClaims(
  claims: Record<string, unknown> | null | undefined,
): boolean {
  if (!claims) return false;
  if (claims.isAdmin === true) return true;
  if (adminFromMetadata(claims.publicMetadata)) return true;
  if (adminFromMetadata(claims.metadata)) return true;
  return false;
}

function parseStaffAllowlist(): Set<string> {
  const raw = process.env.STAFF_ALLOWED_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isEmailStaffAllowlisted(email: string): boolean {
  return parseStaffAllowlist().has(email.toLowerCase());
}

function resolveAppRole(options: {
  clerkIsAdmin: boolean;
  bootstrapAdmin: boolean;
  existingRole?: Role;
  email: string;
}): Role {
  if (options.clerkIsAdmin || options.bootstrapAdmin) return "admin";
  if (options.existingRole) return options.existingRole;
  if (isEmailStaffAllowlisted(options.email)) return "staff";
  return "pending";
}

export async function getSessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function getAppUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Upsert profil aplicație după autentificare Clerk; promovează la admin dacă Clerk/metadata sau DEFAULT_ADMIN_EMAIL. */
export async function syncUserFromAuth(): Promise<User | null> {
  const authState = await auth();
  const userId = authState.userId;
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) return null;

  const defaultAdmin = process.env.DEFAULT_ADMIN_EMAIL;
  const bootstrapAdmin = Boolean(
    defaultAdmin &&
      primaryEmail.toLowerCase() === defaultAdmin.toLowerCase(),
  );
  const clerkIsAdmin =
    isClerkAdmin(clerkUser) ||
    isClerkAdminFromSessionClaims(
      authState.sessionClaims as Record<string, unknown> | null,
    );

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    primaryEmail.split("@")[0] ||
    "User";

  const email = primaryEmail.toLowerCase();

  const existingById = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (existingById) {
    const role = resolveAppRole({
      clerkIsAdmin,
      bootstrapAdmin,
      existingRole: existingById.role,
      email,
    });
    return prisma.user.update({
      where: { id: userId },
      data: { email, fullName, role },
    });
  }

  const existingByEmail = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (existingByEmail && existingByEmail.id !== userId) {
    const role = resolveAppRole({
      clerkIsAdmin,
      bootstrapAdmin,
      existingRole: existingByEmail.role,
      email,
    });
    const oldId = existingByEmail.id;

    await prisma.$transaction([
      prisma.event.updateMany({
        where: { createdBy: oldId },
        data: { createdBy: userId },
      }),
      prisma.checkInLog.updateMany({
        where: { scannedBy: oldId },
        data: { scannedBy: userId },
      }),
      prisma.user.delete({ where: { id: oldId } }),
    ]);

    return prisma.user.create({
      data: {
        id: userId,
        email,
        fullName,
        role,
      },
    });
  }

  return prisma.user.create({
    data: {
      id: userId,
      email,
      fullName,
      role: resolveAppRole({ clerkIsAdmin, bootstrapAdmin, email }),
    },
  });
}

export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

export async function requireAdmin(): Promise<{ userId: string; dbUser: User }> {
  await syncUserFromAuth();
  const userId = await requireAuth();
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) redirect("/sign-in");
  if (!isAdminRole(dbUser.role)) {
    redirect(isStaffRole(dbUser.role) ? "/scanner" : "/access-denied");
  }
  return { userId, dbUser };
}

export async function requireStaffOrAdmin(): Promise<{
  userId: string;
  dbUser: User;
}> {
  await syncUserFromAuth();
  const userId = await requireAuth();
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) redirect("/sign-in");
  if (!isStaffRole(dbUser.role)) {
    redirect("/access-denied");
  }
  return { userId, dbUser };
}

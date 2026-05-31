import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncUserFromAuth } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/auth/roles";

export type ApiAuthSuccess = { userId: string; dbUser: User };
export type ApiAuthResult =
  | { ok: true; auth: ApiAuthSuccess }
  | { ok: false; response: NextResponse };

export async function authorizeAdminApi(): Promise<ApiAuthResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Neautentificat." }, { status: 401 }),
    };
  }

  await syncUserFromAuth();
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || !isAdminRole(dbUser.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Acces interzis." }, { status: 403 }),
    };
  }

  return { ok: true, auth: { userId, dbUser } };
}

import type { ReactNode } from "react";
import { backfillMissingEventSlugs } from "@/lib/backfill-event-slugs";
import { requireAdmin } from "@/lib/auth/server";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await backfillMissingEventSlugs();
  const { dbUser } = await requireAdmin();

  return <AdminShell dbUser={dbUser}>{children}</AdminShell>;
}

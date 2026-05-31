import type { ReactNode } from "react";
import { requireStaffOrAdmin } from "@/lib/auth/server";

export default async function ScannerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireStaffOrAdmin();
  return children;
}

import Link from "next/link";
import { requireStaffOrAdmin } from "@/lib/auth/server";
import { ClerkSignOutButton } from "@/components/auth/clerk-sign-out-button";
import { ScannerPanel } from "@/components/scanner/scanner-panel";

export default async function ScannerPage() {
  const { dbUser } = await requireStaffOrAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-3">
        <h1 className="flex-1 text-base font-semibold">Scanner check-in</h1>
        {dbUser.role === "admin" ? (
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
          >
            Panou admin
          </Link>
        ) : null}
        <ClerkSignOutButton variant="secondary" />
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-muted">
          Conectat ca{" "}
          <strong className="text-foreground">{dbUser.fullName}</strong> (
          {dbUser.role === "admin" ? "admin" : "staff"}).
        </p>
        <ScannerPanel />
      </div>
    </div>
  );
}

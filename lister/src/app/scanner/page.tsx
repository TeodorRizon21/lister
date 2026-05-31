import Link from "next/link";
import { requireStaffOrAdmin } from "@/lib/auth/server";
import { Card } from "@/components/ui/card";
import { ClerkSignOutButton } from "@/components/auth/clerk-sign-out-button";

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

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Card>
          <p className="text-sm text-muted">
            Conectat ca <strong className="text-foreground">{dbUser.fullName}</strong>
            ({dbUser.role === "admin" ? "admin" : "staff"}).
          </p>
          <p className="mt-3 text-sm text-muted">
            Interfața camera + <code className="text-foreground">html5-qrcode</code> vor fi
            adăugate în pasul „scanner system”. Flow-ul API: token opac → validare
            server → check-in idempotent cu mesaje „Already checked in” / „Invalid
            ticket”.
          </p>
        </Card>
      </div>
    </div>
  );
}

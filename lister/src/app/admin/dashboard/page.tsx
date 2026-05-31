import Link from "next/link";
import { Card } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <h2 className="text-base font-semibold">Start rapid</h2>
        <p className="mt-2 text-sm text-muted">
          Schema bazei, autentificarea și layout-ul sunt pregătite. Următorii
          pași: CRUD pentru evenimente, import Excel, generare QR și endpoint
          check-in cu rate limiting.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/events"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Evenimente
          </Link>
          <Link
            href="/scanner"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-background/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Deschide scanner
          </Link>
        </div>
      </Card>
    </div>
  );
}

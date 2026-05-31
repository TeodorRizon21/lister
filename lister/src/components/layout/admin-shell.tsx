import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ClerkSignOutButton } from "@/components/auth/clerk-sign-out-button";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/events", label: "Evenimente" },
  { href: "/admin/analytics", label: "Analiză" },
  { href: "/admin/staff", label: "Personal" },
] as const;

export function AdminShell({
  dbUser,
  children,
}: {
  dbUser: User;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/50 p-4 md:flex">
        <div className="mb-6 px-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Lister
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {dbUser.fullName}
          </p>
          <p className="truncate text-xs text-muted">{dbUser.email}</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Navigare admin">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/scanner"
            className="mt-4 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-accent/10"
          >
            Scanner QR
          </Link>
        </nav>

        <div className="mt-auto pt-4">
          <ClerkSignOutButton variant="ghost" className="w-full" />
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="flex w-full min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-3 md:hidden">
          <p className="flex-1 text-sm font-semibold">Admin</p>
          <Link
            href="/scanner"
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
          >
            Scanner
          </Link>
          <ClerkSignOutButton variant="secondary" className="px-3 py-2" label="Ieși" />
        </header>

        <header className="hidden border-b border-border bg-card/80 px-8 py-4 md:flex">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Panou administrare
            </h1>
            <p className="text-sm text-muted">
              Evenimente, participanți și rapoarte
            </p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

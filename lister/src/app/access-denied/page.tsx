import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ClerkSignOutButton } from "@/components/auth/clerk-sign-out-button";
import { getAppUser, syncUserFromAuth } from "@/lib/auth/server";
import { isStaffRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export default async function AccessDeniedPage() {
  await syncUserFromAuth();
  const user = await getAppUser();

  if (user && isStaffRole(user.role)) {
    redirect(user.role === "admin" ? "/admin/dashboard" : "/scanner");
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 p-8">
      <Card>
        <h1 className="text-xl font-semibold">Acces neaprobat</h1>
        <p className="mt-3 text-sm text-muted">
          Contul tău este autentificat, dar nu are încă permisiuni în Lister
          (scanner sau administrare). Contactează un administrator al evenimentului
          pentru a primi rolul <strong className="text-foreground">staff</strong> sau{" "}
          <strong className="text-foreground">admin</strong>.
        </p>
        {user ? (
          <p className="mt-2 text-sm text-muted">
            Conectat ca <strong className="text-foreground">{user.fullName}</strong> (
            {user.email}).
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <ClerkSignOutButton />
          <Link
            href="/sign-in"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Alt cont
          </Link>
        </div>
      </Card>
    </div>
  );
}

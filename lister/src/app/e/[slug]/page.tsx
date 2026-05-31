import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RegistrationPasswordForm } from "@/components/registration/registration-password-form";
import { SelfRegisterForm } from "@/components/registration/self-register-form";
import { hasRegistrationAccess } from "@/lib/registration-access";
import { prisma } from "@/lib/prisma";

export default async function EventRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startDate: true,
      endDate: true,
      registrationOpen: true,
      registrationPasswordHash: true,
    },
  });

  if (!event) notFound();

  const configured = Boolean(event.registrationPasswordHash);
  const closed = !event.registrationOpen;
  const ended = event.endDate < new Date();
  const hasAccess =
    configured && !closed && !ended
      ? await hasRegistrationAccess(event.id, slug)
      : false;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 p-4 py-8 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Înscriere eveniment
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {event.title}
        </h1>
        {event.location ? (
          <p className="mt-1 text-sm text-muted">{event.location}</p>
        ) : null}
        <p className="mt-2 text-sm text-muted">
          {event.startDate.toLocaleString("ro-RO")}
          {event.endDate ? ` — ${event.endDate.toLocaleString("ro-RO")}` : ""}
        </p>
        {event.description ? (
          <p className="mt-3 text-sm text-muted">{event.description}</p>
        ) : null}
      </header>

      <Card>
        {!configured ? (
          <p className="text-sm text-muted">
            Înscrierea online nu este încă activă. Contactează organizatorii.
          </p>
        ) : closed ? (
          <p className="text-sm text-muted">Înscrierile sunt închise momentan.</p>
        ) : ended ? (
          <p className="text-sm text-muted">Evenimentul s-a încheiat.</p>
        ) : hasAccess ? (
          <>
            <h2 className="text-base font-semibold">Formular înscriere</h2>
            <p className="mt-1 text-sm text-muted">
              Completează datele. Nu se permit înscrieri duplicate (același nume,
              prenume și clasă/grupă).
            </p>
            <div className="mt-4">
              <SelfRegisterForm slug={slug} />
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold">Acces protejat</h2>
            <div className="mt-4">
              <RegistrationPasswordForm slug={slug} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

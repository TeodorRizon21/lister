import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteEventAction, updateEventAction } from "@/features/events/actions";
import { EventRegistrationSettings } from "@/components/events/event-registration-settings";
import { registrationPath } from "@/lib/slug";
import { prisma } from "@/lib/prisma";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  if (!event) {
    notFound();
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const fullRegistrationUrl = `${proto}://${host}${registrationPath(event.slug)}`;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Card>
        <h2 className="text-base font-semibold">{event.title}</h2>
        <p className="mt-2 text-sm text-muted">
          Interval: {event.startDate.toLocaleString("ro-RO")} -{" "}
          {event.endDate.toLocaleString("ro-RO")}
        </p>
        <p className="mt-1 text-sm text-muted">Participanti: {event._count.participants}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/admin/events/${id}/participants`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Participanti
          </Link>
          <Link
            href={`/admin/events/${id}/import`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Import
          </Link>
          <Link
            href={`/admin/events/${id}/qr`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Export QR
          </Link>
        </div>
      </Card>

      <EventRegistrationSettings
        eventId={event.id}
        slug={event.slug}
        registrationOpen={event.registrationOpen}
        hasPassword={Boolean(event.registrationPasswordHash)}
        publicUrl={fullRegistrationUrl}
      />

      <EventForm
        title="Editeaza eveniment"
        submitLabel="Salveaza modificarile"
        action={updateEventAction}
        defaults={{
          eventId: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          startDate: event.startDate,
          endDate: event.endDate,
        }}
      />

      <Card>
        <h3 className="text-sm font-semibold text-destructive">Zona periculoasa</h3>
        <p className="mt-2 text-sm text-muted">
          Stergerea evenimentului va elimina si participantii + logurile de check-in.
        </p>
        <form action={deleteEventAction} className="mt-4">
          <input type="hidden" name="eventId" value={event.id} />
          <Button type="submit" variant="danger">
            Sterge eveniment
          </Button>
        </form>
      </Card>
    </div>
  );
}

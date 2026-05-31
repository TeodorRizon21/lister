import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ImportParticipantsForm } from "@/components/participants/import-participants-form";

export default async function EventImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true },
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/admin/events/${id}`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Înapoi la eveniment
        </Link>
        <Link
          href={`/admin/events/${id}/participants`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Lista participanti
        </Link>
      </div>

      <Card>
        <h2 className="text-base font-semibold">
          Import participanți — {event.title}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Incarca CSV sau Excel. Procesarea e pe server cu validare; duplicate dupa email
          in cadrul aceluiasi eveniment sunt ignorate automat.
        </p>
      </Card>

      <Card>
        <ImportParticipantsForm eventId={event.id} />
      </Card>
    </div>
  );
}

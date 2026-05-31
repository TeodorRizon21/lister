import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { startDate: "desc" },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Evenimente</h2>
        <Link
          href="/admin/events/new"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          Eveniment nou
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Nu exista evenimente momentan. Creeaza primul eveniment.
          </p>
        </Card>
      ) : (
        events.map((event) => (
          <Card key={event.id}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{event.title}</h3>
                <p className="text-sm text-muted">
                  {event.startDate.toLocaleString("ro-RO")} -{" "}
                  {event.endDate.toLocaleString("ro-RO")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Participanti: {event._count.participants}
                </p>
              </div>
              <Link
                href={`/admin/events/${event.id}`}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
              >
                Detalii
              </Link>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

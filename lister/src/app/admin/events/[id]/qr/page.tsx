import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function EventQrExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      _count: { select: { participants: true } },
    },
  });

  if (!event) notFound();

  const count = event._count.participants;
  const exportUrl = `/api/admin/events/${id}/qr-export`;

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
          Lista participanți
        </Link>
        <Link
          href={`/admin/events/${id}/import`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Import
        </Link>
      </div>

      <Card>
        <h2 className="text-base font-semibold">Export coduri QR — {event.title}</h2>
        <p className="mt-2 text-sm text-muted">
          Fiecare participant are un token unic (<code className="text-foreground">qrToken</code>
          ). Codurile QR conțin doar acest token — fără date personale. Scannerul va
          valida tokenul pe server la check-in.
        </p>
        <p className="mt-2 text-sm text-muted">
          Participanți în eveniment: <strong className="text-foreground">{count}</strong>
        </p>

        {count === 0 ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Importă mai întâi participanții din{" "}
            <Link
              href={`/admin/events/${id}/import`}
              className="font-medium underline underline-offset-4"
            >
              pagina de import
            </Link>
            .
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href={exportUrl} className="inline-flex">
              <Button type="button">Descarcă ZIP cu PNG-uri QR</Button>
            </a>
            <p className="text-xs text-muted">
              Fișiere denumite <span className="text-foreground">0001-Nume-Prenume.png</span>
              , sortate alfabetic după nume.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">Flux recomandat</h3>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted">
          <li>Creează evenimentul (titlu, date, locație).</li>
          <li>
            Importă tabelul CSV/Excel cu coloanele: First Name, Last Name, Email,
            Phone, Teacher, Paid.
          </li>
          <li>Verifică lista de participanți.</li>
          <li>Descarcă arhiva ZIP și tipărește sau distribuie codurile QR.</li>
        </ol>
      </Card>
    </div>
  );
}

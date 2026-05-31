import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 50;

export default async function EventParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!event) notFound();

  const where = {
    eventId: id,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, participants, checkedInCount] = await Promise.all([
    prisma.participant.count({ where }),
    prisma.participant.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        group: true,
        email: true,
        phone: true,
        menuType: true,
        schoolLevel: true,
        source: true,
        teacher: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
      },
    }),
    prisma.participant.count({
      where: { eventId: id, checkedIn: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return `/admin/events/${id}/participants${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/admin/events/${id}`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Înapoi la eveniment
        </Link>
        <Link
          href={`/admin/events/${id}/import`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Import
        </Link>
        <Link
          href={`/admin/events/${id}/qr`}
          className="text-muted underline-offset-4 hover:underline"
        >
          Export QR
        </Link>
      </div>

      <Card>
        <h2 className="text-base font-semibold">Participanți — {event.title}</h2>
        <p className="mt-2 text-sm text-muted">
          {total} în listă
          {q ? ` (filtru: „${q}”)` : ""} · {checkedInCount} check-in efectuat
        </p>

        <form method="get" className="mt-4 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Caută nume, email, telefon…"
            className="min-w-[200px] flex-1"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            Caută
          </button>
          {q ? (
            <Link
              href={`/admin/events/${id}/participants`}
              className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm text-muted underline-offset-4 hover:underline"
            >
              Resetează
            </Link>
          ) : null}
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {participants.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            {q
              ? "Niciun rezultat pentru căutare."
              : "Niciun participant. Importă un fișier CSV sau Excel."}
          </p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Nume</th>
                <th className="px-4 py-3 font-medium">Clasă</th>
                <th className="px-4 py-3 font-medium">Meniu</th>
                <th className="px-4 py-3 font-medium">Liceu</th>
                <th className="px-4 py-3 font-medium">Sursă</th>
                <th className="px-4 py-3 font-medium">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {p.lastName} {p.firstName}
                  </td>
                  <td className="px-4 py-3 text-muted">{p.group || "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {p.menuType === "vegetarian"
                      ? "Vegetarian"
                      : p.menuType === "normal"
                        ? "Normal"
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.schoolLevel === "minor"
                      ? "Minor"
                      : p.schoolLevel === "major"
                        ? "Major"
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.source === "self" ? "Online" : "Import"}
                  </td>
                  <td className="px-4 py-3">
                    {p.checkedIn ? (
                      <span className="text-foreground">
                        Da
                        {p.checkedInAt
                          ? ` · ${p.checkedInAt.toLocaleString("ro-RO")}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-muted">Nu</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            Pagina {safePage} din {totalPages}
          </p>
          <div className="flex gap-2">
            {safePage > 1 ? (
              <Link
                href={pageHref(safePage - 1)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 font-medium"
              >
                Înapoi
              </Link>
            ) : null}
            {safePage < totalPages ? (
              <Link
                href={pageHref(safePage + 1)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 font-medium"
              >
                Înainte
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

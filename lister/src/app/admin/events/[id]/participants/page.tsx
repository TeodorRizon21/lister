import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResetCheckInButton } from "@/components/participants/reset-check-in-button";
import { SendQrEmailsPanel } from "@/components/participants/send-qr-emails-panel";
import { cn } from "@/lib/utils";
import { isSmtpConfigured } from "@/lib/mail";
import { pendingQrEmailWhere } from "@/lib/qr-email";

const PAGE_SIZE = 50;
const PROFESORI_FILTER = "yes";
const ELEVI_FILTER = "no";

const MENU_LABELS: Record<string, string> = {
  normal: "Normal",
  vegetarian: "Vegetarian",
  no_pork: "Fără porc",
  no_pork_no_beef: "Fără porc și vită",
};

type ParticipantFilters = {
  q: string;
  group: string;
  checkedIn: "" | "yes" | "no";
  teacher: "" | "yes" | "no";
  bus: "" | "yes" | "no";
  page: number;
};

function parseFilters(sp: {
  page?: string;
  q?: string;
  group?: string;
  checkedIn?: string;
  teacher?: string;
  bus?: string;
  status?: string;
}): ParticipantFilters {
  const checkedIn =
    sp.checkedIn === "yes" || sp.checkedIn === "no" ? sp.checkedIn : "";
  const bus = sp.bus === "yes" || sp.bus === "no" ? sp.bus : "";

  let teacher: ParticipantFilters["teacher"] = "";
  if (sp.teacher === "yes" || sp.teacher === "no") {
    teacher = sp.teacher;
  } else if (sp.status === "teacher") {
    teacher = "yes";
  } else if (sp.status === "student") {
    teacher = "no";
  }

  return {
    q: (sp.q ?? "").trim(),
    group: (sp.group ?? "").trim(),
    checkedIn,
    teacher,
    bus,
    page: Math.max(1, Number(sp.page) || 1),
  };
}

function buildWhere(eventId: string, filters: ParticipantFilters) {
  return {
    eventId,
    ...(filters.q
      ? {
          OR: [
            { firstName: { contains: filters.q, mode: "insensitive" as const } },
            { lastName: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
            { phone: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.group
      ? { group: { equals: filters.group, mode: "insensitive" as const } }
      : {}),
    ...(filters.checkedIn === "yes"
      ? { checkedIn: true }
      : filters.checkedIn === "no"
        ? { checkedIn: false }
        : {}),
    ...(filters.teacher === "yes"
      ? { teacher: true }
      : filters.teacher === "no"
        ? { teacher: false }
        : {}),
    ...(filters.bus === "yes"
      ? { busReturn: true }
      : filters.bus === "no"
        ? { busReturn: false }
        : {}),
  };
}

function pageHref(eventId: string, filters: ParticipantFilters, nextPage: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.group) params.set("group", filters.group);
  if (filters.checkedIn) params.set("checkedIn", filters.checkedIn);
  if (filters.teacher) params.set("teacher", filters.teacher);
  if (filters.bus) params.set("bus", filters.bus);
  if (nextPage > 1) params.set("page", String(nextPage));
  const qs = params.toString();
  return `/admin/events/${eventId}/participants${qs ? `?${qs}` : ""}`;
}

const selectClassName =
  "min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 text-sm";

export default async function EventParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    group?: string;
    checkedIn?: string;
    teacher?: string;
    bus?: string;
    status?: string;
  }>;
}) {
  const { id } = await params;
  const filters = parseFilters(await searchParams);

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!event) notFound();

  const where = buildWhere(id, filters);

  const [total, participants, totalAll, checkedInCount, notCheckedInCount, busReturnCount, busNoCount, groupRows, groupCounts, teacherCount, studentCount, pendingEmailCount, sentEmailCount] =
    await Promise.all([
    prisma.participant.count({ where }),
    prisma.participant.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        group: true,
        floor: true,
        tableNumber: true,
        email: true,
        phone: true,
        menuType: true,
        schoolLevel: true,
        source: true,
        teacher: true,
        paid: true,
        checkedIn: true,
        checkedInAt: true,
        qrEmailSentAt: true,
        busReturn: true,
      },
    }),
    prisma.participant.count({ where: { eventId: id } }),
    prisma.participant.count({
      where: { eventId: id, checkedIn: true },
    }),
    prisma.participant.count({
      where: { eventId: id, checkedIn: false },
    }),
    prisma.participant.count({
      where: { eventId: id, busReturn: true },
    }),
    prisma.participant.count({
      where: { eventId: id, busReturn: false },
    }),
    prisma.participant.findMany({
      where: { eventId: id, group: { not: "" }, teacher: false },
      select: { group: true },
      distinct: ["group"],
      orderBy: { group: "asc" },
    }),
    prisma.participant.groupBy({
      by: ["group"],
      where: { eventId: id, group: { not: "" } },
      _count: { _all: true },
    }),
    prisma.participant.count({
      where: { eventId: id, teacher: true },
    }),
    prisma.participant.count({
      where: { eventId: id, teacher: false },
    }),
    prisma.participant.count({
      where: pendingQrEmailWhere(id),
    }),
    prisma.participant.count({
      where: {
        eventId: id,
        email: { not: null },
        qrEmailSentAt: { not: null },
      },
    }),
  ]);

  const groups = groupRows
    .map((row) => row.group)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ro"));

  const groupCountMap = new Map(
    groupCounts.map((row) => [row.group, row._count._all]),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(filters.page, totalPages);
  const hasActiveFilters =
    Boolean(filters.q) ||
    Boolean(filters.group) ||
    Boolean(filters.checkedIn) ||
    Boolean(filters.teacher) ||
    Boolean(filters.bus);

  type ActiveFilterChip = { key: string; label: string; count: number };

  const activeFilterChips: ActiveFilterChip[] = [];
  if (filters.q) {
    activeFilterChips.push({
      key: "q",
      label: `Căutare „${filters.q}"`,
      count: total,
    });
  }
  if (filters.group) {
    activeFilterChips.push({
      key: "group",
      label: filters.group,
      count: groupCountMap.get(filters.group) ?? total,
    });
  }
  if (filters.teacher === "yes") {
    activeFilterChips.push({
      key: "teacher-yes",
      label: "Profesori",
      count: teacherCount,
    });
  }
  if (filters.teacher === "no") {
    activeFilterChips.push({
      key: "teacher-no",
      label: "Elevi",
      count: studentCount,
    });
  }
  if (filters.checkedIn === "yes") {
    activeFilterChips.push({
      key: "checkedIn-yes",
      label: "Intrați",
      count: checkedInCount,
    });
  }
  if (filters.checkedIn === "no") {
    activeFilterChips.push({
      key: "checkedIn-no",
      label: "Neintrați",
      count: notCheckedInCount,
    });
  }
  if (filters.bus === "yes") {
    activeFilterChips.push({
      key: "bus-yes",
      label: "Cu autocar",
      count: busReturnCount,
    });
  }
  if (filters.bus === "no") {
    activeFilterChips.push({
      key: "bus-no",
      label: "Fără autocar",
      count: busNoCount,
    });
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

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
            Total {totalAll}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
            Autocar {busReturnCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted">
            Fără autocar {busNoCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
            Check-in {checkedInCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted">
            Neintrați {notCheckedInCount}
          </span>
          {hasActiveFilters ? (
            <span className="inline-flex items-center rounded-full border border-foreground/20 bg-foreground/5 px-3 py-1 text-xs font-semibold">
              Rezultate filtru {total}
            </span>
          ) : null}
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted"
              >
                <span>{chip.label}</span>
                <span className="font-semibold text-foreground">{chip.count}</span>
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-2 text-sm text-muted">
          {hasActiveFilters
            ? `${total} participanți după filtre (din ${totalAll} total)`
            : `${totalAll} participanți înscriși`}
        </p>

        <form method="get" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder="Caută nume, email, telefon…"
              className="min-w-[200px] flex-1"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              name="group"
              defaultValue={filters.group}
              className={cn(selectClassName, "min-w-[160px] flex-1")}
            >
              <option value="">Toate clasele / mesele ({totalAll})</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group} ({groupCountMap.get(group) ?? 0})
                </option>
              ))}
            </select>

            <select
              name="teacher"
              defaultValue={filters.teacher}
              className={cn(selectClassName, "min-w-[160px]")}
            >
              <option value="">Profesori: toți ({totalAll})</option>
              <option value={PROFESORI_FILTER}>
                Doar profesori ({teacherCount})
              </option>
              <option value={ELEVI_FILTER}>Doar elevi ({studentCount})</option>
            </select>

            <select
              name="checkedIn"
              defaultValue={filters.checkedIn}
              className={cn(selectClassName, "min-w-[160px]")}
            >
              <option value="">Check-in: toți ({totalAll})</option>
              <option value="yes">Intrați ({checkedInCount})</option>
              <option value="no">Neintrați ({notCheckedInCount})</option>
            </select>

            <select
              name="bus"
              defaultValue={filters.bus}
              className={cn(selectClassName, "min-w-[160px]")}
            >
              <option value="">Autocar: toți ({totalAll})</option>
              <option value="yes">Cu autocar ({busReturnCount})</option>
              <option value="no">Fără autocar ({busNoCount})</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              Aplică filtre
            </button>
            {hasActiveFilters ? (
              <Link
                href={`/admin/events/${id}/participants`}
                className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm text-muted underline-offset-4 hover:underline"
              >
                Resetează
              </Link>
            ) : null}
          </div>
        </form>

        <SendQrEmailsPanel
          eventId={id}
          pendingCount={pendingEmailCount}
          sentCount={sentEmailCount}
          smtpConfigured={isSmtpConfigured()}
        />
      </Card>

      <Card className="overflow-x-auto p-0">
        {participants.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            {hasActiveFilters
              ? "Niciun rezultat pentru filtrele selectate."
              : "Niciun participant. Importă un fișier CSV sau Excel."}
          </p>
        ) : (
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Nume</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Clasă / Masă</th>
                <th className="px-4 py-3 font-medium">Autocar</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Meniu</th>
                <th className="px-4 py-3 font-medium">Liceu</th>
                <th className="px-4 py-3 font-medium">Sursă</th>
                <th className="px-4 py-3 font-medium">Email QR</th>
                <th className="px-4 py-3 font-medium">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {p.lastName} {p.firstName}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted" title={p.email ?? undefined}>
                    {p.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.tableNumber
                      ? `Masa ${p.tableNumber}${p.floor ? ` · ${p.floor}` : ""}`
                      : p.group || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.busReturn ? "Da" : "Nu"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.teacher ? "Profesor" : "Elev"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.menuType ? (MENU_LABELS[p.menuType] ?? p.menuType) : "—"}
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
                  <td className="px-4 py-3 text-muted">
                    {!p.email
                      ? "Fără email"
                      : p.qrEmailSentAt
                        ? `Trimis · ${p.qrEmailSentAt.toLocaleDateString("ro-RO")}`
                        : "Netrimis"}
                  </td>
                  <td className="px-4 py-3">
                    {p.checkedIn ? (
                      <div>
                        <span className="text-foreground">
                          Da
                          {p.checkedInAt
                            ? ` · ${p.checkedInAt.toLocaleString("ro-RO")}`
                            : ""}
                        </span>
                        <ResetCheckInButton
                          participantId={p.id}
                          eventId={id}
                          participantName={`${p.lastName} ${p.firstName}`}
                        />
                      </div>
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
                href={pageHref(id, filters, safePage - 1)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 font-medium"
              >
                Înapoi
              </Link>
            ) : null}
            {safePage < totalPages ? (
              <Link
                href={pageHref(id, filters, safePage + 1)}
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

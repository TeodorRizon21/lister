import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import {
  qrPayloadFromToken,
  qrPngBuffer,
  safeQrFilename,
  slugifyForDownload,
} from "@/lib/qr";

const MAX_EXPORT = 5_000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || dbUser.role !== "admin") {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const { eventId } = await context.params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Eveniment negăsit." }, { status: 404 });
  }

  const count = await prisma.participant.count({ where: { eventId } });
  if (count === 0) {
    return NextResponse.json(
      { error: "Nu există participanți. Importă mai întâi un fișier." },
      { status: 400 },
    );
  }
  if (count > MAX_EXPORT) {
    return NextResponse.json(
      {
        error: `Prea mulți participanți (${count}). Limita exportului este ${MAX_EXPORT}.`,
      },
      { status: 400 },
    );
  }

  const participants = await prisma.participant.findMany({
    where: { eventId },
    select: { firstName: true, lastName: true, qrToken: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const zip = new JSZip();
  let index = 0;
  for (const p of participants) {
    index += 1;
    const png = await qrPngBuffer(qrPayloadFromToken(p.qrToken));
    zip.file(safeQrFilename(p.firstName, p.lastName, index), png);
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `qr-${slugifyForDownload(event.title)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

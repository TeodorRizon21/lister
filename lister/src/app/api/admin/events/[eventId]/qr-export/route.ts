import { NextResponse } from "next/server";
import JSZip from "jszip";
import { authorizeAdminApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import {
  qrExportFolder,
  qrPayloadFromToken,
  qrPngBuffer,
  safeQrFilename,
  slugifyForDownload,
  sortQrExportFolders,
} from "@/lib/qr";

const MAX_EXPORT = 5_000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const authResult = await authorizeAdminApi();
  if (!authResult.ok) return authResult.response;

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
    select: {
      firstName: true,
      lastName: true,
      qrToken: true,
      group: true,
      teacher: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const byFolder = new Map<string, typeof participants>();
  for (const participant of participants) {
    const folder = qrExportFolder(participant);
    const list = byFolder.get(folder);
    if (list) {
      list.push(participant);
    } else {
      byFolder.set(folder, [participant]);
    }
  }

  const zip = new JSZip();
  const folders = [...byFolder.keys()].sort(sortQrExportFolders);

  for (const folder of folders) {
    const list = byFolder.get(folder)!;
    let index = 0;
    for (const participant of list) {
      index += 1;
      const png = await qrPngBuffer(qrPayloadFromToken(participant.qrToken));
      zip.file(
        `${folder}/${safeQrFilename(participant.firstName, participant.lastName, index)}`,
        png,
      );
    }
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

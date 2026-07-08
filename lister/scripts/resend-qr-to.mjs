/**
 * Corectează emailuri și retrimite QR pentru participanți specifici.
 * node --env-file=.env scripts/resend-qr-to.mjs
 */
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import QRCode from "qrcode";

const eventId = "6a4adf88408edddf43b6f833";

const fixes = [
  {
    id: "6a4b2506949f81551e369145",
    name: "Florin David",
    newEmail: "davidleonardflorin@gmail.com",
  },
  {
    id: "6a4b2506949f81551e369039",
    name: "Camelia Mircea",
    newEmail: "camelia.mircia@lsacbucuresti.ro",
  },
];

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  console.error("SMTP neconfigurat în .env");
  process.exit(1);
}

const prisma = new PrismaClient();
const event = await prisma.event.findUnique({
  where: { id: eventId },
  select: { title: true, startDate: true, location: true },
});
if (!event) throw new Error("Eveniment negăsit");

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 465),
  secure: Number(SMTP_PORT ?? 465) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});
await transporter.verify();

const dateStr = event.startDate.toLocaleDateString("ro-RO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function emailHtml(p) {
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const masa = p.tableNumber
    ? `<p style="font-size:18px;margin:16px 0"><strong>Masa ${p.tableNumber}</strong>${p.floor ? ` — ${p.floor}` : ""}</p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
    <h2 style="margin:0 0 8px">${event.title}</h2>
    <p style="color:#666;margin:0 0 20px">${dateStr}${event.location ? ` · ${event.location}` : ""}</p>
    <p>Salut, <strong>${fullName}</strong>!</p>
    <p>Acesta este biletul tău de acces. Prezintă codul QR de mai jos la intrare (îl poți arăta direct de pe telefon).</p>
    ${masa}
    <div style="text-align:center;margin:24px 0">
      <img src="cid:qrcode" alt="Cod QR acces" width="280" height="280" style="border:1px solid #eee;border-radius:12px" />
    </div>
    <p style="color:#666;font-size:13px">Codul este personal — te rugăm să nu îl distribui. Ne vedem la bal!</p>
  </div>`;
}

for (const fix of fixes) {
  const before = await prisma.participant.findUnique({
    where: { id: fix.id },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!before) {
    console.error(`Negăsit: ${fix.name}`);
    continue;
  }

  const updated = await prisma.participant.update({
    where: { id: fix.id },
    data: { email: fix.newEmail.toLowerCase() },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      qrToken: true,
      tableNumber: true,
      floor: true,
    },
  });

  console.log(
    `${updated.lastName} ${updated.firstName}: ${before.email} → ${updated.email}`,
  );

  const png = await QRCode.toBuffer(updated.qrToken, {
    type: "png",
    width: 560,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: updated.email,
    subject: `Biletul tău — ${event.title}`,
    html: emailHtml(updated),
    attachments: [{ filename: "bilet-qr.png", content: png, cid: "qrcode" }],
  });

  await prisma.participant.update({
    where: { id: fix.id },
    data: { qrEmailSentAt: new Date() },
  });

  console.log(`  ✓ QR retrimis la ${updated.email}`);
}

console.log("\nGata.");
await prisma.$disconnect();

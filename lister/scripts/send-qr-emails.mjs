/**
 * Trimite pe email codul QR de check-in fiecărui participant.
 *
 * Reluabil: trimite doar către participanții cu `qrEmailSentAt = null`;
 * după fiecare email reușit marchează data trimiterii, deci poți rula
 * scriptul zilnic cu `--limit` ca să respecți cota providerului.
 *
 * Variabile de mediu necesare (în .env):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   (ex. Gmail: smtp.gmail.com / 465 / adresa ta / parolă de aplicație)
 *
 * Rulare:
 *   node --env-file=.env scripts/send-qr-emails.mjs --event bal-automatica --test adresa@ta.ro
 *   node --env-file=.env scripts/send-qr-emails.mjs --event bal-automatica --limit 300
 *   node --env-file=.env scripts/send-qr-emails.mjs --event bal-automatica --dry-run
 */
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import QRCode from "qrcode";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const eventRef = arg("event");
const limit = Number(arg("limit") ?? Infinity);
const testEmail = arg("test");
const dryRun = hasFlag("dry-run");
const noSeat = hasFlag("no-seat");
const DELAY_MS = Number(arg("delay") ?? 1500);

if (!eventRef) {
  console.error(
    "Utilizare: node --env-file=.env scripts/send-qr-emails.mjs --event <eventId|slug> [--limit N] [--test email] [--dry-run] [--no-seat] [--delay ms]",
  );
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
if (!dryRun && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM)) {
  console.error("Lipsesc variabilele SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM din .env");
  process.exit(1);
}

const prisma = new PrismaClient();

const event =
  (await prisma.event.findUnique({ where: { slug: eventRef } }).catch(() => null)) ??
  (await prisma.event.findUnique({ where: { id: eventRef } }).catch(() => null));
if (!event) {
  console.error(`Eveniment negăsit: ${eventRef}`);
  process.exit(1);
}

const pending = await prisma.participant.findMany({
  where: {
    eventId: event.id,
    teacher: false,
    email: { not: null },
    // Pe MongoDB câmpul poate lipsi din document — `null` nu acoperă `isSet: false`.
    OR: [{ qrEmailSentAt: null }, { qrEmailSentAt: { isSet: false } }],
  },
  orderBy: [{ tableNumber: "asc" }, { lastName: "asc" }],
});
console.log(`Eveniment: ${event.title} (${event.slug}) — de trimis: ${pending.length}${Number.isFinite(limit) ? ` (limită azi: ${limit})` : ""}`);
console.log(`From: ${SMTP_FROM ?? "(dry-run)"}`);
console.log(`Masa/etaj în email: ${noSeat ? "NU" : "DA"}`);
if (/atm/i.test(SMTP_FROM ?? "") && !/uauim/i.test(event.slug + event.title)) {
  console.warn("⚠ SMTP_FROM conține „ATM” dar evenimentul nu e ATM — verifică From.");
}
if (/atm/i.test(SMTP_FROM ?? "") && /uauim/i.test(event.slug + event.title)) {
  console.error("✗ SMTP_FROM e încă „Bal ATM” pentru Bal UAUIM. Setează SMTP_FROM=\"Bal UAUIM <...>\" la rulare.");
  process.exit(1);
}

if (dryRun) {
  console.log("[dry-run] Nu trimit nimic. Primii 10 destinatari:");
  pending.slice(0, 10).forEach((p) => console.log(`  ${p.lastName} ${p.firstName} <${p.email}> — Masa ${p.tableNumber ?? "?"} (${p.floor ?? "?"})`));
  await prisma.$disconnect();
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 465),
  secure: Number(SMTP_PORT ?? 465) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});
await transporter.verify();
console.log("Conexiune SMTP OK.");

const dateStr = event.startDate.toLocaleDateString("ro-RO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Bucharest",
});
const timeStr = event.startDate.toLocaleTimeString("ro-RO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Bucharest",
});

function emailHtml(p) {
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const masa =
    !noSeat && p.tableNumber
      ? `<p style="font-size:18px;margin:16px 0"><strong>Masa ${p.tableNumber}</strong>${p.floor ? ` — ${p.floor}` : ""}</p>`
      : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
    <h2 style="margin:0 0 8px">${event.title}</h2>
    <p style="color:#666;margin:0 0 20px">${dateStr}${event.location ? ` · ${event.location}` : ""}</p>
    <p>Salut, <strong>${fullName}</strong>!</p>
    <p>Acesta este biletul tău de acces. Prezintă codul QR de mai jos la intrare (îl poți arăta direct de pe telefon).</p>
    <p><strong>Intrarea în bal începe la ora ${timeStr}.</strong></p>
    ${masa}
    <div style="text-align:center;margin:24px 0">
      <img src="cid:qrcode" alt="Cod QR acces" width="280" height="280" style="border:1px solid #eee;border-radius:12px" />
    </div>
    <p style="color:#666;font-size:13px">Codul este personal — te rugăm să nu îl distribui. Ne vedem la bal!</p>
  </div>`;
}

const targets = testEmail ? pending.slice(0, 1) : pending.slice(0, limit);
if (testEmail) {
  console.log(`Mod TEST: trimit un singur email de probă către ${testEmail} (datele lui ${targets[0]?.lastName} ${targets[0]?.firstName}).`);
}

let sent = 0;
let failed = 0;
for (const p of targets) {
  const to = testEmail ?? p.email;
  try {
    const png = await QRCode.toBuffer(p.qrToken, {
      type: "png",
      width: 560,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `Biletul tău — ${event.title}`,
      html: emailHtml(p),
      attachments: [
        { filename: "bilet-qr.png", content: png, cid: "qrcode" },
      ],
    });
    sent += 1;
    if (!testEmail) {
      await prisma.participant.update({
        where: { id: p.id },
        data: { qrEmailSentAt: new Date() },
      });
    }
    console.log(`  ✓ [${sent}/${targets.length}] ${p.lastName} ${p.firstName} <${to}>`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${p.lastName} ${p.firstName} <${to}>: ${err.message}`);
    // Oprire la erori repetate — probabil am atins cota providerului.
    if (failed >= 5 && sent === 0) {
      console.error("Prea multe eșecuri consecutive — mă opresc. Verifică datele SMTP / cota zilnică.");
      break;
    }
  }
  if (targets.length > 1) await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\nTrimise: ${sent} | Eșuate: ${failed} | Rămase netrimise: ${pending.length - (testEmail ? 0 : sent)}`);
await prisma.$disconnect();

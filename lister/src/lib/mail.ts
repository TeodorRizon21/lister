import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

export function getSmtpFrom() {
  return process.env.SMTP_FROM ?? "";
}

export function createSmtpTransport() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

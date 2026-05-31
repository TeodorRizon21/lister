import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "reg_";
const TTL_MS = 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret =
    process.env.REGISTRATION_SESSION_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Lipsește REGISTRATION_SESSION_SECRET sau CLERK_SECRET_KEY pentru sesiunea de înscriere.",
    );
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

function cookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export function createRegistrationAccessToken(
  eventId: string,
  slug: string,
): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${eventId}|${slug}|${exp}`;
  const sig = signPayload(payload);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

function verifyToken(
  token: string,
  eventId: string,
  slug: string,
): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expectedSig = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const [tokenEventId, tokenSlug, expStr] = payload.split("|");
  if (tokenEventId !== eventId || tokenSlug !== slug) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return true;
}

export async function setRegistrationAccess(
  eventId: string,
  slug: string,
): Promise<void> {
  const token = createRegistrationAccessToken(eventId, slug);
  const jar = await cookies();
  jar.set(cookieName(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_MS / 1000,
    path: `/e/${slug}`,
  });
}

export async function hasRegistrationAccess(
  eventId: string,
  slug: string,
): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(cookieName(slug))?.value;
  if (!token) return false;
  return verifyToken(token, eventId, slug);
}

export async function assertRegistrationAccess(
  eventId: string,
  slug: string,
): Promise<boolean> {
  return hasRegistrationAccess(eventId, slug);
}

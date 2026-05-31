import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashRegistrationPassword(
  password: string,
): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyRegistrationPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = (await scryptAsync(password, salt!, 32)) as Buffer;
  const expected = Buffer.from(hashHex!, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

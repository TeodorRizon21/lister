import type { Role } from "@prisma/client";

export function isAdminRole(role: Role): boolean {
  return role === "admin";
}

export function isStaffRole(role: Role): boolean {
  return role === "admin" || role === "staff";
}

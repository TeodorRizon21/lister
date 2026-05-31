import { createRouteMatcher } from "@clerk/nextjs/server";

/** Rute accesibile fără cont Clerk (înscriere publică + auth Clerk). */
export const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
  "/e/(.*)",
]);

/** Zone cu date personale — necesită rol staff sau admin în DB. */
export const isStaffRoute = createRouteMatcher(["/scanner(.*)"]);

/** Panou administrare și exporturi — necesită rol admin în DB. */
export const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

/** Cont autentificat fără permisiuni aplicație. */
export const isAccessDeniedRoute = createRouteMatcher(["/access-denied"]);

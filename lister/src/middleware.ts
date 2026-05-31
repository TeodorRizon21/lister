import { clerkMiddleware } from "@clerk/nextjs/server";
import { isPublicRoute } from "@/lib/auth/routes";

/**
 * Strat 1: Clerk — sesiune obligatorie pe toate rutele în afară de auth public și /e/*.
 * Strat 2: roluri (admin / staff / pending) — verificate pe server în layout-uri,
 * server actions și API (`requireAdmin`, `requireStaffOrAdmin`, `authorizeAdminApi`).
 */
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};

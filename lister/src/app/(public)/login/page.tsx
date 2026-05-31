import { redirect } from "next/navigation";

/** Ruta veche `/login` → Clerk `/sign-in`. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";
  const qs =
    destination === "/"
      ? ""
      : `?redirect_url=${encodeURIComponent(destination)}`;
  redirect(`/sign-in${qs}`);
}

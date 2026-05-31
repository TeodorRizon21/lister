import { redirect } from "next/navigation";
import { getAppUser, syncUserFromAuth } from "@/lib/auth/server";

export default async function HomePage() {
  await syncUserFromAuth();
  const user = await getAppUser();

  if (user?.role === "admin") {
    redirect("/admin/dashboard");
  }

  redirect("/scanner");
}

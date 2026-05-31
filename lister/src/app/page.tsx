import { redirect } from "next/navigation";
import { getAppUser, syncUserFromAuth } from "@/lib/auth/server";
import { isAdminRole, isStaffRole } from "@/lib/auth/roles";

export default async function HomePage() {
  await syncUserFromAuth();
  const user = await getAppUser();

  if (user && isAdminRole(user.role)) {
    redirect("/admin/dashboard");
  }
  if (user && isStaffRole(user.role)) {
    redirect("/scanner");
  }
  if (user) {
    redirect("/access-denied");
  }

  redirect("/sign-in");
}

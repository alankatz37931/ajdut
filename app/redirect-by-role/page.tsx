import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";

export default async function RedirectByRolePage() {
  const user = await requireSession();

  switch (user.role) {
    case "ADMIN":
      redirect("/proyectos");
    case "PROJECT_OWNER":
      redirect("/founder");
    case "CO_ADMIN":
    case "PARTNER":
      redirect("/proyectos");
    default:
      redirect("/");
  }
}

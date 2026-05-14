import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";

export default async function RedirectByRolePage() {
  const user = await requireSession();

  switch (user.role) {
    case "ADMIN":
      redirect("/proyectos");
    case "PROJECT_OWNER":
      redirect("/founder");
    case "PARTNER":
      redirect("/partner");
    case "CO_ADMIN":
      redirect("/proyectos");
    default:
      redirect("/");
  }
}

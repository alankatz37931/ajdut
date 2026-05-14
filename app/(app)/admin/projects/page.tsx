import { redirect } from "next/navigation";

/**
 * /admin/projects se fusionó con /proyectos (que el admin ve con info ampliada).
 */
export default function AdminProjectsRedirect() {
  redirect("/proyectos");
}

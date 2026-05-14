import { redirect } from "next/navigation";

/**
 * El panel de admin se unificó con /proyectos.
 * Este redirect mantiene operativos enlaces viejos a /admin.
 */
export default function AdminRedirect() {
  redirect("/proyectos");
}

import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { NewProjectForm } from "./NewProjectForm";

export const metadata = {
  title: "Nuevo proyecto · AJDUT",
};

export default async function NewProjectPage() {
  await requireRole(["PROJECT_OWNER", "ADMIN"]);

  return (
    <div className="max-w-3xl">
      <Link href="/founder" className="eyebrow hover:!text-gold">
        ← Mi proyecto
      </Link>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Crear nuevo proyecto</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Registrá tu empresa en AJDUT. Una vez completado el formulario, el equipo lo revisa antes
          de activarlo para inversores.
        </p>
      </header>

      <NewProjectForm />
    </div>
  );
}

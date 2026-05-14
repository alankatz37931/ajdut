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

      <header className="mt-6 hairline-b pb-8">
        <h1 className="font-sans text-h1 text-navy">Crear nuevo proyecto</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Registrá tu empresa en AJDUT. Una vez completado el formulario, el equipo lo revisa antes
          de activarlo para inversores.
        </p>
      </header>

      <NewProjectForm />
    </div>
  );
}

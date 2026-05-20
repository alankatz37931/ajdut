import { BackLink } from "@/components/app/BackLink";
import { requireRole } from "@/lib/auth/session";
import { NewProjectForm } from "./NewProjectForm";

export const metadata = {
  title: "Nuevo proyecto · AJDUT",
};

export default async function NewProjectPage() {
  await requireRole(["PROJECT_OWNER", "ADMIN"]);

  return (
    <div className="max-w-4xl">
      <header className="pt-5 sm:pt-7 pb-8 sm:pb-10 hairline-b">
        <BackLink fallback="/founder">Project owner · Nuevo proyecto</BackLink>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          Registrá tu empresa
        </h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-3xl">
          Completá los datos de tu compañía y la valoración actual. Una vez
          enviado, el equipo de AJDUT revisa la información antes de activar el
          proyecto para los miembros. Recibís un email con la confirmación.
        </p>
      </header>

      <NewProjectForm />
    </div>
  );
}

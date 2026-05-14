import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_APPROVAL: "Pendiente de aprobación",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  CLOSED: "Cerrado",
  ARCHIVED: "Archivado",
};

export default async function FounderRootPage() {
  const user = await requireRole(["PROJECT_OWNER"]);

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true, kind: true, status: true },
  });

  if (projects.length === 1 && projects[0]) {
    redirect(`/founder/${projects[0].slug}` as Route);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Founder</p>
          <h1 className="font-sans mt-6 text-h1 text-navy">Tus proyectos</h1>
        </div>
        <Link href={"/founder/nuevo-proyecto" as Route} className="btn-primary shrink-0">
          + Nuevo proyecto
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-12 hairline p-8 bg-paper-light">
          <p className="eyebrow">Empezá acá</p>
          <p className="mt-3 font-sans text-h2 text-navy">
            Todavía no tenés proyectos en AJDUT.
          </p>
          <p className="mt-3 text-navy/75 leading-relaxed">
            Creá tu primer proyecto con los datos de tu empresa y la valoración actual. El equipo
            lo revisa, y una vez aprobado queda visible para inversores.
          </p>
          <Link
            href={"/founder/nuevo-proyecto" as Route}
            className="btn-primary mt-6 inline-flex"
          >
            Crear mi proyecto →
          </Link>
        </div>
      ) : (
        <ul className="mt-10 hairline-t">
          {projects.map((p) => (
            <li key={p.id} className="hairline-b">
              <Link
                href={`/founder/${p.slug}` as Route}
                className="flex items-center justify-between gap-3 py-5 sm:py-6 hover:bg-paper-light"
              >
                <div className="min-w-0">
                  <p className="font-sans text-h2 text-navy">{p.name}</p>
                  <p className="mt-1 eyebrow">
                    {p.kind} · {STATUS_LABEL[p.status] ?? p.status}
                  </p>
                </div>
                <span className="eyebrow text-gold shrink-0">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

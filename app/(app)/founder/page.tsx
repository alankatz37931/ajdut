import Link from "next/link";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { StatusBadge } from "@/components/founder/StatusBadge";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderHome };
}

export default async function FounderRootPage() {
  const user = await requireRole(["PROJECT_OWNER"]);

  const projects = await prisma.project.findMany({
    // Soft-delete: el founder no debería seguir viendo un proyecto que ya fue
    // eliminado; el redirect de "un solo proyecto" tampoco debe disparar sobre
    // un proyecto deleted.
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      status: true,
      shortPitch: true,
      startupProfile: { select: { sector: true, stage: true, oneLiner: true } },
    },
  });

  // Atajo: si el founder tiene un solo proyecto, lo llevamos directo al
  // dashboard — esta página solo tiene sentido cuando hay 2+ proyectos.
  if (projects.length === 1 && projects[0]) {
    redirect(`/founder/${projects[0].slug}` as Route);
  }

  return (
    <div>
      <header className="pb-8 sm:pb-10 hairline-b flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">— Project owner</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Tus proyectos</h1>
          {projects.length > 0 && (
            <p className="mt-3 text-navy/75 leading-relaxed">
              {projects.length} proyecto{projects.length === 1 ? "" : "s"} bajo tu
              dirección. Entrá a cualquiera para gestionar leads, equipo, hitos y
              reportes.
            </p>
          )}
        </div>
        <Link
          href={"/founder/nuevo-proyecto" as Route}
          className="btn-primary shrink-0"
        >
          + Nuevo proyecto
        </Link>
      </header>

      {projects.length === 0 ? (
        <div className="mt-12 hairline p-8 sm:p-10 bg-paper-light max-w-2xl">
          <p className="eyebrow">— Empezá acá</p>
          <p className="mt-3 font-sans text-h2 text-navy">
            Todavía no tenés proyectos en AJDUT.
          </p>
          <p className="mt-3 text-navy/75 leading-relaxed">
            Creá tu primer proyecto con los datos de tu empresa y la valoración
            actual. El equipo lo revisa, y una vez aprobado queda visible para
            los miembros.
          </p>
          <Link
            href={"/founder/nuevo-proyecto" as Route}
            className="btn-primary mt-6 inline-flex"
          >
            Crear mi proyecto →
          </Link>
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-px bg-line">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/founder/${p.slug}` as Route}
                className="group flex flex-col gap-4 bg-paper p-6 h-full transition-colors hover:bg-paper-light"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="eyebrow">
                    {p.startupProfile?.sector ?? p.kind}
                    {p.startupProfile?.stage ? ` · ${p.startupProfile.stage}` : ""}
                  </p>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex-1">
                  <p className="font-sans text-h2 text-navy leading-tight">
                    {p.name}
                  </p>
                  {(p.startupProfile?.oneLiner || p.shortPitch) && (
                    <p className="mt-3 text-sm text-navy/75 leading-relaxed line-clamp-3">
                      “{p.startupProfile?.oneLiner ?? p.shortPitch}”
                    </p>
                  )}
                </div>
                <span className="eyebrow !text-gold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Abrir proyecto →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

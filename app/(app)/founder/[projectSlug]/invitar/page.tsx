import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { getAvailableSharesForProposal } from "@/lib/services/pending-assignment";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { InvitarForm } from "./InvitarForm";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderInvitar };
}

export default async function InvitarMiembroPage({ params }: Params) {
  const user = await requireSession();
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
  });
  if (!project) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    notFound();
  }

  // Disponibles para proponer = pool AVAILABLE − propuestas PENDING ya hechas.
  const availableShares = await getAvailableSharesForProposal(project.id);

  return (
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section="Invitar miembro"
        description="Proponé agregar un socio a tu proyecto. La propuesta queda pendiente de validación por el equipo de AJDUT. Cuando un admin la apruebe se crea la cuenta (si hace falta), se asignan las acciones desde el pool y se le envía el email al invitado."
      />

      {/* KPI compacto del pool disponible — el dato más importante acá. */}
      <div className="mt-8 hairline bg-paper p-5 flex flex-wrap items-baseline justify-between gap-4">
        <p className="eyebrow">— Pool disponible para proponer</p>
        <p className="font-mono text-h2 text-navy leading-none">
          {availableShares.toLocaleString("es-MX")}
        </p>
      </div>

      <InvitarForm projectSlug={project.slug} availableShares={availableShares} />
    </div>
  );
}

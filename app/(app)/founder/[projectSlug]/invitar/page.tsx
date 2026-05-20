import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getAvailableSharesForProposal } from "@/lib/services/pending-assignment";
import { BackLink } from "@/components/app/BackLink";
import { InvitarForm } from "./InvitarForm";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Invitar miembro · AJDUT",
};

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
  // Así evitamos que el founder doble-asigne el mismo pool mientras el admin
  // todavía no validó propuestas previas.
  const availableShares = await getAvailableSharesForProposal(project.id);

  return (
    <div className="max-w-3xl">
      <BackLink fallback={`/founder/${projectSlug}`}>
        ← {project.name}
      </BackLink>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Invitar miembro</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Proponé agregar un socio a tu proyecto. La propuesta queda pendiente de
          validación por el equipo de AJDUT. Cuando un admin la apruebe se crea
          la cuenta (si hace falta), se asignan las acciones desde el pool y se
          le envía el email al invitado.
        </p>
      </header>

      <InvitarForm projectSlug={project.slug} availableShares={availableShares} />
    </div>
  );
}

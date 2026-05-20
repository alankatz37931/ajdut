import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { AvisoForm } from "./AvisoForm";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Avisos a miembros · AJDUT",
};

const ASSIGNED_STATUSES = [
  "ASSIGNED",
  "IN_RESALE",
  "TRANSFER_PENDING",
  "IN_NEGOTIATION",
] as const;

export default async function FounderAvisosPage({ params }: Params) {
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
  // Pueden enviar: owner del proyecto, co-admin vinculado, o admin.
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    notFound();
  }

  const memberParts = await prisma.participation.findMany({
    where: {
      projectId: project.id,
      isPlatformStake: false,
      currentOwnerId: { not: null },
      status: { in: [...ASSIGNED_STATUSES] },
    },
    select: {
      currentOwner: {
        select: { id: true, email: true, fullName: true, alias: true },
      },
    },
  });

  // Agrupamos por userId — un mismo socio puede tener varias participations.
  // El label muestra alias si está; sino fullName. El email solo se usa para
  // info en el form (la action resuelve email desde el userId).
  const memberMap = new Map<
    string,
    { userId: string; label: string; email: string }
  >();
  for (const p of memberParts) {
    const o = p.currentOwner;
    if (!o || !o.email) continue;
    if (memberMap.has(o.id)) continue;
    memberMap.set(o.id, {
      userId: o.id,
      label: o.alias ?? o.fullName,
      email: o.email,
    });
  }
  const members = [...memberMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "es")
  );
  const memberCount = members.length;

  return (
    <div className="max-w-3xl">
      <BackLink fallback={`/founder/${projectSlug}`}>
        ← {project.name}
      </BackLink>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Avisos a miembros</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Enviá un email a todos los miembros de tu proyecto, o a uno en particular, para
          avisar reportes, votaciones o información relevante.
        </p>
      </header>

      {memberCount === 0 ? (
        <p className="mt-10 text-navy/60">
          Tu proyecto todavía no tiene miembros con acciones asignadas. Cuando se distribuyan
          acciones, vas a poder enviarles avisos desde acá.
        </p>
      ) : (
        <AvisoForm
          projectSlug={project.slug}
          memberCount={memberCount}
          members={members}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { AvisoForm } from "./AvisoForm";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderAvisos };
}

const ASSIGNED_STATUSES = [
  "ASSIGNED",
  "IN_RESALE",
  "TRANSFER_PENDING",
  "IN_NEGOTIATION",
] as const;

export default async function FounderAvisosPage({ params }: Params) {
  const user = await requireSession();
  const dict = await getDict();
  const t = dict.founderAvisos;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      status: true,
      deletedAt: true,
    },
  });
  // Soft-delete: un proyecto eliminado ya no existe para esta vista — la
  // fuente de verdad es deletedAt (mismo patrón que el dashboard).
  if (!project || project.deletedAt) notFound();

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
    a.label.localeCompare(b.label, "es"),
  );
  const memberCount = members.length;

  return (
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section={t.section}
        description={t.description}
      />

      {memberCount === 0 ? (
        <p className="mt-10 text-navy/60">{t.emptyNoMembers}</p>
      ) : (
        <AvisoForm
          projectSlug={project.slug}
          memberCount={memberCount}
          members={members}
          dict={t}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { getAvailableSharesForProposal } from "@/lib/services/pending-assignment";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { InvitarForm } from "./InvitarForm";

type Params = {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderInvitar };
}

export default async function InvitarMiembroPage({ params, searchParams }: Params) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderInvitar;
  const { projectSlug } = await params;
  // Precarga opcional desde el botón "Invitar como usuario" del equipo.
  const sp = await searchParams;
  const initialName = typeof sp.name === "string" ? sp.name : "";
  const initialShares = typeof sp.shares === "string" ? sp.shares : "";

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

  const availableShares = await getAvailableSharesForProposal(project.id);

  return (
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section={t.section}
        description={t.description}
      />

      <div className="mt-8 hairline bg-paper p-5 flex flex-wrap items-baseline justify-between gap-4">
        <p className="eyebrow">{t.poolLabel}</p>
        <p className="font-mono text-h2 text-navy leading-none">
          {availableShares.toLocaleString(locale)}
        </p>
      </div>

      <InvitarForm
        projectSlug={project.slug}
        availableShares={availableShares}
        initialName={initialName}
        initialShares={initialShares}
        dict={t}
        locale={locale}
      />
    </div>
  );
}

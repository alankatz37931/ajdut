import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { TeamEditor } from "./TeamEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderEquipo };
}

export default async function FounderTeamPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderEquipo;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: {
          founders: { orderBy: [{ isActive: "desc" }, { equityPercent: "desc" }] },
        },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) notFound();
  if (!project.startupProfile) notFound();

  const shareholderClasses = await prisma.shareholderClass.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  const founders = project.startupProfile.founders.map((f) => ({
    id: f.id,
    fullName: f.fullName,
    role: f.role,
    bio: f.bio ?? "",
    references: f.references ?? "",
    linkedinUrl: f.linkedinUrl ?? "",
    equityPercent: Number(f.equityPercent),
    joinedAt: f.joinedAt ? f.joinedAt.toISOString().slice(0, 10) : "",
    isActive: f.isActive,
    shareholderClassId: f.shareholderClassId ?? "",
    vestingMonths: f.vestingMonths ?? 0,
    vestingStartAt: f.vestingStartAt
      ? f.vestingStartAt.toISOString().slice(0, 10)
      : "",
  }));

  return (
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section={t.section}
        description={t.description}
      />

      <TeamEditor
        projectSlug={projectSlug}
        initialFounders={founders}
        shareholderClasses={shareholderClasses}
        dict={t}
        locale={locale}
      />
    </div>
  );
}

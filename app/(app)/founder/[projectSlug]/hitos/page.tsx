import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { MilestonesEditor } from "./MilestonesEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderHitos };
}

export default async function FounderMilestonesPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const dict = await getDict();
  const t = dict.founderHitos;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: {
          milestones: {
            orderBy: [{ achievedAt: "desc" }, { targetDate: "asc" }, { createdAt: "desc" }],
          },
        },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) notFound();
  if (!project.startupProfile) notFound();

  const milestones = project.startupProfile.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status as "PLANNED" | "IN_PROGRESS" | "ACHIEVED" | "DELAYED" | "CANCELLED",
    targetDate: m.targetDate ? m.targetDate.toISOString().slice(0, 10) : "",
    achievedAt: m.achievedAt ? m.achievedAt.toISOString().slice(0, 10) : "",
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

      <MilestonesEditor
        projectSlug={projectSlug}
        initial={milestones}
        dict={t}
      />
    </div>
  );
}

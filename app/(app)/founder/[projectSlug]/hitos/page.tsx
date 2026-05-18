import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { MilestonesEditor } from "./MilestonesEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = { title: "Hitos · AJDUT" };

export default async function FounderMilestonesPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
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
    <div className="max-w-3xl">
      <Link href={`/founder/${projectSlug}` as Route} className="eyebrow hover:!text-gold">
        ← {project.name}
      </Link>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Hitos</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Lo que prometiste cumplir y lo que ya cumpliste. Los hitos se muestran en la página
          pública del proyecto a quienes tengan acceso.
        </p>
      </header>

      <MilestonesEditor projectSlug={projectSlug} initial={milestones} />
    </div>
  );
}

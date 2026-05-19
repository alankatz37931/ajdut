import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { TeamEditor } from "./TeamEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = { title: "Equipo · AJDUT" };

export default async function FounderTeamPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: { founders: { orderBy: [{ isActive: "desc" }, { equityPercent: "desc" }] } },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) notFound();
  if (!project.startupProfile) notFound();

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
  }));

  return (
    <div className="max-w-3xl">
      <Link
        href={`/founder/${projectSlug}` as Route}
        className="eyebrow hover:!text-gold"
      >
        ← {project.name}
      </Link>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Equipo fundador</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Quiénes son los founders detrás del proyecto. Se muestra en la página pública del
          proyecto a quienes tengan acceso.
        </p>
      </header>

      <TeamEditor projectSlug={projectSlug} initialFounders={founders} />
    </div>
  );
}

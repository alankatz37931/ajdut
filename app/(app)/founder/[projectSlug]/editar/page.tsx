import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { EditProjectForm } from "./EditProjectForm";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Editar proyecto · AJDUT",
};

export default async function EditProjectPage({ params }: Params) {
  const user = await requireSession();
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: true,
      participations: { select: { status: true, shareCount: true } },
    },
  });
  if (!project) notFound();

  const currentAvailable = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);
  const assigned = project.participations
    .filter((p) => p.status !== "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);
  const maxAvailable = project.totalShares - assigned;

  // Leads OPEN/CONTACTED: si el founder reduce disponibles a 0 con leads abiertos,
  // estos quedan rotos (no se pueden cumplir). Avisamos para que actúe antes.
  const openLeadsCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      status: { in: ["OPEN", "CONTACTED"] },
    },
  });

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit) notFound();

  return (
    <div className="max-w-3xl">
      <Link href={`/proyectos/${projectSlug}` as Route} className="eyebrow hover:!text-gold">
        ← {project.name}
      </Link>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Editar información</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          La información que actualices acá se muestra en la página pública del proyecto a quien
          tenga acceso.
        </p>
      </header>

      <EditProjectForm
        projectSlug={project.slug}
        initial={{
          name: project.name,
          shortPitch: project.shortPitch,
          description: project.description,
          sector: project.startupProfile?.sector ?? "",
          stage: project.startupProfile?.stage ?? "SEED",
          oneLiner: project.startupProfile?.oneLiner ?? "",
          problemStatement: project.startupProfile?.problemStatement ?? "",
          solutionStatement: project.startupProfile?.solutionStatement ?? "",
          businessModel: project.startupProfile?.businessModel ?? "",
          preMoneyValuation: project.startupProfile?.preMoneyValuation
            ? Number(project.startupProfile.preMoneyValuation).toString()
            : "",
          valuationCurrency: project.startupProfile?.valuationCurrency ?? "USD",
          websiteUrl: project.startupProfile?.websiteUrl ?? "",
          pitchDeckUrl: project.startupProfile?.pitchDeckStorageKey ?? "",
          dataRoomUrl: project.startupProfile?.dataRoomStorageKey ?? "",
          availableShares: currentAvailable,
        }}
        hasStartupProfile={!!project.startupProfile}
        maxAvailable={maxAvailable}
        currentTotalShares={project.totalShares}
        openLeadsCount={openLeadsCount}
      />
    </div>
  );
}

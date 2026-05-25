import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { EditProjectForm } from "./EditProjectForm";
import Link from "next/link";
import type { Route } from "next";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderEditar };
}

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
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section="Editar información"
        description="La información que actualices acá se muestra en la ficha pública del proyecto a quien tenga acceso."
        action={
          <Link
            href={`/proyectos/${project.slug}` as Route}
            className="btn-outline"
          >
            Ver ficha pública →
          </Link>
        }
      />

      <EditProjectForm
        projectSlug={project.slug}
        initial={{
          name: project.name,
          shortPitch: project.shortPitch,
          description: project.description,
          kind: project.kind,
          sector: project.startupProfile?.sector ?? "",
          stage: project.startupProfile?.stage ?? "SEED",
          location: project.startupProfile?.location ?? "",
          targetRaiseAmount: project.startupProfile?.targetRaiseAmount
            ? Number(project.startupProfile.targetRaiseAmount).toString()
            : "",
          oneLiner: project.startupProfile?.oneLiner ?? "",
          problemStatement: project.startupProfile?.problemStatement ?? "",
          solutionStatement: project.startupProfile?.solutionStatement ?? "",
          businessModel: project.startupProfile?.businessModel ?? "",
          preMoneyValuation: project.startupProfile?.preMoneyValuation
            ? Number(project.startupProfile.preMoneyValuation).toString()
            : "",
          valuationCurrency: project.startupProfile?.valuationCurrency ?? "USD",
          websiteUrl: project.startupProfile?.websiteUrl ?? "",
          videoUrl: project.startupProfile?.videoUrl ?? "",
          pitchDeckUrl: project.startupProfile?.pitchDeckStorageKey ?? "",
          dataRoomUrl: project.startupProfile?.dataRoomStorageKey ?? "",
          assetBackingNote: project.startupProfile?.assetBackingNote ?? "",
          equityStructureNote: project.startupProfile?.equityStructureNote ?? "",
          projectionsUrl: project.startupProfile?.projectionsUrl ?? "",
          planNegociosUrl: project.startupProfile?.planNegociosUrl ?? "",
          estrategiasPeriodicasUrl:
            project.startupProfile?.estrategiasPeriodicasUrl ?? "",
          estadosFinancierosUrl: project.startupProfile?.estadosFinancierosUrl ?? "",
          estrategiaEmisionUrl: project.startupProfile?.estrategiaEmisionUrl ?? "",
          policyShares: project.startupProfile?.policyShares ?? "",
          policyDividends: project.startupProfile?.policyDividends ?? "",
          dividendsFrequency: project.startupProfile?.dividendsFrequency ?? "",
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

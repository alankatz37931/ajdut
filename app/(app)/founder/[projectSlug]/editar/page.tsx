import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
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
      <BackLink fallback={`/founder/${projectSlug}`}>
        ← {project.name}
      </BackLink>

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
          pitchDeckUrl: project.startupProfile?.pitchDeckStorageKey ?? "",
          dataRoomUrl: project.startupProfile?.dataRoomStorageKey ?? "",
          assetBackingNote: project.startupProfile?.assetBackingNote ?? "",
          equityStructureNote: project.startupProfile?.equityStructureNote ?? "",
          projectionsUrl: project.startupProfile?.projectionsUrl ?? "",
          planNegociosUrl: project.startupProfile?.planNegociosUrl ?? "",
          estrategiasPeriodicasUrl: project.startupProfile?.estrategiasPeriodicasUrl ?? "",
          estadosFinancierosUrl: project.startupProfile?.estadosFinancierosUrl ?? "",
          estrategiaEmisionUrl: project.startupProfile?.estrategiaEmisionUrl ?? "",
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

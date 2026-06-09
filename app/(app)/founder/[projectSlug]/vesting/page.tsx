import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { getAvailableSharesForProposal } from "@/lib/services/pending-assignment";
import { listVestingSchedules } from "@/lib/services/vesting";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { VestingForm } from "./VestingForm";
import { VestingList } from "./VestingList";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderVesting };
}

export default async function FounderVestingPage({ params }: Params) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderVesting;
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
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    notFound();
  }

  const [availableShares, schedules] = await Promise.all([
    getAvailableSharesForProposal(project.id),
    listVestingSchedules(project.id),
  ]);

  // Socios actuales del proyecto (holders no-plataforma) para el select de
  // "destinatario existente". Distinct por currentOwnerId.
  const holders = await prisma.participation.findMany({
    where: {
      projectId: project.id,
      isPlatformStake: false,
      currentOwnerId: { not: null },
      status: { in: ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING", "IN_NEGOTIATION"] },
    },
    select: {
      currentOwner: { select: { id: true, fullName: true, alias: true } },
    },
  });
  const memberMap = new Map<string, string>();
  for (const h of holders) {
    if (h.currentOwner) {
      memberMap.set(
        h.currentOwner.id,
        h.currentOwner.alias ?? h.currentOwner.fullName
      );
    }
  }
  const members = Array.from(memberMap.entries()).map(([id, label]) => ({
    id,
    label,
  }));

  const scheduleViews = schedules.map((s) => ({
    id: s.id,
    status: s.status,
    targetLabel: s.targetLabel,
    targetEmail: s.targetEmail,
    totalShares: s.totalShares,
    reason: s.reason,
    releasedCount: s.releasedCount,
    totalReleases: s.totalReleases,
    deliveredShares: s.deliveredShares,
    nextReleaseAt: s.nextReleaseAt ? s.nextReleaseAt.toISOString() : null,
    releases: s.releases.map((r) => ({
      id: r.id,
      shareCount: r.shareCount,
      releaseAt: r.releaseAt.toISOString(),
      status: r.status,
    })),
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

      <div className="mt-8 hairline bg-paper p-5 flex flex-wrap items-baseline justify-between gap-4">
        <p className="eyebrow">{t.poolLabel}</p>
        <p className="font-mono text-h2 text-navy leading-none">
          {availableShares.toLocaleString(locale)}
        </p>
      </div>

      <VestingList
        projectSlug={project.slug}
        schedules={scheduleViews}
        dict={t}
        locale={locale}
      />

      <VestingForm
        projectSlug={project.slug}
        availableShares={availableShares}
        members={members}
        dict={t}
        locale={locale}
      />
    </div>
  );
}

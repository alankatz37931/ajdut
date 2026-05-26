import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { CompositionEditor } from "./CompositionEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderComposicion };
}

export default async function FounderCompositionPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderComposicion;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      shareholderClasses: { orderBy: { order: "asc" } },
      externalHoldings: { orderBy: { createdAt: "asc" } },
      participations: {
        where: { isPlatformStake: false, currentOwnerId: { not: null } },
        include: {
          currentOwner: { select: { id: true, fullName: true, alias: true } },
        },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) notFound();

  const classes = project.shareholderClasses.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  // Accionistas de AJDUT — agrupados por dueño. La clase del holder es la de
  // sus participaciones (tomamos la primera no nula).
  const holderMap = new Map<
    string,
    { userId: string; name: string; shares: number; classId: string }
  >();
  for (const p of project.participations) {
    if (!p.currentOwner) continue;
    const key = p.currentOwner.id;
    const existing = holderMap.get(key);
    if (existing) {
      existing.shares += p.shareCount;
      if (!existing.classId && p.shareholderClassId) {
        existing.classId = p.shareholderClassId;
      }
    } else {
      holderMap.set(key, {
        userId: key,
        name: p.currentOwner.alias ?? p.currentOwner.fullName,
        shares: p.shareCount,
        classId: p.shareholderClassId ?? "",
      });
    }
  }
  const holders = Array.from(holderMap.values()).sort(
    (a, b) => b.shares - a.shares
  );

  const externalHoldings = project.externalHoldings.map((h) => ({
    id: h.id,
    label: h.label ?? "",
    classId: h.shareholderClassId ?? "",
    peopleCount: h.peopleCount,
    shareCount: h.shareCount,
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

      <CompositionEditor
        projectSlug={project.slug}
        totalShares={project.totalShares}
        initialClasses={classes}
        initialHolders={holders}
        initialExternal={externalHoldings}
        dict={t}
        locale={locale}
      />
    </div>
  );
}

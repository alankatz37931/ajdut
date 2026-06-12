import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { ensureProjectClasses } from "@/lib/services/shareholder-class";
import { TeamEditor } from "./TeamEditor";
import { CompositionEditor } from "../composicion/CompositionEditor";

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
  const tc = dict.founderComposicion;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: {
          founders: { orderBy: [{ isActive: "desc" }, { equityPercent: "desc" }] },
        },
      },
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
  if (!project.startupProfile) notFound();

  // Clases FIJAS: las 4 canónicas (idempotente). Sirven tanto al selector de
  // clase del equipo como a la reasignación de participantes de la composición.
  const classes = (await ensureProjectClasses(prisma, project.id)).map((c) => ({
    id: c.id,
    name: c.name,
  }));

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
    vestingInitialPercent:
      f.vestingInitialPercent != null ? Number(f.vestingInitialPercent) : 0,
    vestingFinalPercent:
      f.vestingFinalPercent != null ? Number(f.vestingFinalPercent) : 0,
  }));

  // — Composición: accionistas de AJDUT agrupados por dueño (la clase del
  // holder es la de sus participaciones; tomamos la primera no nula) +
  // tenencias externas declaradas.
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

      <TeamEditor
        projectSlug={projectSlug}
        initialFounders={founders}
        shareholderClasses={classes}
        dict={t}
        locale={locale}
      />

      {/* Composición de participaciones — embebida dentro de Equipo. */}
      <div className="mt-14 pt-10 hairline-t">
        <h2 className="font-sans text-2xl sm:text-[1.75rem] text-navy leading-tight">
          {tc.section}
        </h2>
        <p className="mt-3 text-navy/75 leading-relaxed">{tc.description}</p>
      </div>

      <CompositionEditor
        projectSlug={project.slug}
        totalShares={project.totalShares}
        initialClasses={classes}
        initialHolders={holders}
        initialExternal={externalHoldings}
        dict={tc}
        locale={locale}
      />
    </div>
  );
}

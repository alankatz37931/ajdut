import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getDict, getLocale } from "@/lib/i18n";
import { BackLink } from "@/components/app/BackLink";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ResaleSellerPanel } from "./ResaleSellerPanel";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.reventa.metaTitle };
}

export default async function ProjectResalePage({ params }: Params) {
  const user = await requireSession();
  const { slug } = await params;
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.reventa;

  const project = await prisma.project.findUnique({
    where: { slug },
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
  if (!access.canView) notFound();

  const myParticipations = await prisma.participation.findMany({
    where: {
      projectId: project.id,
      currentOwnerId: user.id,
      isPlatformStake: false,
    },
    orderBy: { acquiredAt: "asc" },
    select: { id: true, serialCode: true, shareCount: true, status: true },
  });

  const listings = await prisma.resaleListing.findMany({
    where: {
      projectId: project.id,
      status: { in: ["LISTED", "IN_CONVERSATION", "AWAITING_VALIDATION"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      intentNote: true,
      contactChannel: true,
      createdAt: true,
      sellerId: true,
      seller: { select: { fullName: true, alias: true } },
      participationId: true,
      participation: { select: { shareCount: true, serialCode: true } },
    },
  });

  const holders = await prisma.participation.findMany({
    where: {
      projectId: project.id,
      isPlatformStake: false,
      currentOwnerId: { not: null },
    },
    select: {
      currentOwner: { select: { id: true, fullName: true, alias: true } },
    },
  });
  const memberMap = new Map<string, { id: string; name: string }>();
  for (const h of holders) {
    if (h.currentOwner && h.currentOwner.id !== user.id) {
      memberMap.set(h.currentOwner.id, {
        id: h.currentOwner.id,
        name: h.currentOwner.alias ?? h.currentOwner.fullName,
      });
    }
  }
  const projectMembers = Array.from(memberMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const myListingByPart = new Map<string, (typeof listings)[number]>();
  for (const l of listings) {
    if (l.sellerId === user.id) myListingByPart.set(l.participationId, l);
  }
  const sellerRows = myParticipations.map((p) => {
    const listing = myListingByPart.get(p.id);
    return {
      participationId: p.id,
      serialCode: p.serialCode,
      shareCount: p.shareCount,
      status: p.status as string,
      listing: listing ? { id: listing.id, status: listing.status as string } : null,
    };
  });

  const boardListings = listings.filter(
    (l) =>
      l.sellerId !== user.id &&
      (l.status === "LISTED" || l.status === "IN_CONVERSATION")
  );

  return (
    <div>
      <div className="pt-5 sm:pt-7 pb-8 hairline-b">
        <BackLink fallback={`/proyectos/${project.slug}`}>
          {project.name}
        </BackLink>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/70 leading-relaxed max-w-2xl">{t.intro}</p>
      </div>

      <section className="mt-10">
        <p className="eyebrow !text-navy hairline-b pb-3 mb-6">
          {t.sectionYours}
        </p>
        {sellerRows.length === 0 ? (
          <p className="text-navy/60">{t.emptyNoShares}</p>
        ) : (
          <ResaleSellerPanel
            projectSlug={project.slug}
            rows={sellerRows}
            members={projectMembers}
            dict={t}
          />
        )}
      </section>

      <section className="mt-14">
        <p className="eyebrow !text-navy hairline-b pb-3 mb-6">
          {t.sectionBoard}
        </p>
        {boardListings.length === 0 ? (
          <p className="text-navy/60">{t.emptyNoBoard}</p>
        ) : (
          <ul className="space-y-4">
            {boardListings.map((l) => (
              <li key={l.id} className="hairline p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-sans text-navy">
                    {l.seller.alias ?? l.seller.fullName}
                  </span>
                  <span className="eyebrow !text-navy/50">
                    {formatNumber(l.participation.shareCount, undefined, locale)}{" "}
                    {t.boardSharesSuffix} · {formatDate(l.createdAt, locale)}
                  </span>
                </div>
                <p className="mt-2 text-navy/80 text-sm leading-relaxed whitespace-pre-line">
                  {l.intentNote}
                </p>
                <p className="mt-3 eyebrow !text-navy/50">
                  {t.boardContactLabel}{" "}
                  <span className="!text-navy">{l.contactChannel}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getDict, getLocale } from "@/lib/i18n";
import { BackLink } from "@/components/app/BackLink";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";
import { ResaleSellerPanel } from "./ResaleSellerPanel";
import { OwnerResaleValidation } from "./OwnerResaleValidation";

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
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      status: true,
      totalShares: true,
      resaleAllowedFrom: true,
      startupProfile: {
        select: {
          preMoneyValuation: true,
          valuationCurrency: true,
          totalEquityShares: true,
        },
      },
    },
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
      shareCount: true,
      proposedPricePerShare: true,
      participation: { select: { shareCount: true, serialCode: true } },
    },
  });

  // Validación tripartita: si el viewer es el project owner, le mostramos las
  // reventas de SU proyecto que esperan su validación (status AWAITING_VALIDATION
  // con comprador designado). Click → confirmResaleOwner.
  const isOwner = project.ownerId === user.id;
  const ownerPendingRows = isOwner
    ? (
        await prisma.resaleListing.findMany({
          where: {
            projectId: project.id,
            status: "AWAITING_VALIDATION",
            proposedBuyerId: { not: null },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            shareCount: true,
            proposedPricePerShare: true,
            buyerAcceptedAt: true,
            ownerAcceptedAt: true,
            createdAt: true,
            seller: { select: { fullName: true, alias: true } },
            proposedBuyerId: true,
            participation: { select: { shareCount: true } },
          },
        })
      )
    : [];

  const ownerBuyerIds = Array.from(
    new Set(
      ownerPendingRows
        .map((r) => r.proposedBuyerId)
        .filter((x): x is string => x !== null)
    )
  );
  const ownerBuyers = ownerBuyerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerBuyerIds } },
        select: { id: true, fullName: true, alias: true },
      })
    : [];
  const ownerBuyerMap = new Map(ownerBuyers.map((b) => [b.id, b]));

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
  // Sumar shareCount activo por participación (cualquier seller). Para reventa
  // parcial pueden coexistir varios listings sobre la misma participación; el
  // disponible = total - sum(activos).
  const activeSumByPart = new Map<string, number>();
  for (const l of listings) {
    const taken = l.shareCount ?? l.participation.shareCount;
    activeSumByPart.set(
      l.participationId,
      (activeSumByPart.get(l.participationId) ?? 0) + taken
    );
  }

  // Precio default = preMoney / totalShares. Si falta cualquier dato, queda
  // null y el panel pide al seller que cargue manualmente.
  const currency = project.startupProfile?.valuationCurrency ?? "USD";
  const totalSharesForPrice =
    project.startupProfile?.totalEquityShares ?? project.totalShares;
  let defaultPricePerShare: string | null = null;
  if (
    project.startupProfile?.preMoneyValuation &&
    totalSharesForPrice > 0
  ) {
    defaultPricePerShare = new Prisma.Decimal(project.startupProfile.preMoneyValuation)
      .div(totalSharesForPrice)
      .toFixed(2);
  }

  const sellerRows = myParticipations.map((p) => {
    const listing = myListingByPart.get(p.id);
    const activeForOthers =
      (activeSumByPart.get(p.id) ?? 0) - (listing ? listing.shareCount ?? p.shareCount : 0);
    const available = Math.max(0, p.shareCount - activeForOthers);
    return {
      participationId: p.id,
      serialCode: p.serialCode,
      shareCount: p.shareCount,
      availableShares: available,
      status: p.status as string,
      listing: listing
        ? {
            id: listing.id,
            status: listing.status as string,
            shareCount: listing.shareCount ?? p.shareCount,
            proposedPricePerShare: listing.proposedPricePerShare
              ? listing.proposedPricePerShare.toString()
              : null,
          }
        : null,
    };
  });

  const boardListings = listings.filter(
    (l) =>
      l.sellerId !== user.id &&
      (l.status === "LISTED" || l.status === "IN_CONVERSATION")
  );

  const ownerValidationRows = ownerPendingRows.map((r) => {
    const buyer = r.proposedBuyerId
      ? ownerBuyerMap.get(r.proposedBuyerId)
      : null;
    return {
      resaleListingId: r.id,
      sellerName: r.seller.alias ?? r.seller.fullName,
      buyerName: buyer ? buyer.alias ?? buyer.fullName : t.ownerValidation.unknownBuyer,
      shareCount: r.shareCount ?? r.participation.shareCount,
      pricePerShare: r.proposedPricePerShare
        ? r.proposedPricePerShare.toString()
        : null,
      buyerConfirmed: r.buyerAcceptedAt !== null,
      ownerConfirmed: r.ownerAcceptedAt !== null,
    };
  });

  // Gate de fecha: si el project owner definió una fecha de inicio de reventa
  // y todavía no llegó, mostramos un aviso en vez del panel de listing. Una
  // fecha pasada (o null) deja la reventa habilitada normalmente.
  const resaleLocked =
    project.resaleAllowedFrom !== null &&
    new Date() < project.resaleAllowedFrom;

  return (
    <div>
      <div className="pt-5 pb-5 sm:pt-7 sm:pb-7 hairline-b">
        <BackLink fallback={`/proyectos/${project.slug}`}>
          {project.name}
        </BackLink>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
          {t.title}
        </h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-2xl">{t.intro}</p>
      </div>

      {isOwner && ownerValidationRows.length > 0 && (
        <section className="mt-10">
          <p className="eyebrow !text-gold hairline-b pb-3 mb-6">
            {t.ownerValidation.sectionTitle}
          </p>
          <p className="mb-6 text-navy/75 leading-relaxed max-w-2xl">
            {t.ownerValidation.intro}
          </p>
          <OwnerResaleValidation
            projectSlug={project.slug}
            rows={ownerValidationRows}
            currency={currency}
            locale={locale}
            dict={t.ownerValidation}
          />
        </section>
      )}

      <section className="mt-10">
        <p className="eyebrow !text-navy hairline-b pb-3 mb-6">
          {t.sectionYours}
        </p>
        {resaleLocked ? (
          <div className="hairline p-5 bg-paper">
            <p className="eyebrow !text-gold">{t.seller.lockedEyebrow}</p>
            <p className="mt-2 text-navy/85 leading-relaxed">
              {t.seller.lockedUntilFmt
                .replace("{project}", project.name)
                .replace("{date}", formatDate(project.resaleAllowedFrom!, locale))}
            </p>
          </div>
        ) : sellerRows.length === 0 ? (
          <p className="text-navy/60">{t.emptyNoShares}</p>
        ) : (
          <ResaleSellerPanel
            projectSlug={project.slug}
            projectName={project.name}
            rows={sellerRows}
            members={projectMembers}
            defaultPricePerShare={defaultPricePerShare}
            currency={currency}
            locale={locale}
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
            {boardListings.map((l) => {
              const listedShares = l.shareCount ?? l.participation.shareCount;
              const isPartial = listedShares < l.participation.shareCount;
              const priceStr = l.proposedPricePerShare
                ? l.proposedPricePerShare.toString()
                : null;
              const priceNum = priceStr ? Number(priceStr) : null;
              return (
                <li key={l.id} className="hairline p-5">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="font-sans text-navy">
                      {l.seller.alias ?? l.seller.fullName}
                      {isPartial && (
                        <span className="ml-2 eyebrow !text-gold">
                          {t.boardPartialBadge}
                        </span>
                      )}
                    </span>
                    <span className="eyebrow !text-navy/50">
                      {formatNumber(listedShares, undefined, locale)}{" "}
                      {t.boardSharesSuffix} · {formatDate(l.createdAt, locale)}
                    </span>
                  </div>
                  {priceNum !== null && (
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 eyebrow !text-navy/60">
                      <span>
                        {t.boardPriceLabel}:{" "}
                        <span className="!text-navy">
                          {formatCurrency(priceNum, currency, 2, locale)}
                        </span>
                      </span>
                      <span>
                        {t.boardTotalLabel}:{" "}
                        <span className="!text-navy">
                          {formatCurrency(priceNum * listedShares, currency, 2, locale)}
                        </span>
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-navy/80 text-sm leading-relaxed whitespace-pre-line">
                    {l.intentNote}
                  </p>
                  <p className="mt-3 eyebrow !text-navy/50">
                    {t.boardContactLabel}{" "}
                    <span className="!text-navy">{l.contactChannel}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

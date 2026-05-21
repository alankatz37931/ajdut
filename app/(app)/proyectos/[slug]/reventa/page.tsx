import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { formatDate } from "@/lib/utils/format";
import { ResaleSellerPanel } from "./ResaleSellerPanel";

type Params = { params: Promise<{ slug: string }> };

export const metadata = { title: "Reventa de acciones · AJDUT" };

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

export default async function ProjectResalePage({ params }: Params) {
  const user = await requireSession();
  const { slug } = await params;

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

  // Participaciones del usuario en este proyecto.
  const myParticipations = await prisma.participation.findMany({
    where: {
      projectId: project.id,
      currentOwnerId: user.id,
      isPlatformStake: false,
    },
    orderBy: { acquiredAt: "asc" },
    select: { id: true, serialCode: true, shareCount: true, status: true },
  });

  // Listings activos del proyecto.
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

  // Miembros del proyecto (titulares actuales) — opciones de comprador.
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

  // Listing propio por participación.
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

  // Tablón: listings de otros miembros, todavía disponibles.
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
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          Reventa de acciones
        </h1>
        <p className="mt-3 text-navy/70 leading-relaxed max-w-2xl">
          Listá tus acciones para que otros miembros de la comunidad puedan
          adquirirlas. Cuando acordás con un comprador lo designás acá, y el
          equipo de AJDUT aprueba el traspaso para que quede registrado.
        </p>
      </div>

      <section className="mt-10">
        <p className="eyebrow !text-navy hairline-b pb-3 mb-6">
          01 · Tus participaciones
        </p>
        {sellerRows.length === 0 ? (
          <p className="text-navy/60">
            No tenés participaciones en este proyecto para revender.
          </p>
        ) : (
          <ResaleSellerPanel
            projectSlug={project.slug}
            rows={sellerRows}
            members={projectMembers}
          />
        )}
      </section>

      <section className="mt-14">
        <p className="eyebrow !text-navy hairline-b pb-3 mb-6">
          02 · Tablón de reventa
        </p>
        {boardListings.length === 0 ? (
          <p className="text-navy/60">
            No hay acciones en reventa en este proyecto por ahora.
          </p>
        ) : (
          <ul className="space-y-4">
            {boardListings.map((l) => (
              <li key={l.id} className="hairline p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-sans text-navy">
                    {l.seller.alias ?? l.seller.fullName}
                  </span>
                  <span className="eyebrow !text-navy/50">
                    {fmtInt(l.participation.shareCount)} acciones ·{" "}
                    {formatDate(l.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-navy/80 text-sm leading-relaxed whitespace-pre-line">
                  {l.intentNote}
                </p>
                <p className="mt-3 eyebrow !text-navy/50">
                  Contacto:{" "}
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

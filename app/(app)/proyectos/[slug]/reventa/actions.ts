"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/services/errors";
import {
  listForResale,
  closeResaleDeal,
  cancelResale,
} from "@/lib/services/participation";
import { notifyAdminsResaleTransfer } from "@/lib/email/notifications";

export type ResaleResult = { ok: true } | { ok: false; error: string };

/**
 * El titular de una participación la pone en el tablón de reventa.
 */
export async function listForResaleAction(
  projectSlug: string,
  participationId: string,
  intentNote: string,
  contactChannel: string
): Promise<ResaleResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const participation = await prisma.participation.findUnique({
    where: { id: participationId },
    select: { projectId: true, currentOwnerId: true },
  });
  if (!participation || participation.projectId !== project.id) {
    return { ok: false, error: "Participación no encontrada." };
  }
  if (participation.currentOwnerId !== user.id) {
    return { ok: false, error: "Solo el titular puede listar esta participación." };
  }
  if (contactChannel.trim().length < 3) {
    return { ok: false, error: "Indicá un medio de contacto válido." };
  }

  try {
    await listForResale({
      participationId,
      sellerId: user.id,
      intentNote,
      contactChannel: contactChannel.trim(),
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("listForResaleAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * El vendedor designa al comprador con quien cerró el trato. El traspaso
 * queda pendiente de aprobación del equipo de AJDUT.
 */
export async function proposeBuyerAction(
  projectSlug: string,
  resaleListingId: string,
  proposedBuyerId: string
): Promise<ResaleResult> {
  const user = await requireSession();

  if (!proposedBuyerId) {
    return { ok: false, error: "Elegí un comprador." };
  }

  try {
    await closeResaleDeal({
      resaleListingId,
      sellerId: user.id,
      proposedBuyerId,
      // El vendedor designa = confirma el trato. La aprobación final es del admin.
      sellerSignedAt: new Date(),
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("proposeBuyerAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  revalidatePath("/admin/reventas");

  // Aviso a los admins de que hay un traspaso para aprobar — fire-and-forget.
  after(async () => {
    const listing = await prisma.resaleListing.findUnique({
      where: { id: resaleListingId },
      select: {
        intentNote: true,
        proposedBuyerId: true,
        seller: { select: { fullName: true, alias: true } },
        project: { select: { name: true } },
        participation: { select: { shareCount: true } },
      },
    });
    if (!listing || !listing.proposedBuyerId) return;
    const buyer = await prisma.user.findUnique({
      where: { id: listing.proposedBuyerId },
      select: { fullName: true, alias: true },
    });
    await notifyAdminsResaleTransfer({
      projectName: listing.project.name,
      sellerName: listing.seller.alias ?? listing.seller.fullName,
      buyerName: buyer ? buyer.alias ?? buyer.fullName : "—",
      shareCount: listing.participation.shareCount,
      intentNote: listing.intentNote,
    });
  });

  return { ok: true };
}

/**
 * El vendedor (o un admin) cancela una reventa todavía no aprobada.
 */
export async function cancelResaleAction(
  projectSlug: string,
  resaleListingId: string
): Promise<ResaleResult> {
  const user = await requireSession();

  try {
    await cancelResale({ resaleListingId, actorId: user.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("cancelResaleAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  return { ok: true };
}

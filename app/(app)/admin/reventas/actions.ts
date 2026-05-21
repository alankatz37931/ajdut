"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/services/errors";
import { validateTransfer, rejectTransfer } from "@/lib/services/participation";
import {
  notifyResaleApproved,
  notifyResaleRejected,
} from "@/lib/email/notifications";

export type AdminResaleResult = { ok: true } | { ok: false; error: string };

/**
 * El admin aprueba el traspaso: se ejecuta el cambio de titularidad y queda
 * registrado en la cadena de propiedad (OwnershipHistory).
 */
export async function approveTransferAction(
  resaleListingId: string
): Promise<AdminResaleResult> {
  const admin = await requireRole(["ADMIN"]);

  try {
    await validateTransfer({
      resaleListingId,
      adminId: admin.id,
      reason:
        "Reventa aprobada — traspaso de titularidad validado por el equipo de AJDUT.",
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("approveTransferAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath("/admin/reventas");
  revalidatePath("/partner");

  // Aviso al vendedor y al comprador — fire-and-forget.
  after(async () => {
    const listing = await prisma.resaleListing.findUnique({
      where: { id: resaleListingId },
      select: {
        proposedBuyerId: true,
        seller: { select: { fullName: true, alias: true, email: true } },
        project: { select: { name: true, slug: true } },
        participation: { select: { shareCount: true } },
      },
    });
    if (!listing) return;
    const buyer = listing.proposedBuyerId
      ? await prisma.user.findUnique({
          where: { id: listing.proposedBuyerId },
          select: { fullName: true, alias: true, email: true },
        })
      : null;
    const recipients = [listing.seller.email];
    if (buyer?.email) recipients.push(buyer.email);
    await notifyResaleApproved({
      to: recipients,
      projectSlug: listing.project.slug,
      projectName: listing.project.name,
      sellerName: listing.seller.alias ?? listing.seller.fullName,
      buyerName: buyer ? buyer.alias ?? buyer.fullName : "—",
      shareCount: listing.participation.shareCount,
    });
  });

  return { ok: true };
}

/**
 * El admin rechaza el traspaso: la reventa vuelve al tablón para que el
 * vendedor pueda corregir o designar otro comprador.
 */
export async function rejectTransferAction(
  resaleListingId: string,
  note: string
): Promise<AdminResaleResult> {
  const admin = await requireRole(["ADMIN"]);

  const trimmedNote = note.trim();
  if (trimmedNote.length < 10) {
    return { ok: false, error: "La nota debe tener al menos 10 caracteres." };
  }

  try {
    await rejectTransfer({
      resaleListingId,
      adminId: admin.id,
      note: trimmedNote,
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("rejectTransferAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath("/admin/reventas");
  revalidatePath("/partner");

  // Aviso al vendedor — fire-and-forget.
  after(async () => {
    const listing = await prisma.resaleListing.findUnique({
      where: { id: resaleListingId },
      select: {
        seller: { select: { email: true } },
        project: { select: { name: true, slug: true } },
        participation: { select: { shareCount: true } },
      },
    });
    if (!listing) return;
    await notifyResaleRejected({
      to: listing.seller.email,
      projectSlug: listing.project.slug,
      projectName: listing.project.name,
      shareCount: listing.participation.shareCount,
      note: trimmedNote,
    });
  });

  return { ok: true };
}

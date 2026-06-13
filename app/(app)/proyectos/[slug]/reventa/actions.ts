"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { DomainError } from "@/lib/services/errors";
import {
  listForResale,
  acquireResale,
  cancelResale,
  confirmResaleOwner,
} from "@/lib/services/participation";
import { notifyOwnerResalePending } from "@/lib/email/notifications";

export type ResaleResult = { ok: true } | { ok: false; error: string };

/**
 * El titular de una participación la pone en el tablón de reventa.
 *
 * Soporta reventa parcial: `shareCount` puede ser menor a la cantidad total
 * de la participación. `proposedPricePerShare` es un decimal en formato
 * string (preserve precisión, evita pérdida por float al cruzar la red).
 */
export async function listForResaleAction(
  projectSlug: string,
  participationId: string,
  intentNote: string,
  contactChannel: string,
  shareCount: number,
  proposedPricePerShare: string
): Promise<ResaleResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.reventa.errors;
  const s = dict.reventa.seller;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true },
  });
  if (!project) return { ok: false, error: e.projectNotFound };

  const participation = await prisma.participation.findUnique({
    where: { id: participationId },
    select: { projectId: true, currentOwnerId: true },
  });
  if (!participation || participation.projectId !== project.id) {
    return { ok: false, error: e.participationNotFound };
  }
  if (participation.currentOwnerId !== user.id) {
    return { ok: false, error: e.notOwner };
  }
  if (contactChannel.trim().length < 3) {
    return { ok: false, error: e.contactInvalid };
  }
  if (!Number.isInteger(shareCount) || shareCount < 1) {
    return { ok: false, error: s.errShareCountOutOfRange };
  }
  // Decimal parse de boundary: rechazar NaN, negativo o cero. El servicio
  // re-valida con Prisma.Decimal, esto es defensa en profundidad.
  const priceNum = Number(proposedPricePerShare);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return { ok: false, error: s.errPriceInvalid };
  }

  try {
    await listForResale({
      participationId,
      sellerId: user.id,
      intentNote,
      contactChannel: contactChannel.trim(),
      shareCount,
      proposedPricePerShare,
    });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("listForResaleAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Compra iniciada por el comprador (first-to-acquire): un socio aprobado
 * adquiere una publicación libre del tablón. El primero en adquirirla la
 * reserva → pasa a validación del founder + ejecución del admin. El comprador
 * ya queda confirmado (la inició él logueado), por eso no se le manda email; el
 * founder sí recibe aviso de que tiene una reventa para validar.
 */
export async function acquireResaleAction(
  projectSlug: string,
  resaleListingId: string
): Promise<ResaleResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.reventa.errors;

  try {
    const r = await acquireResale({ resaleListingId, buyerId: user.id });

    // Email al founder avisándole que tiene una reventa para validar.
    const owner = await prisma.user.findUnique({
      where: { id: r.ownerId },
      select: { email: true },
    });
    if (owner?.email) {
      await notifyOwnerResalePending({
        to: owner.email,
        projectSlug,
        projectName: r.projectName,
        sellerName: r.sellerName,
        buyerName: r.buyerName,
        shareCount: r.shareCount,
        intentNote: "",
      });
    }
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("acquireResaleAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  revalidatePath("/admin/reventas");
  return { ok: true };
}

/**
 * El project owner (founder) valida una reventa de su proyecto. Parte de la
 * validación tripartita: sin su OK el admin no puede ejecutar el traspaso.
 */
export async function confirmResaleOwnerAction(
  projectSlug: string,
  resaleListingId: string
): Promise<ResaleResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.reventa.errors;

  try {
    await confirmResaleOwner({ resaleListingId, actorId: user.id });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("confirmResaleOwnerAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath("/admin/reventas");
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
  const dict = await getDict();
  const e = dict.reventa.errors;

  try {
    await cancelResale({ resaleListingId, actorId: user.id });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("cancelResaleAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath(`/proyectos/${projectSlug}/reventa`);
  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath("/partner");
  return { ok: true };
}

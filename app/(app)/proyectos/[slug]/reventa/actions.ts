"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { DomainError } from "@/lib/services/errors";
import {
  listForResale,
  closeResaleDeal,
  cancelResale,
  confirmResaleOwner,
} from "@/lib/services/participation";
import {
  notifyResaleBuyerConfirm,
  notifyOwnerResalePending,
} from "@/lib/email/notifications";

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
 * El vendedor designa al comprador con quien cerró el trato. El traspaso
 * queda pendiente de aprobación del equipo de AJDUT.
 */
export async function proposeBuyerAction(
  projectSlug: string,
  resaleListingId: string,
  proposedBuyerId: string
): Promise<ResaleResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.reventa.errors;

  if (!proposedBuyerId) {
    return { ok: false, error: e.buyerRequired };
  }

  try {
    const result = await closeResaleDeal({
      resaleListingId,
      sellerId: user.id,
      proposedBuyerId,
      sellerSignedAt: new Date(),
    });

    // Validación tripartita: email + banner in-app ya disparados. Enviamos los
    // mails fuera de la transacción (fire-and-forget, no rompen el flujo).
    const firstName = result.buyerFullName.trim().split(/\s+/)[0] || "Hola";
    const priceNum = result.pricePerShare ? Number(result.pricePerShare) : null;
    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(n);

    await notifyResaleBuyerConfirm({
      to: result.buyerEmail,
      buyerFirstName: firstName,
      sellerName: result.sellerName,
      projectName: result.projectName,
      shareCount: result.shareCount,
      pricePerShareFormatted: priceNum !== null ? fmtMoney(priceNum) : null,
      totalFormatted:
        priceNum !== null ? fmtMoney(priceNum * result.shareCount) : null,
      confirmToken: result.buyerConfirmationToken,
      expiresAt: result.buyerConfirmationExpiresAt,
    });

    // Email al founder avisándole que tiene una reventa para validar.
    const owner = await prisma.user.findUnique({
      where: { id: result.ownerId },
      select: { email: true },
    });
    if (owner?.email) {
      await notifyOwnerResalePending({
        to: owner.email,
        projectSlug,
        projectName: result.projectName,
        sellerName: result.sellerName,
        buyerName: result.buyerFullName,
        shareCount: result.shareCount,
        intentNote: "",
      });
    }
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("proposeBuyerAction", err);
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

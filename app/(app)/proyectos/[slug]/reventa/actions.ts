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
} from "@/lib/services/participation";

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
  const dict = await getDict();
  const e = dict.reventa.errors;

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

  try {
    await listForResale({
      participationId,
      sellerId: user.id,
      intentNote,
      contactChannel: contactChannel.trim(),
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
    await closeResaleDeal({
      resaleListingId,
      sellerId: user.id,
      proposedBuyerId,
      sellerSignedAt: new Date(),
    });
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

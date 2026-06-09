"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getDict } from "@/lib/i18n";
import { DomainError } from "@/lib/services/errors";
import { validateTransfer, rejectTransfer } from "@/lib/services/participation";

export type AdminResaleResult = { ok: true } | { ok: false; error: string };

/**
 * El admin aprueba el traspaso: se ejecuta el cambio de titularidad y queda
 * registrado en la cadena de propiedad (OwnershipHistory).
 */
export async function approveTransferAction(
  resaleListingId: string
): Promise<AdminResaleResult> {
  const admin = await requireRole(["ADMIN"]);
  const dict = await getDict();
  const e = dict.adminReventas.errors;

  try {
    await validateTransfer({
      resaleListingId,
      adminId: admin.id,
      reason:
        "Reventa aprobada — traspaso de titularidad validado por el equipo de AJDUT.",
    });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("approveTransferAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath("/admin/reventas");
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Override de la validación tripartita: el admin ejecuta el traspaso aunque el
 * comprador o el founder no hayan confirmado por la plataforma. Requiere una
 * nota (>= 10 chars). Queda auditado como RESALE.ADMIN_OVERRIDE.
 */
export async function overrideTransferAction(
  resaleListingId: string,
  note: string
): Promise<AdminResaleResult> {
  const admin = await requireRole(["ADMIN"]);
  const dict = await getDict();
  const e = dict.adminReventas.errors;

  const trimmedNote = note.trim();
  if (trimmedNote.length < 10) {
    return { ok: false, error: e.noteTooShort };
  }

  try {
    await validateTransfer({
      resaleListingId,
      adminId: admin.id,
      reason:
        "Reventa aprobada con override de validación tripartita por el equipo de AJDUT.",
      override: true,
      overrideNote: trimmedNote,
    });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("overrideTransferAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath("/admin/reventas");
  revalidatePath("/partner");
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
  const dict = await getDict();
  const e = dict.adminReventas.errors;

  const trimmedNote = note.trim();
  if (trimmedNote.length < 10) {
    return { ok: false, error: e.noteTooShort };
  }

  try {
    await rejectTransfer({
      resaleListingId,
      adminId: admin.id,
      note: trimmedNote,
    });
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("rejectTransferAction", err);
    return { ok: false, error: e.serverError };
  }

  revalidatePath("/admin/reventas");
  revalidatePath("/partner");
  return { ok: true };
}

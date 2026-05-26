"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { recordAudit } from "@/lib/services/audit";
import { normalizeOptionalUrl } from "@/lib/utils/url";

export type ProfileResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export async function updateNameAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.profile.errors;

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) {
    return { ok: false, error: e.nameTooShort, field: "fullName" };
  }

  // Alias es opcional. String vacío se persiste como null para caer al fullName
  // en cap tables y vistas de terceros.
  const aliasRaw = String(formData.get("alias") ?? "").trim();
  const alias = aliasRaw.length === 0 ? null : aliasRaw;
  if (alias !== null) {
    if (alias.length < 2) {
      return { ok: false, error: e.aliasTooShort, field: "alias" };
    }
    if (alias.length > 60) {
      return { ok: false, error: e.aliasTooLong, field: "alias" };
    }
  }

  // Contacto: país + teléfono — campos editables post-aplicación.
  // Vacío se persiste como null para que la UI muestre "—" en vez de "".
  const countryRaw = String(formData.get("country") ?? "").trim();
  const country = countryRaw.length === 0 ? null : countryRaw;
  if (country !== null && country.length > 60) {
    return { ok: false, error: e.countryTooLong, field: "country" };
  }
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw.length === 0 ? null : phoneRaw;
  if (phone !== null && phone.length > 40) {
    return { ok: false, error: e.phoneTooLong, field: "phone" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName,
      alias,
      country,
      phone,
    },
  });
  revalidatePath("/perfil");
  return { ok: true };
}

/**
 * Actualiza solo el avatar — separado de updateNameAction porque el
 * HeaderAvatar vive en otro client component y no puede sincronizar el
 * snapshot completo de campos. Acepta "" para quitar la foto.
 */
export async function updateAvatarAction(rawUrl: string): Promise<ProfileResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.profile.errors;

  const normalized = normalizeOptionalUrl(rawUrl);
  if (normalized === "INVALID") {
    return { ok: false, error: e.avatarInvalid, field: "avatarUrl" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: normalized },
  });
  revalidatePath("/perfil");
  return { ok: true };
}

export async function changePasswordAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.profile.errors;

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");

  if (next.length < 10) {
    return { ok: false, error: e.pwTooShort, field: "newPassword" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser?.passwordHash) {
    return { ok: false, error: e.pwUnavailable };
  }
  const ok = await bcrypt.compare(current, dbUser.passwordHash);
  if (!ok) {
    return { ok: false, error: e.pwCurrentWrong, field: "currentPassword" };
  }

  const hash = await bcrypt.hash(next, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  await recordAudit(prisma, {
    actorId: user.id,
    action: "USER.CREATED",
    entityType: "User",
    entityId: user.id,
    payload: { event: "PASSWORD_CHANGED" },
  });

  revalidatePath("/perfil");
  return { ok: true };
}

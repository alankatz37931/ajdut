"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/lib/services/audit";

export type ProfileResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

/**
 * Valida que un valor sea URL absoluta http(s) o null. Usado para el campo
 * avatarUrl, que viene de la URL pública del archivo subido a R2.
 */
function normalizeOptionalUrl(raw: unknown): string | null | "INVALID" {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "INVALID";
    if (s.length > 2048) return "INVALID";
    return s;
  } catch {
    return "INVALID";
  }
}

export async function updateNameAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireSession();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) {
    return { ok: false, error: "El nombre debe tener al menos 2 caracteres.", field: "fullName" };
  }

  // Alias es opcional. String vacío se persiste como null para caer al fullName
  // en cap tables y vistas de terceros.
  const aliasRaw = String(formData.get("alias") ?? "").trim();
  const alias = aliasRaw.length === 0 ? null : aliasRaw;
  if (alias !== null) {
    if (alias.length < 2) {
      return { ok: false, error: "El alias debe tener al menos 2 caracteres (o dejarlo vacío).", field: "alias" };
    }
    if (alias.length > 60) {
      return { ok: false, error: "El alias no puede superar los 60 caracteres.", field: "alias" };
    }
  }

  // avatarUrl es opcional. Viene de un hidden input llenado por el componente
  // FileUpload con la URL pública del archivo subido a R2.
  const avatar = normalizeOptionalUrl(formData.get("avatarUrl"));
  if (avatar === "INVALID") {
    return { ok: false, error: "La URL de la foto de perfil no es válida.", field: "avatarUrl" };
  }

  // Contacto: país + teléfono — campos editables post-aplicación.
  // Vacío se persiste como null para que la UI muestre "—" en vez de "".
  const countryRaw = String(formData.get("country") ?? "").trim();
  const country = countryRaw.length === 0 ? null : countryRaw;
  if (country !== null && country.length > 60) {
    return { ok: false, error: "El país no puede superar los 60 caracteres.", field: "country" };
  }
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw.length === 0 ? null : phoneRaw;
  if (phone !== null && phone.length > 40) {
    return { ok: false, error: "El teléfono no puede superar los 40 caracteres.", field: "phone" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName,
      alias,
      avatarUrl: avatar,
      country,
      phone,
    },
  });
  revalidatePath("/perfil");
  return { ok: true };
}

export async function changePasswordAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireSession();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");

  if (next.length < 10) {
    return { ok: false, error: "La nueva contraseña debe tener al menos 10 caracteres.", field: "newPassword" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser?.passwordHash) {
    return { ok: false, error: "No podés cambiar la contraseña en este momento." };
  }
  const ok = await bcrypt.compare(current, dbUser.passwordHash);
  if (!ok) {
    return { ok: false, error: "La contraseña actual es incorrecta.", field: "currentPassword" };
  }

  const hash = await bcrypt.hash(next, 10);
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

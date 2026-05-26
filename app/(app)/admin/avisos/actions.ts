"use server";

import { after } from "next/server";
import type { Prisma, UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { notifyAdminBroadcast } from "@/lib/email/notifications";
import { recordAudit } from "@/lib/services/audit";

export type BroadcastFilters = {
  roles: UserRole[];       // [] = todos los roles
  onlyActive: boolean;
  projectIds: string[];    // [] = sin filtro de proyecto
};

export type CountResult =
  | { ok: true; count: number; filters: BroadcastFilters }
  | { ok: false; error: string };

export type SendResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

const VALID_ROLES: UserRole[] = ["ADMIN", "PROJECT_OWNER", "CO_ADMIN", "PARTNER"];

const MEMBER_STATUSES = [
  "ASSIGNED",
  "IN_RESALE",
  "TRANSFER_PENDING",
  "IN_NEGOTIATION",
] as const;

function parseFilters(formData: FormData): BroadcastFilters {
  const rawRoles = formData.getAll("roles").map((v) => String(v));
  const roles = VALID_ROLES.filter((r) => rawRoles.includes(r));
  const onlyActive = String(formData.get("onlyActive") ?? "") === "true";
  const projectIds = formData
    .getAll("projectId")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  return { roles, onlyActive, projectIds };
}

/**
 * Resuelve el conjunto de emails únicos que matchean los filtros.
 * Las condiciones se combinan con AND. Si projectId está presente, solo
 * incluye usuarios que son `currentOwner` de alguna participación activa
 * de ese proyecto (intersección con el filtro de rol).
 */
async function resolveRecipients(
  filters: BroadcastFilters
): Promise<{ emails: string[]; userIds: string[] }> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
  };
  if (filters.roles.length > 0) {
    where.role = { in: filters.roles };
  }
  if (filters.onlyActive) {
    where.isActive = true;
  }
  if (filters.projectIds.length > 0) {
    where.participationsOwned = {
      some: {
        projectId: { in: filters.projectIds },
        isPlatformStake: false,
        status: { in: [...MEMBER_STATUSES] },
      },
    };
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
  });

  const emails = new Set<string>();
  const userIds: string[] = [];
  for (const u of users) {
    if (u.email && !emails.has(u.email)) {
      emails.add(u.email);
      userIds.push(u.id);
    }
  }
  return { emails: [...emails], userIds };
}

export async function countRecipientsAction(formData: FormData): Promise<CountResult> {
  await requireRole(["ADMIN"]);
  const filters = parseFilters(formData);
  try {
    const { emails } = await resolveRecipients(filters);
    return { ok: true, count: emails.length, filters };
  } catch (e) {
    console.error("countRecipientsAction", e);
    return { ok: false, error: "No se pudo calcular el conteo." };
  }
}

export async function sendAdminBroadcastAction(formData: FormData): Promise<SendResult> {
  const admin = await requireRole(["ADMIN"]);

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length === 0) return { ok: false, error: "El asunto no puede estar vacío." };
  if (subject.length > 160) return { ok: false, error: "El asunto no puede superar los 160 caracteres." };
  if (body.length === 0) return { ok: false, error: "El mensaje no puede estar vacío." };
  if (body.length > 5000) return { ok: false, error: "El mensaje no puede superar los 5000 caracteres." };

  const filters = parseFilters(formData);
  const { emails } = await resolveRecipients(filters);
  if (emails.length === 0) {
    return { ok: false, error: "No hay destinatarios para esos filtros." };
  }

  // Auditoría: registramos primero el evento con count y filtros aplicados.
  // El envío real va fire-and-forget — si Resend falla queda en EMAIL.FAILED
  // pero el evento de broadcast sigue en pie como decisión del admin.
  await recordAudit(prisma, {
    actorId: admin.id,
    action: "ADMIN_BROADCAST.SENT",
    entityType: "AdminBroadcast",
    entityId: `${Date.now()}`,
    payload: {
      subject,
      recipientCount: emails.length,
      filters: {
        roles: filters.roles,
        onlyActive: filters.onlyActive,
        projectIds: filters.projectIds,
      },
    },
  });

  after(async () => {
    await notifyAdminBroadcast({ to: emails, subject, body });
  });

  return { ok: true, count: emails.length };
}

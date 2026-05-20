"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { createPasswordSetupToken } from "@/lib/services/password-setup";
import { assignSharesToInvestor } from "@/lib/services/share-assignment";
import { recordAudit } from "@/lib/services/audit";
import { DomainError } from "@/lib/services/errors";
import { notifyFounderInvite } from "@/lib/email/notifications";

export type InviteResult =
  | { ok: true; data: { wasNew: boolean; shareCount: number; email: string } }
  | { ok: false; error: string; code?: string };

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "Hola";
  const head = trimmed.split(/\s+/)[0];
  return head ?? trimmed;
}

export async function inviteMemberAction(
  projectSlug: string,
  formData: FormData
): Promise<InviteResult> {
  const actor = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: actor.id,
    userRole: actor.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    return { ok: false, error: "No tenés permiso para invitar miembros a este proyecto." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const sharesRaw = String(formData.get("shareCount") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const shareCount = Number.parseInt(sharesRaw, 10);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Ingresá un email válido." };
  }
  if (fullName.length < 2) {
    return { ok: false, error: "Ingresá el nombre completo del invitado." };
  }
  if (!Number.isFinite(shareCount) || shareCount < 1) {
    return { ok: false, error: "La cantidad de acciones debe ser un entero mayor o igual a 1." };
  }
  if (message.length > 1000) {
    return { ok: false, error: "El mensaje no puede superar los 1000 caracteres." };
  }

  // Pre-check: ¿hay suficientes acciones disponibles?
  const pool = await prisma.participation.findFirst({
    where: { projectId: project.id, status: "AVAILABLE" },
    select: { shareCount: true },
  });
  const available = pool?.shareCount ?? 0;
  if (shareCount > available) {
    return {
      ok: false,
      error: `Solo hay ${available} acciones disponibles para asignar.`,
    };
  }

  try {
    const { wasNew, setupToken, expiresAt, inviteeUserId, assignment } =
      await prisma.$transaction(async (tx) => {
        // 1. Resolver / crear el User invitado
        const existing = await tx.user.findUnique({ where: { email } });
        let inviteeId: string;
        let wasNew = false;
        let setupToken: string | null = null;
        let expiresAt: Date | null = null;

        if (existing) {
          if (existing.deletedAt) {
            throw new DomainError(
              "USER_DELETED",
              "Ese usuario fue eliminado y no puede recibir nuevas asignaciones."
            );
          }
          if (!existing.isActive) {
            throw new DomainError(
              "USER_INACTIVE",
              "Ese usuario está suspendido. Reactivalo antes de asignarle acciones."
            );
          }
          inviteeId = existing.id;
        } else {
          const newUser = await tx.user.create({
            data: {
              email,
              fullName,
              role: "PARTNER",
              passwordHash: null,
              isActive: true,
            },
          });
          inviteeId = newUser.id;
          wasNew = true;

          const token = await createPasswordSetupToken(tx, newUser.id, "INITIAL_SETUP");
          setupToken = token.token;
          expiresAt = token.expiresAt;

          await recordAudit(tx, {
            actorId: actor.id,
            projectId: project.id,
            action: "USER.CREATED",
            entityType: "User",
            entityId: newUser.id,
            payload: {
              role: "PARTNER",
              source: "FOUNDER_INVITE",
              awaitingPasswordSetup: true,
            },
          });
        }

        // 2. Asignar las acciones desde el pool AVAILABLE
        const assignment = await assignSharesToInvestor({
          tx,
          projectId: project.id,
          projectSlug: project.slug,
          actorId: actor.id,
          toUserId: inviteeId,
          shareCount,
          reason: `Invitación directa del founder — ${shareCount} acciones${message ? ` (con mensaje)` : ""}.`,
        });

        // 3. Auditoría de la invitación (alto nivel — la asignación queda en
        // PARTICIPATION.ASSIGNED + CERTIFICATE.ISSUED dentro del service).
        await recordAudit(tx, {
          actorId: actor.id,
          projectId: project.id,
          action: "PARTICIPATION.INVITED",
          entityType: "Participation",
          entityId: assignment.participationId,
          payload: {
            inviteeUserId: inviteeId,
            inviteeEmail: email,
            inviteeFullName: fullName,
            shareCount,
            wasNew,
          },
        });

        return {
          wasNew,
          setupToken,
          expiresAt,
          inviteeUserId: inviteeId,
          assignment,
        };
      });

    // 4. Email fuera de la transacción (fire-and-forget)
    after(async () => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.AUTH_URL ??
        "http://localhost:3001";
      const setupUrl =
        wasNew && setupToken
          ? `${appUrl}/establecer-contrasena/${setupToken}`
          : null;

      await notifyFounderInvite({
        to: email,
        inviteeFirstName: firstName(fullName),
        founderName: actor.name ?? project.name,
        projectName: project.name,
        shareCount: assignment.shareCount,
        message: message.length > 0 ? message : null,
        setupUrl,
        expiresAt: expiresAt ?? null,
        isNew: wasNew,
      });
    });

    revalidatePath(`/founder/${project.slug}`);
    revalidatePath(`/proyectos/${project.slug}`);

    // inviteeUserId queda implícito en la cadena de auditoría; no se devuelve
    // al cliente para no exponer ids internos.
    void inviteeUserId;

    return {
      ok: true,
      data: { wasNew, shareCount: assignment.shareCount, email },
    };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("inviteMemberAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }
}

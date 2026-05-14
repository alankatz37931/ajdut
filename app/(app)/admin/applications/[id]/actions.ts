"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/services/application";
import { DomainError } from "@/lib/services/errors";
import {
  notifyApplicantApproved,
  notifyApplicantRejected,
} from "@/lib/email/notifications";
import { prisma } from "@/lib/db/client";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type ApproveResult = {
  userId: string;
  email: string;
  fullName: string;
  expiresAtISO: string;
};

export async function approveApplicationAction(
  applicationId: string,
  role: "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN"
): Promise<ActionResult<ApproveResult>> {
  const admin = await requireRole(["ADMIN"]);

  try {
    const { userId, setupToken, expiresAt } = await approveApplication({
      applicationId,
      adminId: admin.id,
      role,
    });

    const newUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, fullName: true, role: true },
    });

    // Notificación al aplicante con el link de "establecer contraseña".
    // Fire-and-forget: se manda después de devolver el resultado al admin.
    after(async () => {
      await notifyApplicantApproved({
        to: newUser.email,
        fullName: newUser.fullName,
        role,
        setupToken,
        expiresAt,
      });
    });

    revalidatePath(`/admin/applications/${applicationId}`);
    revalidatePath("/admin/applications");
    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        userId,
        email: newUser.email,
        fullName: newUser.fullName,
        expiresAtISO: expiresAt.toISOString(),
      },
    };
  } catch (e) {
    return errorFrom(e);
  }
}

export async function rejectApplicationAction(
  applicationId: string,
  rejectionNote: string
): Promise<ActionResult> {
  const admin = await requireRole(["ADMIN"]);
  try {
    await rejectApplication({
      applicationId,
      adminId: admin.id,
      rejectionNote,
    });

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { email: true, fullName: true },
    });
    if (app) {
      // Fire-and-forget: no bloquea la respuesta al admin
      after(async () => {
        await notifyApplicantRejected({
          to: app.email,
          fullName: app.fullName,
          rejectionNote,
        });
      });
    }

    revalidatePath(`/admin/applications/${applicationId}`);
    revalidatePath("/admin/applications");
    return { ok: true, data: undefined };
  } catch (e) {
    return errorFrom(e);
  }
}

function errorFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof DomainError) {
    return { ok: false, error: e.message, code: e.code };
  }
  console.error(e);
  return { ok: false, error: "Error interno del servidor." };
}

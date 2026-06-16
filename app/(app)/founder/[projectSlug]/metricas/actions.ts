"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/services/errors";
import {
  addMetric,
  removeMetric,
  METRIC_KINDS,
  type MetricKind,
} from "@/lib/services/project-content";

type Result =
  | { ok: true }
  | { ok: false; error: string; code?: string; field?: string };

/**
 * DomainError → message + code + field (si vino en details).
 * Cualquier otro Error → log servidor + mensaje genérico, para no filtrar
 * códigos Prisma ni nombres de tabla al cliente.
 */
function toFailure(e: unknown, tag: string): Extract<Result, { ok: false }> {
  if (e instanceof DomainError) {
    const field = (e.details as { field?: string } | undefined)?.field;
    return { ok: false, error: e.message, code: e.code, field };
  }
  console.error(`[metricas:${tag}]`, e);
  return { ok: false, error: "Error inesperado." };
}

async function resolveProjectId(slug: string, ownerId: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!project || project.ownerId !== ownerId) return null;
  return project.id;
}

function parseKind(value: string): MetricKind | null {
  return (METRIC_KINDS as readonly string[]).includes(value) ? (value as MetricKind) : null;
}

export async function addMetricAction(
  projectSlug: string,
  formData: FormData
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER", "ADMIN"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  const kindRaw = String(formData.get("kind") ?? "").trim();
  const kind = parseKind(kindRaw);
  if (!kind) return { ok: false, error: "Tipo de métrica inválido.", field: "kind" };

  const customLabel = String(formData.get("customLabel") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "0");
  const value = Number.parseFloat(valueRaw);
  const unit = String(formData.get("unit") ?? "").trim();
  const asOfStr = String(formData.get("asOf") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "PUBLIC_TO_HOLDERS") as
    | "PRIVATE"
    | "PUBLIC_TO_HOLDERS";

  const asOf = asOfStr ? new Date(asOfStr) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return { ok: false, error: "Fecha inválida.", field: "asOf" };
  }

  try {
    await addMetric({
      actorId: user.id,
      projectId,
      kind,
      customLabel: customLabel || null,
      value,
      unit,
      asOf,
      visibility,
    });
    revalidatePath(`/founder/${projectSlug}/metricas`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "addMetricAction");
  }
}

export async function removeMetricAction(
  projectSlug: string,
  metricId: string
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER", "ADMIN"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  try {
    await removeMetric({ actorId: user.id, projectId, metricId });
    revalidatePath(`/founder/${projectSlug}/metricas`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "removeMetricAction");
  }
}

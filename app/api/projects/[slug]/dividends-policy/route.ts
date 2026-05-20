import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getInfoRequest } from "@/lib/services/info-request";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/projects/[slug]/dividends-policy
 *
 * Devuelve un text/plain con la política de dividendos del proyecto:
 * nombre + frecuencia + texto de la política.
 *
 * Gating idéntico al de la ficha pública (sección "Políticas"):
 *  - OWNER / CO_ADMIN / ADMIN → siempre.
 *  - PARTNER → con InfoRequest APPROVED o si ya es socio (tiene shares).
 *  - VIEWER → solo si ya es socio del proyecto.
 *  - NONE / sin acceso → 404.
 */
export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ownerId: true,
      startupProfile: {
        select: {
          policyDividends: true,
          dividendsFrequency: true,
        },
      },
    },
  });
  if (!project) {
    return new NextResponse("Proyecto no encontrado.", { status: 404 });
  }

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canView) {
    return new NextResponse("Proyecto no encontrado.", { status: 404 });
  }

  // Gating de políticas (mismo criterio que la ficha del proyecto)
  const isPrivilegedReader =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";

  let canSee = isPrivilegedReader;
  if (!canSee) {
    if (access.role === "PARTNER") {
      const infoReq = await getInfoRequest(project.id, user.id);
      if (infoReq?.status === "APPROVED") canSee = true;
    }
    if (!canSee) {
      const myShares = await prisma.participation.count({
        where: { projectId: project.id, currentOwnerId: user.id },
      });
      if (myShares > 0) canSee = true;
    }
  }
  if (!canSee) {
    return new NextResponse("No tienes acceso a esta política.", { status: 403 });
  }

  const policy = project.startupProfile?.policyDividends?.trim() ?? "";
  const frequency = project.startupProfile?.dividendsFrequency?.trim() ?? "";

  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`POLÍTICA DE DIVIDENDOS`);
  lines.push(`Proyecto: ${project.name}`);
  lines.push(`Slug: ${project.slug}`);
  lines.push(`Generado: ${today}`);
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("");
  lines.push(`FRECUENCIA`);
  lines.push("");
  lines.push(frequency || "El project owner aún no declaró una frecuencia de dividendos.");
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("");
  lines.push(`POLÍTICA`);
  lines.push("");
  lines.push(policy || "El project owner aún no declaró una política de dividendos.");
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("");
  lines.push(
    "AJDUT registra esta política a título informativo. La política la declara el project owner y puede actualizarse en la ficha del proyecto."
  );
  lines.push("");

  const body = lines.join("\r\n");

  const safeSlug = project.slug.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = `politica-dividendos-${safeSlug}-${today}.txt`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

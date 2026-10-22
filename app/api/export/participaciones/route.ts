/**
 * GET /api/export/participaciones
 *
 * Devuelve un .xlsx con todos los proyectos y las personas que participan en
 * ellos, una fila por tenencia con su cantidad de acciones. Incluye las tres
 * fuentes: participaciones asignadas, equity de fundadores y acciones previas
 * (tenencias externas). Columnas: Proyecto · Persona · Tipo · Acciones.
 *
 * Datos sensibles de toda la plataforma (cap table cruzado) → solo ADMIN.
 * La descarga es directa (Content-Disposition: attachment), sin diálogos.
 */
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  buildHoldingsExportRows,
  type ExportProject,
  type HoldingType,
} from "@/lib/services/participations-export";

// exceljs usa Buffer/streams de Node → forzamos runtime Node (no edge).
export const runtime = "nodejs";

const TYPE_LABEL: Record<HoldingType, string> = {
  FOUNDER: "Fundador",
  EXTERNAL: "Acciones previas",
  PARTICIPATION: "Participación",
};

export async function GET() {
  await requireRole(["ADMIN"]);

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      name: true,
      totalShares: true,
      participations: {
        select: {
          shareCount: true,
          isPlatformStake: true,
          currentOwner: { select: { id: true, fullName: true } },
        },
      },
      startupProfile: {
        select: {
          founders: {
            select: { fullName: true, equityPercent: true, isActive: true },
          },
        },
      },
      externalHoldings: { select: { label: true, shareCount: true } },
    },
  });

  const mapped: ExportProject[] = projects.map((p) => ({
    name: p.name,
    totalShares: p.totalShares,
    participations: p.participations,
    founders: (p.startupProfile?.founders ?? []).map((f) => ({
      fullName: f.fullName,
      equityPercent: Number(f.equityPercent),
      isActive: f.isActive,
    })),
    externalHoldings: p.externalHoldings,
  }));

  const rows = buildHoldingsExportRows(mapped);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AJDUT";
  wb.created = new Date();

  const ws = wb.addWorksheet("Participaciones");
  ws.columns = [
    { header: "Proyecto", key: "projectName", width: 38 },
    { header: "Persona", key: "personName", width: 32 },
    { header: "Tipo", key: "type", width: 18 },
    { header: "Acciones", key: "shares", width: 14 },
  ];

  // Encabezado en negrita.
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      projectName: r.projectName,
      personName: r.personName,
      type: TYPE_LABEL[r.type] ?? r.type,
      shares: r.shares,
    });
  }

  // "Acciones" como número con separador de miles, alineado a la derecha.
  const sharesCol = ws.getColumn("shares");
  sharesCol.numFmt = "#,##0";
  sharesCol.alignment = { horizontal: "right" };

  const buffer = await wb.xlsx.writeBuffer();
  const data = new Uint8Array(buffer as ArrayBuffer);

  const today = new Date().toISOString().slice(0, 10);
  const filename = `participaciones-AJDUT-${today}.xlsx`;

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

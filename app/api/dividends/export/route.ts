import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/dividends/export
 *
 * Devuelve un CSV con todos los DividendPayment del usuario autenticado
 * (recipientId === user.id). Columnas:
 *   Fecha, Proyecto, Distribución, Período, Monto, Moneda, Estado, ConfirmadoAt
 *
 * Filosofía AJDUT: el socio puede llevarse su historial en cualquier momento.
 * El CSV es trazable (incluye estado del pago y fecha de confirmación).
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado por founder",
  RECEIVED: "Confirmado",
  DISPUTED: "En disputa",
  WAIVED: "Renunciado",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Comillas dobles, comas y saltos de línea fuerzan el quoting.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatIsoDate(d: Date | null | undefined): string {
  if (!d) return "";
  // YYYY-MM-DD — el receptor lo va a abrir en Excel/Sheets; mejor ISO
  // que un locale-specific que rompe orden.
  return d.toISOString().slice(0, 10);
}

function formatIsoDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString();
}

export async function GET() {
  const user = await requireSession();

  const payments = await prisma.dividendPayment.findMany({
    where: { recipientId: user.id },
    orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
    include: {
      distribution: {
        select: {
          title: true,
          fiscalPeriod: true,
          recordDate: true,
          project: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const headers = [
    "Fecha",
    "Proyecto",
    "Distribución",
    "Período",
    "Monto",
    "Moneda",
    "Estado",
    "ConfirmadoAt",
  ];

  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const p of payments) {
    // "Fecha" prioriza la fecha en la que el socio efectivamente cobró
    // (receivedAt). Si todavía no cobró pero el founder marcó enviado,
    // usamos sentAt. Caso DRAFT/PENDING/etc → recordDate como referencia.
    const fecha =
      p.receivedAt ?? p.sentAt ?? p.distribution.recordDate;
    const row = [
      csvEscape(formatIsoDate(fecha)),
      csvEscape(p.distribution.project.name),
      csvEscape(p.distribution.title),
      csvEscape(p.distribution.fiscalPeriod ?? ""),
      csvEscape(p.amount.toString()),
      csvEscape(p.currency),
      csvEscape(STATUS_LABEL[p.status] ?? p.status),
      csvEscape(formatIsoDateTime(p.receivedAt)),
    ];
    lines.push(row.join(","));
  }

  // BOM UTF-8: Excel en Windows abre el CSV con encoding correcto y
  // no destroza los acentos del título / nombre de proyecto.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  const today = new Date().toISOString().slice(0, 10);
  const filename = `dividendos-AJDUT-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import type { Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/utils/format";
import { AuditSearch } from "./AuditSearch";

export const metadata = { title: "Auditoría · AJDUT" };

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  "APPLICATION.SUBMITTED": "Aplicación enviada",
  "APPLICATION.REVIEW_STARTED": "Aplicación en revisión",
  "APPLICATION.APPROVED": "Aplicación aprobada",
  "APPLICATION.REJECTED": "Aplicación rechazada",
  "USER.CREATED": "Usuario creado",
  "USER.SUSPENDED": "Usuario suspendido",
  "USER.REACTIVATED": "Usuario reactivado",
  "PROJECT.CREATED": "Proyecto creado / editado",
  "PROJECT.SUBMITTED_FOR_APPROVAL": "Proyecto enviado a aprobación",
  "PROJECT.APPROVED": "Proyecto aprobado",
  "PROJECT.SUSPENDED": "Proyecto suspendido",
  "PROJECT.CLOSED": "Proyecto cerrado",
  "PARTICIPATION.CREATED": "Participación creada",
  "PARTICIPATION.LEAD_CREATED": "Interés de compra recibido",
  "PARTICIPATION.LEAD_DISMISSED": "Interés descartado",
  "PARTICIPATION.ASSIGNED": "Acciones asignadas",
  "PARTICIPATION.RESALE_LISTED": "Reventa publicada",
  "PARTICIPATION.RESALE_CANCELLED": "Reventa cancelada",
  "PARTICIPATION.RESALE_DEAL_CLOSED": "Reventa cerrada",
  "PARTICIPATION.TRANSFER_VALIDATED": "Transferencia validada",
  "PARTICIPATION.TRANSFER_REJECTED": "Transferencia rechazada",
  "CERTIFICATE.ISSUED": "Certificado emitido",
  "CERTIFICATE.REVOKED": "Certificado revocado",
  "REPORT.PUBLISHED": "Reporte publicado",
  "METRIC.RECORDED": "Métrica registrada",
  "MILESTONE.STATUS_CHANGED": "Estado de hito cambiado",
  "DISTRIBUTION.DRAFTED": "Dividendo en borrador",
  "DISTRIBUTION.ANNOUNCED": "Dividendo anunciado",
  "DISTRIBUTION.PAYMENT_SENT": "Pago de dividendo enviado",
  "DISTRIBUTION.PAYMENT_RECEIVED": "Pago de dividendo cobrado",
  "DISTRIBUTION.PAYMENT_DISPUTED": "Pago en disputa",
  "DISTRIBUTION.PAYMENT_RESOLVED": "Pago resuelto",
  "DISTRIBUTION.COMPLETED": "Dividendo completado",
  "DISTRIBUTION.CANCELLED": "Dividendo cancelado",
  "EMAIL.FAILED": "Email fallido",
  "RATE_LIMIT.HIT": "Rate limit alcanzado",
  "FOUNDER.UPSERTED": "Miembro de equipo editado",
  "FOUNDER.REMOVED": "Miembro de equipo eliminado",
  "MILESTONE.UPSERTED": "Hito editado",
  "MILESTONE.REMOVED": "Hito eliminado",
  "METRIC.REMOVED": "Métrica eliminada",
};

/**
 * Traduce el payload crudo a una frase legible. El admin no necesita ver JSON
 * ni IDs internos — necesita entender qué pasó de un vistazo.
 */
function describePayload(
  action: string,
  payload: Record<string, unknown> | null
): string | null {
  if (!payload) return null;
  const n = (k: string) =>
    typeof payload[k] === "number" ? (payload[k] as number).toLocaleString("es-MX") : null;
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);

  switch (action) {
    case "PARTICIPATION.LEAD_CREATED": {
      const shares = n("shareCountRequested");
      return shares ? `${shares} acciones de interés` : null;
    }
    case "PARTICIPATION.ASSIGNED": {
      const shares = n("shareCount");
      return shares ? `${shares} acciones asignadas` : null;
    }
    case "CERTIFICATE.ISSUED":
      return s("serial") ? `Certificado ${s("serial")}` : null;
    case "APPLICATION.APPROVED":
      return s("role") ? `Rol asignado: ${s("role")}` : null;
    case "APPLICATION.REJECTED":
      return s("rejectionNote") ? `Nota: ${s("rejectionNote")}` : null;
    case "PROJECT.CREATED": {
      if (s("event") === "PROJECT_INFO_UPDATED") return "Información actualizada";
      const shares = n("totalShares");
      return shares ? `${shares} acciones emitidas` : null;
    }
    case "USER.CREATED":
      if (s("event") === "PASSWORD_SET") return "Contraseña establecida";
      return s("role") ? `Rol: ${s("role")}` : null;
    case "METRIC.RECORDED": {
      const kind = s("kind");
      const val = n("value");
      return kind && val ? `${kind}: ${val} ${s("unit") ?? ""}`.trim() : kind;
    }
    case "FOUNDER.UPSERTED":
    case "FOUNDER.REMOVED":
      return s("fullName");
    case "MILESTONE.UPSERTED":
      return s("title");
    case "RATE_LIMIT.HIT":
      return s("reason") ? `Límite por ${s("reason")}` : null;
    case "EMAIL.FAILED":
      return s("subject") ? `Falló: ${s("subject")}` : null;
    default:
      return null;
  }
}

type SearchParams = {
  actor?: string;
  page?: string;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;

  const actor = (sp.actor ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Los emails fallidos son ruido operativo, no eventos de negocio:
  // quedan registrados pero no se listan en la bitácora.
  const where: Prisma.AuditLogWhereInput = {
    action: { not: "EMAIL.FAILED" },
  };
  if (actor) {
    where.OR = [
      { actor: { email: { contains: actor, mode: "insensitive" } } },
      { actor: { fullName: { contains: actor, mode: "insensitive" } } },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        actor: { select: { email: true, fullName: true, role: true } },
        project: { select: { slug: true, name: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Bitácora del sistema</h1>
        <p className="mt-3 font-mono text-sm text-navy/50">
          {total.toLocaleString("es-MX")} evento{total === 1 ? "" : "s"}
          {totalPages > 1 ? ` · página ${page}/${totalPages}` : ""}
        </p>
      </header>

      {/* Búsqueda por actor — instantánea, sin botón */}
      <div className="mt-2">
        <AuditSearch />
      </div>

      {logs.length === 0 ? (
        <p className="mt-6 text-navy/60">
          {actor ? "Sin eventos para ese actor." : "Todavía no hay eventos."}
        </p>
      ) : (
        <ul className="mt-6 hairline-t">
          {logs.map((l) => {
            const payload =
              l.payload && typeof l.payload === "object"
                ? (l.payload as Record<string, unknown>)
                : null;
            const detail = describePayload(l.action, payload);
            const who = l.actor
              ? `${l.actor.fullName ?? l.actor.email} · ${l.actor.role}`
              : "Sistema";
            return (
              <li key={l.id} className="hairline-b py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-sans text-navy">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </p>
                  <p className="eyebrow font-mono shrink-0 !text-navy/40">
                    {formatDate(l.createdAt)} ·{" "}
                    {l.createdAt.toISOString().slice(11, 16)}
                  </p>
                </div>
                <p className="mt-1 eyebrow">
                  {who}
                  {l.project ? (
                    <>
                      {" · "}
                      <Link
                        href={`/proyectos/${l.project.slug}` as Route}
                        className="hover:!text-gold"
                      >
                        {l.project.name}
                      </Link>
                    </>
                  ) : null}
                </p>
                {detail && (
                  <p className="mt-1.5 text-sm text-navy/70">{detail}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between hairline-t pt-6">
          <PageLink page={page - 1} disabled={page <= 1} actor={actor} label="← Anterior" />
          <p className="eyebrow font-mono">
            {page} / {totalPages}
          </p>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            actor={actor}
            label="Siguiente →"
          />
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  actor,
  label,
}: {
  page: number;
  disabled: boolean;
  actor: string;
  label: string;
}) {
  if (disabled) {
    return <span className="eyebrow !text-navy/30">{label}</span>;
  }
  const params = new URLSearchParams();
  if (actor) params.set("actor", actor);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/auditoria?${params.toString()}` as Route}
      className="eyebrow hover:!text-gold"
    >
      {label}
    </Link>
  );
}

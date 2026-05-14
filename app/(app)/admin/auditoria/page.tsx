import Link from "next/link";
import type { Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/utils/format";
import { AuditFilters } from "./AuditFilters";

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
  "RATE_LIMIT.HIT": "Rate limit",
  "FOUNDER.UPSERTED": "Miembro de equipo editado",
  "FOUNDER.REMOVED": "Miembro de equipo eliminado",
  "MILESTONE.UPSERTED": "Hito editado",
  "MILESTONE.REMOVED": "Hito eliminado",
  "METRIC.REMOVED": "Métrica eliminada",
};

const ACTION_GROUP: Record<string, string> = {
  APPLICATION: "Aplicaciones",
  USER: "Usuarios",
  PROJECT: "Proyectos",
  PARTICIPATION: "Participaciones",
  CERTIFICATE: "Certificados",
  REPORT: "Reportes",
  METRIC: "Métricas",
  MILESTONE: "Hitos",
  DISTRIBUTION: "Dividendos",
  EMAIL: "Sistema",
  RATE_LIMIT: "Sistema",
  FOUNDER: "Equipo",
};

function actionGroup(action: string): string {
  const prefix = action.split(".")[0] ?? "";
  return ACTION_GROUP[prefix] ?? "Otros";
}

type SearchParams = {
  group?: string;
  action?: string;
  actor?: string;
  q?: string;
  page?: string;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;

  const group = (sp.group ?? "").trim();
  const action = (sp.action ?? "").trim();
  const actor = (sp.actor ?? "").trim();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {};

  if (action) {
    where.action = action;
  } else if (group) {
    // Match acciones cuyo prefijo (antes del primer ".") sea `group`.
    where.action = { startsWith: `${group}.` };
  }

  if (actor) {
    where.OR = [
      { actor: { email: { contains: actor, mode: "insensitive" } } },
      { actor: { fullName: { contains: actor, mode: "insensitive" } } },
    ];
  }

  if (q) {
    const orList: Prisma.AuditLogWhereInput[] = [
      { entityId: { contains: q, mode: "insensitive" } },
      { ipAddress: { contains: q, mode: "insensitive" } },
      { project: { name: { contains: q, mode: "insensitive" } } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: orList }];
      delete where.OR;
    } else {
      where.OR = orList;
    }
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

  // Lista distinta de prefijos (APPLICATION, USER, PROJECT, …) que mapeamos a labels.
  const groupOptions = Object.entries(ACTION_GROUP)
    .map(([prefix, label]) => ({ prefix, label }))
    // un mismo label puede tener varios prefijos (EMAIL/RATE_LIMIT → "Sistema"), los unimos
    .reduce<Array<{ prefix: string; label: string }>>((acc, cur) => {
      if (!acc.some((g) => g.prefix === cur.prefix)) acc.push(cur);
      return acc;
    }, [])
    .sort((a, b) => a.label.localeCompare(b.label));
  const actionOptions = Object.keys(ACTION_LABEL)
    .filter((a) => !group || actionGroup(a) === ACTION_GROUP[group])
    .sort();

  return (
    <div>
      <header className="hairline-b pb-8">
        <p className="eyebrow">Admin · Auditoría</p>
        <h1 className="font-sans mt-4 text-h1 text-navy">Bitácora del sistema</h1>
        <p className="mt-3 max-w-2xl text-navy/75 leading-relaxed">
          Historial inmutable de eventos sensibles. Cada acción que altera estado (aprobaciones,
          asignaciones, edición de contenido, pagos) deja un rastro acá.
        </p>
        <p className="mt-3 font-mono text-sm text-navy/60">
          {total.toLocaleString("es-MX")} evento{total === 1 ? "" : "s"} · página {page} de{" "}
          {totalPages}
        </p>
      </header>

      <div className="mt-8">
        <AuditFilters
          groupOptions={groupOptions}
          actionOptions={actionOptions}
          actionLabels={ACTION_LABEL}
          actionGroupLabels={ACTION_GROUP}
        />
      </div>

      {logs.length === 0 ? (
        <p className="mt-12 text-navy/60">No hay eventos que coincidan con los filtros.</p>
      ) : (
        <ul className="mt-8 hairline-t">
          {logs.map((l) => {
            const payload =
              l.payload && typeof l.payload === "object"
                ? (l.payload as Record<string, unknown>)
                : null;
            return (
              <li key={l.id} className="hairline-b py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-sans text-navy">
                      {ACTION_LABEL[l.action] ?? l.action}
                    </p>
                    <p className="mt-1 eyebrow">
                      {l.actor
                        ? `${l.actor.fullName ?? l.actor.email} · ${l.actor.role}`
                        : "Sistema"}
                      {" · "}
                      <span className="font-mono">{l.action}</span>
                    </p>
                  </div>
                  <p className="eyebrow font-mono shrink-0">
                    {formatDate(l.createdAt)} · {l.createdAt.toISOString().slice(11, 19)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="eyebrow">Entidad</p>
                    <p className="mt-1 font-mono text-navy break-all">
                      {l.entityType}
                      <br />
                      <span className="text-navy/60">{l.entityId}</span>
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">Proyecto</p>
                    <p className="mt-1 text-navy">
                      {l.project ? (
                        <Link
                          href={`/proyectos/${l.project.slug}` as Route}
                          className="hover:!text-gold"
                        >
                          {l.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">IP</p>
                    <p className="mt-1 font-mono text-navy">{l.ipAddress ?? "—"}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Payload</p>
                    <p className="mt-1 font-mono text-xs text-navy/75 break-all">
                      {payload ? JSON.stringify(payload) : "—"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between hairline-t pt-6">
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            sp={sp}
            label="← Anterior"
          />
          <p className="eyebrow font-mono">
            {page} / {totalPages}
          </p>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            sp={sp}
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
  sp,
  label,
}: {
  page: number;
  disabled: boolean;
  sp: SearchParams;
  label: string;
}) {
  if (disabled) {
    return <span className="eyebrow !text-navy/30">{label}</span>;
  }
  const params = new URLSearchParams();
  if (sp.group) params.set("group", sp.group);
  if (sp.action) params.set("action", sp.action);
  if (sp.actor) params.set("actor", sp.actor);
  if (sp.q) params.set("q", sp.q);
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

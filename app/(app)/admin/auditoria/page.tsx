import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict, getLocale, type Dict } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { AuditSearch } from "./AuditSearch";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.adminAuditoria };
}

const PAGE_SIZE = 50;

type PayloadDict = Dict["adminAuditoria"]["payload"];

/**
 * Traduce el payload crudo a una frase legible. El admin no necesita ver JSON
 * ni IDs internos — necesita entender qué pasó de un vistazo.
 */
function describePayload(
  action: string,
  payload: Record<string, unknown> | null,
  p: PayloadDict,
  locale: string
): string | null {
  if (!payload) return null;
  const n = (k: string) =>
    typeof payload[k] === "number" ? (payload[k] as number).toLocaleString(locale) : null;
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);
  const sourceLabel = (src: string | null): string | null => {
    if (src === "INVITE") return p.sourceInvite;
    if (src === "LEAD") return p.sourceLead;
    return null;
  };

  switch (action) {
    case "PARTICIPATION.LEAD_CREATED": {
      const shares = n("shareCountRequested");
      return shares ? p.sharesOfInterestFmt.replace("{n}", shares) : null;
    }
    case "PARTICIPATION.ASSIGNED": {
      const shares = n("shareCount");
      return shares ? p.sharesAssignedFmt.replace("{n}", shares) : null;
    }
    case "CERTIFICATE.ISSUED":
      return s("serial") ? p.certificateFmt.replace("{serial}", s("serial")!) : null;
    case "APPLICATION.APPROVED":
      return s("role") ? p.roleAssignedFmt.replace("{role}", s("role")!) : null;
    case "APPLICATION.REJECTED":
      return s("rejectionNote")
        ? p.noteFmt.replace("{note}", s("rejectionNote")!)
        : null;
    case "PROJECT.CREATED": {
      if (s("event") === "PROJECT_INFO_UPDATED") return p.infoUpdated;
      const shares = n("totalShares");
      return shares ? p.sharesIssuedFmt.replace("{n}", shares) : null;
    }
    case "USER.CREATED":
      if (s("event") === "PASSWORD_SET") return p.passwordSet;
      return s("role") ? p.roleFmt.replace("{role}", s("role")!) : null;
    case "METRIC.RECORDED": {
      const kind = s("kind");
      const val = n("value");
      if (kind && val) {
        return p.metricFullFmt
          .replace("{kind}", kind)
          .replace("{value}", val)
          .replace("{unit}", s("unit") ?? "")
          .trim();
      }
      return kind;
    }
    case "FOUNDER.UPSERTED":
    case "FOUNDER.REMOVED":
      return s("fullName");
    case "MILESTONE.UPSERTED":
      return s("title");
    case "RATE_LIMIT.HIT":
      return s("reason") ? p.limitReasonFmt.replace("{reason}", s("reason")!) : null;
    case "EMAIL.FAILED":
      return s("subject") ? p.emailFailedFmt.replace("{subject}", s("subject")!) : null;
    case "ADMIN_BROADCAST.SENT": {
      const count = n("recipientCount");
      const subj = s("subject");
      if (count && subj) {
        return p.broadcastCountAndSubjectFmt
          .replace("{n}", count)
          .replace("{subject}", subj);
      }
      if (count) return p.broadcastCountFmt.replace("{n}", count);
      return subj ? p.broadcastSubjectFmt.replace("{subject}", subj) : null;
    }
    case "PARTICIPATION.INVITED": {
      const shares = n("shareCount");
      const email = s("inviteeEmail");
      if (shares && email) {
        return p.inviteSharesAndEmailFmt
          .replace("{n}", shares)
          .replace("{email}", email);
      }
      if (shares) return p.inviteSharesFmt.replace("{n}", shares);
      return email;
    }
    case "PARTICIPATION.ASSIGN_PROPOSED": {
      const shares = n("shareCount");
      const src = sourceLabel(s("source"));
      const email = s("inviteEmail");
      if (shares && src && email) {
        return p.assignSharesAndSourceAndEmailFmt
          .replace("{n}", shares)
          .replace("{source}", src)
          .replace("{email}", email);
      }
      if (shares && src) {
        return p.assignSharesAndSourceFmt
          .replace("{n}", shares)
          .replace("{source}", src);
      }
      if (shares) return p.inviteSharesFmt.replace("{n}", shares);
      return null;
    }
    case "PARTICIPATION.ASSIGN_APPROVED": {
      const shares = n("shareCount");
      const src = sourceLabel(s("source"));
      if (shares && src) {
        return p.assignSharesAndSourceFmt
          .replace("{n}", shares)
          .replace("{source}", src);
      }
      if (shares) return p.inviteSharesFmt.replace("{n}", shares);
      return null;
    }
    case "PARTICIPATION.ASSIGN_REJECTED": {
      const shares = n("shareCount");
      const note = s("note");
      if (shares && note) {
        return p.assignSharesAndNoteFmt
          .replace("{n}", shares)
          .replace("{note}", note);
      }
      if (shares) return p.inviteSharesFmt.replace("{n}", shares);
      return note ? p.noteFmt.replace("{note}", note) : null;
    }
    case "CHAT.POLL_CREATED": {
      const q = s("question");
      const cnt = n("optionsCount");
      if (q && cnt) {
        return p.pollWithCountFmt.replace("{question}", q).replace("{n}", cnt);
      }
      return q ? p.pollQuestionFmt.replace("{question}", q) : null;
    }
    case "CHAT.MESSAGE_POSTED": {
      const has = payload.hasAttachment === true;
      return has ? p.chatWithAttachment : null;
    }
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
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.adminAuditoria;
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

  // Secuencial: count + findMany paralelos con connection_limit=1 pelean por
  // la conexión. Total cae a 0 si falla (paginación queda en 1 página) y los
  // logs caen a [] (empty state). Mejor que crashear /admin/auditoria entera.
  type AuditLogRow = Prisma.AuditLogGetPayload<{
    include: {
      actor: { select: { email: true; fullName: true; role: true } };
      project: { select: { slug: true; name: true } };
    };
  }>;
  const [total, logs] = await sequentialPrisma([
    {
      run: () => prisma.auditLog.count({ where }),
      fallback: 0,
      tag: "adminAuditoria:total",
    },
    {
      run: () =>
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
      fallback: [] as AuditLogRow[],
      tag: "adminAuditoria:logs",
    },
  ] as const);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countLabel = (total === 1 ? t.countSingle : t.countPlural).replace(
    "{n}",
    total.toLocaleString(locale)
  );
  const pageLabel = t.pageFmt
    .replace("{page}", String(page))
    .replace("{total}", String(totalPages));

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 font-mono text-sm text-navy/50">
          {countLabel}
          {totalPages > 1 ? ` · ${pageLabel}` : ""}
        </p>
      </header>

      {/* Búsqueda por actor — instantánea, sin botón */}
      <div className="mt-2">
        <AuditSearch
          label={t.searchLabel}
          clearLabel={t.clearBtn}
        />
      </div>

      {logs.length === 0 ? (
        <p className="mt-6 text-navy/60">
          {actor ? t.emptyNoActor : t.emptyAll}
        </p>
      ) : (
        <ul className="mt-6 hairline-t">
          {logs.map((l) => {
            const payload =
              l.payload && typeof l.payload === "object"
                ? (l.payload as Record<string, unknown>)
                : null;
            const detail = describePayload(l.action, payload, t.payload, locale);
            const who = l.actor
              ? `${l.actor.fullName ?? l.actor.email} · ${l.actor.role}`
              : t.systemActor;
            return (
              <li key={l.id} className="hairline-b py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-sans text-navy break-words min-w-0">
                    {t.actions[l.action] ?? l.action}
                  </p>
                  <p className="eyebrow font-mono shrink-0 !text-navy/40">
                    {formatDate(l.createdAt, locale)} ·{" "}
                    {l.createdAt.toISOString().slice(11, 16)}
                  </p>
                </div>
                <p className="mt-1 eyebrow break-words [overflow-wrap:anywhere]">
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
                  <p className="mt-1.5 text-sm text-navy/70 break-words [overflow-wrap:anywhere]">
                    {detail}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between gap-3 hairline-t pt-6">
          <PageLink page={page - 1} disabled={page <= 1} actor={actor} label={t.pagPrev} />
          <p className="eyebrow font-mono whitespace-nowrap">
            {page} / {totalPages}
          </p>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            actor={actor}
            label={t.pagNext}
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
    return (
      <span className="eyebrow !text-navy/30 inline-flex items-center min-h-[44px] px-2">
        {label}
      </span>
    );
  }
  const params = new URLSearchParams();
  if (actor) params.set("actor", actor);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/auditoria?${params.toString()}` as Route}
      className="eyebrow hover:!text-gold inline-flex items-center min-h-[44px] px-2"
    >
      {label}
    </Link>
  );
}

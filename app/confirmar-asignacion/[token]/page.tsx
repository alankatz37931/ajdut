import type { Metadata } from "next";
import { BackLink } from "@/components/app/BackLink";
import { getDict, getLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { inspectTargetConfirmationToken } from "@/lib/services/pending-assignment";
import { ConfirmAsignacionForm } from "./ConfirmAsignacionForm";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: `${dict.adminAsignaciones.confirmAsignacionTitle} · AJDUT` };
}

export default async function ConfirmAsignacionPage({ params }: Params) {
  const { token } = await params;
  const inspection = await inspectTargetConfirmationToken(token);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.adminAsignaciones;

  if (!inspection.ok) {
    return <InvalidTokenView reason={inspection.error} t={t} />;
  }

  // El target ya confirmó — mostramos un "ya confirmaste" en vez de re-disparar
  // la acción. Defense in depth: el token ya está nullado en DB después de
  // confirmar, así que en realidad este branch no se alcanza salvo race
  // condition; lo dejamos por completitud.
  if (inspection.alreadyAcceptedAt) {
    return (
      <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
        <BackLink fallback="/">{t.confirmAsignacionBack}</BackLink>
        <h1 className="font-sans mt-6 text-h1 text-navy">
          {t.confirmAsignacionAlreadyTitle}
        </h1>
        <p className="mt-4 text-navy/75 leading-relaxed">
          {t.confirmAsignacionAlreadyBody.replace(
            "{date}",
            formatDate(inspection.alreadyAcceptedAt, locale)
          )}
        </p>
      </div>
    );
  }

  const proposerName = inspection.proposerName;

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.confirmAsignacionBack}</BackLink>

      <p className="mt-6 eyebrow !text-gold">{t.confirmAsignacionEyebrow}</p>
      <h1 className="font-sans mt-3 text-h1 text-navy">
        {t.confirmAsignacionTitle}
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        {t.confirmAsignacionBody
          .replace("{proposer}", proposerName)
          .replace("{shares}", inspection.shareCount.toLocaleString(locale))
          .replace("{project}", inspection.projectName)}
      </p>

      <dl className="mt-8 hairline divide-y divide-paper-line">
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">
            {t.confirmAsignacionProjectLabel}
          </dt>
          <dd className="font-mono text-sm text-navy text-right">
            {inspection.projectName}
          </dd>
        </div>
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">
            {t.confirmAsignacionProposerLabel}
          </dt>
          <dd className="font-mono text-sm text-navy text-right break-words">
            {proposerName}
          </dd>
        </div>
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">
            {t.confirmAsignacionShareLabel}
          </dt>
          <dd className="font-mono text-sm text-navy text-right">
            {inspection.shareCount.toLocaleString(locale)}
          </dd>
        </div>
      </dl>

      {inspection.message && inspection.message.trim().length > 0 && (
        <div className="mt-6">
          <p className="eyebrow !text-navy/50">
            {t.confirmAsignacionMessageLabel}
          </p>
          <p className="mt-2 text-navy/85 text-sm leading-relaxed whitespace-pre-line">
            “{inspection.message}”
          </p>
        </div>
      )}

      <p className="mt-6 eyebrow !text-navy/40">
        {t.confirmAsignacionExpiresFmt.replace(
          "{date}",
          formatDate(inspection.expiresAt, locale)
        )}
      </p>

      <div className="mt-8">
        <ConfirmAsignacionForm
          token={token}
          dict={{
            confirmBtn: t.confirmAsignacionConfirmBtn,
            confirmingBtn: t.confirmAsignacionConfirmingBtn,
            doneTitle: t.confirmAsignacionDoneTitle,
            doneBody: t.confirmAsignacionDoneBody,
          }}
        />
      </div>
    </div>
  );
}

function InvalidTokenView({
  reason,
  t,
}: {
  reason: "TOKEN_NOT_FOUND" | "TOKEN_EXPIRED" | "TOKEN_RESOLVED";
  t: Awaited<ReturnType<typeof getDict>>["adminAsignaciones"];
}) {
  const COPY: Record<typeof reason, { title: string; body: string }> = {
    TOKEN_NOT_FOUND: {
      title: t.confirmAsignacionInvalidTitle,
      body: t.confirmAsignacionInvalidBody,
    },
    TOKEN_EXPIRED: {
      title: t.confirmAsignacionExpiredTitle,
      body: t.confirmAsignacionExpiredBody,
    },
    TOKEN_RESOLVED: {
      title: t.confirmAsignacionResolvedTitle,
      body: t.confirmAsignacionResolvedBody,
    },
  };
  const c = COPY[reason];
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.confirmAsignacionBack}</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{c.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{c.body}</p>
    </div>
  );
}

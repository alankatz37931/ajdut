import type { Metadata } from "next";
import { BackLink } from "@/components/app/BackLink";
import { getDict, getLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { inspectBuyerConfirmationToken } from "@/lib/services/participation";
import { ConfirmReventaForm } from "./ConfirmReventaForm";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: `${dict.confirmarReventa.title} · AJDUT` };
}

export default async function ConfirmReventaPage({ params }: Params) {
  const { token } = await params;
  const inspection = await inspectBuyerConfirmationToken(token);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.confirmarReventa;

  if (!inspection.ok) {
    return <InvalidTokenView reason={inspection.error} t={t} />;
  }

  // El comprador ya confirmó — mostramos "ya confirmaste" en vez de re-disparar.
  if (inspection.alreadyAcceptedAt) {
    return (
      <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
        <BackLink fallback="/">{t.back}</BackLink>
        <h1 className="font-sans mt-6 text-h1 text-navy">{t.alreadyTitle}</h1>
        <p className="mt-4 text-navy/75 leading-relaxed">
          {t.alreadyBody.replace(
            "{date}",
            formatDate(inspection.alreadyAcceptedAt, locale)
          )}
        </p>
      </div>
    );
  }

  const priceNum =
    inspection.pricePerShare !== null ? Number(inspection.pricePerShare) : null;
  const totalNum = priceNum !== null ? priceNum * inspection.shareCount : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.back}</BackLink>

      <p className="mt-6 eyebrow !text-gold">{t.eyebrow}</p>
      <h1 className="font-sans mt-3 text-h1 text-navy">{t.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        {t.body
          .replace("{seller}", inspection.sellerName)
          .replace("{shares}", inspection.shareCount.toLocaleString(locale))
          .replace("{project}", inspection.projectName)}
      </p>

      <dl className="mt-8 hairline divide-y divide-paper-line">
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">{t.projectLabel}</dt>
          <dd className="font-mono text-sm text-navy text-right">
            {inspection.projectName}
          </dd>
        </div>
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">{t.sellerLabel}</dt>
          <dd className="font-mono text-sm text-navy text-right break-words">
            {inspection.sellerName}
          </dd>
        </div>
        <div className="py-3 flex justify-between gap-4">
          <dt className="eyebrow !text-navy/50">{t.shareLabel}</dt>
          <dd className="font-mono text-sm text-navy text-right">
            {inspection.shareCount.toLocaleString(locale)}
          </dd>
        </div>
        {priceNum !== null && (
          <div className="py-3 flex justify-between gap-4">
            <dt className="eyebrow !text-navy/50">{t.priceLabel}</dt>
            <dd className="font-mono text-sm text-navy text-right">
              {formatCurrency(priceNum, "USD", 2, locale)}
            </dd>
          </div>
        )}
        {totalNum !== null && (
          <div className="py-3 flex justify-between gap-4">
            <dt className="eyebrow !text-navy/50">{t.totalLabel}</dt>
            <dd className="font-mono text-sm text-navy text-right">
              {formatCurrency(totalNum, "USD", 2, locale)}
            </dd>
          </div>
        )}
      </dl>

      {inspection.intentNote && inspection.intentNote.trim().length > 0 && (
        <div className="mt-6">
          <p className="eyebrow !text-navy/50">{t.noteLabel}</p>
          <p className="mt-2 text-navy/85 text-sm leading-relaxed whitespace-pre-line">
            “{inspection.intentNote}”
          </p>
        </div>
      )}

      <p className="mt-6 eyebrow !text-navy/40">
        {t.expiresFmt.replace("{date}", formatDate(inspection.expiresAt, locale))}
      </p>

      <div className="mt-8">
        <ConfirmReventaForm
          token={token}
          dict={{
            confirmBtn: t.confirmBtn,
            confirmingBtn: t.confirmingBtn,
            doneTitle: t.doneTitle,
            doneBody: t.doneBody,
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
  t: Awaited<ReturnType<typeof getDict>>["confirmarReventa"];
}) {
  const COPY: Record<typeof reason, { title: string; body: string }> = {
    TOKEN_NOT_FOUND: { title: t.invalidTitle, body: t.invalidBody },
    TOKEN_EXPIRED: { title: t.expiredTitle, body: t.expiredBody },
    TOKEN_RESOLVED: { title: t.resolvedTitle, body: t.resolvedBody },
  };
  const c = COPY[reason];
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.back}</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{c.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{c.body}</p>
    </div>
  );
}

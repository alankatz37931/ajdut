import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { Section } from "@/components/ui/Section";
import { BackLink } from "@/components/app/BackLink";
import { formatDateTime } from "@/lib/utils/format";
import { ApplicationReviewActions } from "./ReviewActions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.adminApplicationDetail };
}

export default async function ApplicationDetailPage({ params }: Params) {
  await requireRole(["ADMIN"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.adminApplications;
  const d = t.detail;
  const { id } = await params;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { reviewedBy: { select: { fullName: true, email: true } } },
  });
  if (!app) notFound();

  const daysOld = Math.floor((Date.now() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const canAct = app.status === "PENDING" || app.status === "UNDER_REVIEW";
  const isCompany = app.kind === "COMPANY";
  const statusLabel = t.status[app.status] ?? app.status;

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <BackLink fallback="/admin/applications">{t.title}</BackLink>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-3 flex-wrap">
          {/* Badge del tipo de aplicante: Empresa (proyect owner) vs Persona. */}
          <span
            className={`eyebrow hairline px-2.5 py-1 shrink-0 ${
              isCompany ? "!text-gold" : "!text-navy/60"
            }`}
          >
            {isCompany ? t.kindCompany : t.kindPerson}
          </span>
          <h1 className="font-sans text-h1 text-navy break-words [overflow-wrap:anywhere] min-w-0">
            {app.fullName}
          </h1>
        </div>
        <p className="mt-2 eyebrow">
          {statusLabel} · {d.sentAgoFmt.replace("{n}", String(daysOld))}
        </p>
      </header>

      <Section title={d.sectionData}>
        <dl className="grid grid-cols-12 gap-4">
          <Row label={d.fieldEmail} value={app.email} />
          <Row label={d.fieldPhone} value={app.phone} />
          <Row label={d.fieldCountry} value={app.country} />
          {app.referredBy && <Row label={d.fieldReferredBy} value={app.referredBy} />}
          <Row label={d.fieldReceived} value={formatDateTime(app.createdAt, locale)} />
          {app.reviewedAt && (
            <Row
              label={d.fieldReviewed}
              value={d.reviewedByFmt
                .replace("{date}", formatDateTime(app.reviewedAt, locale))
                .replace("{name}", app.reviewedBy?.fullName ?? d.reviewedByUnknown)}
            />
          )}
        </dl>
      </Section>

      {isCompany && (app.companyName || app.companyKind || app.companyDescription) && (
        <Section title={d.sectionCompany}>
          <dl className="grid grid-cols-12 gap-4">
            {app.companyName && <Row label={d.companyName} value={app.companyName} />}
            {app.companyKind && (
              <Row
                label={d.companyKind}
                value={d.kinds[app.companyKind] ?? app.companyKind}
              />
            )}
            {app.companyDescription && (
              <Row label={d.companyDescription} value={app.companyDescription} />
            )}
          </dl>
        </Section>
      )}

      <Section title={d.sectionMotivation}>
        <p className="whitespace-pre-line text-navy/85 leading-relaxed">{app.motivation}</p>
      </Section>

      {app.rejectionNote && (
        <Section title={d.sectionRejection}>
          <p className="text-navy/85 leading-relaxed">{app.rejectionNote}</p>
        </Section>
      )}

      {canAct && (
        <Section title={d.sectionActions}>
          {/* Pre-seleccionamos PROJECT_OWNER si la aplicación es de Empresa,
              PARTNER si es Persona. El admin puede cambiar el rol antes de
              confirmar. */}
          <ApplicationReviewActions
            applicationId={app.id}
            defaultRole={isCompany ? "PROJECT_OWNER" : "PARTNER"}
            dict={t.review}
          />
        </Section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="col-span-12 sm:col-span-3 eyebrow sm:self-center">{label}</dt>
      <dd className="col-span-12 sm:col-span-9 text-navy break-words [overflow-wrap:anywhere]">
        {value}
      </dd>
    </>
  );
}

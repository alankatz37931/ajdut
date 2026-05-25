import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { BrandMark } from "@/components/landing/BrandMark";
import { BackLink } from "@/components/app/BackLink";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { PrintButton } from "./PrintButton";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.certificate.metaTitle };
}

type Params = { params: Promise<{ id: string }> };

export default async function CertificatePage({ params }: Params) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.certificate;
  const { id } = await params;

  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: {
      participation: {
        include: {
          project: { select: { name: true, totalShares: true } },
        },
      },
    },
  });
  if (!cert) notFound();
  // Solo el titular del certificado o un admin pueden verlo.
  if (cert.issuedToUserId !== user.id && user.role !== "ADMIN") notFound();

  const holder = await prisma.user.findUnique({
    where: { id: cert.issuedToUserId },
    select: { fullName: true, email: true },
  });

  const shares = cert.participation.shareCount;
  const totalShares = cert.participation.project.totalShares;
  const acquired = cert.participation.acquiredAt ?? cert.issuedAt;
  const revoked = cert.revokedAt != null;
  const holderName = holder?.fullName ?? holder?.email ?? t.holderFallback;
  const projectName = cert.participation.project.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Barra de acciones — no se imprime */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <BackLink fallback="/partner">{t.back}</BackLink>
        <PrintButton label={t.printBtn} />
      </div>

      <article className="mt-6 hairline bg-paper-light p-8 sm:p-12">
        <header className="flex items-start justify-between gap-6 hairline-b pb-6">
          <BrandMark tagline={dict.brand.tagline} ariaLabel={dict.brand.ariaLabel} />
          <p className="eyebrow !text-navy/40 text-right">
            {t.headerLine1}
            <br />
            {t.headerLine2}
          </p>
        </header>

        {revoked && (
          <p className="mt-6 hairline p-3 eyebrow !text-navy">
            {t.revoked}
            {cert.revokedAt ? ` · ${formatDate(cert.revokedAt, locale)}` : ""}
            {cert.revocationNote ? ` · ${cert.revocationNote}` : ""}
          </p>
        )}

        <p className="mt-8 text-navy/85 leading-relaxed">
          {t.statement.split(/(\{holder\}|\{project\})/).map((part, i) => {
            if (part === "{holder}") {
              return (
                <span key={i} className="text-navy font-medium">
                  {holderName}
                </span>
              );
            }
            if (part === "{project}") {
              return (
                <span key={i} className="text-navy font-medium">
                  {projectName}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </p>

        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
          <Cell label={t.fields.member} value={holderName} />
          <Cell label={t.fields.project} value={projectName} />
          <Cell label={t.fields.shares} value={formatNumber(shares)} mono />
          <Cell label={t.fields.totalIssued} value={formatNumber(totalShares)} mono />
          <Cell label={t.fields.assigned} value={formatDate(acquired, locale)} mono />
          <Cell
            label={t.fields.validity}
            value={cert.validUntil ? formatDate(cert.validUntil, locale) : t.fields.noExpiry}
            mono
          />
          <Cell label={t.fields.serial} value={cert.serialCode} mono wide />
        </dl>

        <p className="mt-8 eyebrow !text-navy/40">{t.validationEyebrow}</p>
        <p className="mt-2 text-sm text-navy/75 leading-relaxed">
          {t.validationBody}
        </p>

        <p className="mt-8 hairline-t pt-6 text-xs leading-relaxed text-navy/40">
          {t.disclaimer}
        </p>
      </article>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`bg-paper-light p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="eyebrow !text-navy/40">{label}</p>
      <p
        className={`mt-1 text-navy ${
          mono ? "font-mono text-sm break-all" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { BrandMark } from "@/components/landing/BrandMark";
import { BackLink } from "@/components/app/BackLink";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Certificado de participación · AJDUT" };

type Params = { params: Promise<{ id: string }> };

export default async function CertificatePage({ params }: Params) {
  const user = await requireSession();
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Barra de acciones — no se imprime */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <BackLink fallback="/partner">← Volver</BackLink>
        <PrintButton />
      </div>

      <article className="mt-6 hairline bg-paper-light p-8 sm:p-12">
        <header className="flex items-start justify-between gap-6 hairline-b pb-6">
          <BrandMark />
          <p className="eyebrow !text-navy/40 text-right">
            Certificado de
            <br />
            participación
          </p>
        </header>

        {revoked && (
          <p className="mt-6 hairline p-3 eyebrow !text-navy">
            ✕ Certificado revocado{" "}
            {cert.revokedAt ? `· ${formatDate(cert.revokedAt)}` : ""}
            {cert.revocationNote ? ` · ${cert.revocationNote}` : ""}
          </p>
        )}

        <p className="mt-8 text-navy/85 leading-relaxed">
          AJDUT certifica que{" "}
          <span className="text-navy font-medium">
            {holder?.fullName ?? holder?.email ?? "—"}
          </span>{" "}
          es miembro de la comunidad del proyecto{" "}
          <span className="text-navy font-medium">
            {cert.participation.project.name}
          </span>{" "}
          con la participación detallada a continuación.
        </p>

        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
          <Cell label="Miembro" value={holder?.fullName ?? holder?.email ?? "—"} />
          <Cell label="Proyecto" value={cert.participation.project.name} />
          <Cell label="Acciones" value={formatNumber(shares)} mono />
          <Cell label="Total emitido" value={formatNumber(totalShares)} mono />
          <Cell label="Asignada" value={formatDate(acquired)} mono />
          <Cell
            label="Validez"
            value={cert.validUntil ? formatDate(cert.validUntil) : "Sin vencimiento"}
            mono
          />
          <Cell label="Serial" value={cert.serialCode} mono wide />
        </dl>

        <p className="mt-8 eyebrow !text-navy/40">
          Validación de plataforma
        </p>
        <p className="mt-2 text-sm text-navy/75 leading-relaxed">
          AJDUT valida y registra esta participación accionaria y el titular
          actual. Todo cambio de propietario requiere autorización del control
          de administración de AJDUT.
        </p>

        <p className="mt-8 hairline-t pt-6 text-xs leading-relaxed text-navy/40">
          Este certificado es un documento de membresía comunitaria, no un
          contrato. AJDUT no procesa pagos, no custodia fondos y no ofrece
          asesoría legal ni financiera. El acuerdo y la firma corresponden al
          miembro y al responsable del proyecto, por fuera de la plataforma.
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

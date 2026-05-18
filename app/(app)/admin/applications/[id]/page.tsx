import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { formatDateTime } from "@/lib/utils/format";
import { ApplicationReviewActions } from "./ReviewActions";

type Params = { params: Promise<{ id: string }> };

export default async function ApplicationDetailPage({ params }: Params) {
  await requireRole(["ADMIN"]);
  const { id } = await params;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { reviewedBy: { select: { fullName: true, email: true } } },
  });
  if (!app) notFound();

  const daysOld = Math.floor((Date.now() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const canAct = app.status === "PENDING" || app.status === "UNDER_REVIEW";

  return (
    <div>
      <Link href="/admin/applications" className="eyebrow hover:!text-gold">
        ← Aplicaciones
      </Link>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{app.fullName}</h1>
        <p className="mt-2 eyebrow">
          {app.status} · enviada hace {daysOld}d
        </p>
      </header>

      <Section title="Datos">
        <dl className="grid grid-cols-12 gap-4">
          <Row label="Email" value={app.email} />
          <Row label="Teléfono" value={app.phone} />
          <Row label="País" value={app.country} />
          {app.referredBy && <Row label="Referido por" value={app.referredBy} />}
          <Row label="Recibida" value={formatDateTime(app.createdAt)} />
          {app.reviewedAt && (
            <Row label="Revisada" value={`${formatDateTime(app.reviewedAt)} por ${app.reviewedBy?.fullName ?? "—"}`} />
          )}
        </dl>
      </Section>

      <Section title="Motivación">
        <p className="whitespace-pre-line text-navy/85 leading-relaxed">{app.motivation}</p>
      </Section>

      {app.rejectionNote && (
        <Section title="Nota de rechazo">
          <p className="text-navy/85 leading-relaxed">{app.rejectionNote}</p>
        </Section>
      )}

      {canAct && (
        <Section title="Acciones">
          <ApplicationReviewActions applicationId={app.id} />
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

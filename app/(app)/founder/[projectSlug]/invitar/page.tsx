import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { InvitarForm } from "./InvitarForm";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Invitar miembro · AJDUT",
};

export default async function InvitarMiembroPage({ params }: Params) {
  const user = await requireSession();
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
  });
  if (!project) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    notFound();
  }

  // Disponibles para asignar = suma del/los pool(s) AVAILABLE del proyecto.
  // En la práctica hay 1 sólo pool, pero sumamos por robustez.
  const pools = await prisma.participation.findMany({
    where: { projectId: project.id, status: "AVAILABLE" },
    select: { shareCount: true },
  });
  const availableShares = pools.reduce((s, p) => s + p.shareCount, 0);

  return (
    <div className="max-w-3xl">
      <BackLink fallback={`/founder/${projectSlug}`}>
        ← {project.name}
      </BackLink>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Invitar miembro</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Agregá un socio directamente a tu proyecto. Si todavía no tiene cuenta en AJDUT,
          la creamos y le mandamos un link para que establezca su contraseña. Las acciones
          se asignan desde el pool disponible al confirmar.
        </p>
      </header>

      <InvitarForm projectSlug={project.slug} availableShares={availableShares} />
    </div>
  );
}

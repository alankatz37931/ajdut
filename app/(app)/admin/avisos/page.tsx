import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { AdminAvisoForm } from "./AdminAvisoForm";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.adminAvisos };
}

export default async function AdminAvisosPage() {
  await requireRole(["ADMIN"]);

  // Proyectos que tengan al menos un miembro asignado (los únicos para los
  // que tiene sentido filtrar destinatarios). Si no, sería un select ruidoso.
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <div className="max-w-3xl">
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Avisos a usuarios</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Enviá un email a usuarios filtrados por rol, actividad o pertenencia a un proyecto.
          Calculá primero cuántas personas reciben el aviso y después confirmá el envío.
        </p>
      </header>

      <AdminAvisoForm projects={projects} />
    </div>
  );
}

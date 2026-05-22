/**
 * Migración única — los 7 campos de "documentos" del StartupProfile
 * (pitch deck, data room, proyecciones, plan de negocios, estrategias,
 * estados financieros, estrategia de emisión) pasan a filas del modelo
 * Document. Idempotente: salta lo que ya existe, se puede correr de nuevo.
 *
 * Correr:  pnpm exec tsx prisma/migrate-documents.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.startupProfile.findMany({
    select: {
      pitchDeckStorageKey: true,
      dataRoomStorageKey: true,
      projectionsUrl: true,
      planNegociosUrl: true,
      estrategiasPeriodicasUrl: true,
      estadosFinancierosUrl: true,
      estrategiaEmisionUrl: true,
      project: { select: { id: true, name: true, ownerId: true } },
    },
  });

  let created = 0;
  for (const sp of profiles) {
    const docs: { url: string | null; title: string }[] = [
      { url: sp.pitchDeckStorageKey, title: "Pitch deck" },
      { url: sp.dataRoomStorageKey, title: "Data room" },
      { url: sp.projectionsUrl, title: "Proyecciones financieras" },
      { url: sp.planNegociosUrl, title: "Plan de negocios" },
      {
        url: sp.estrategiasPeriodicasUrl,
        title: "Objetivos y estrategias periódicas",
      },
      { url: sp.estadosFinancierosUrl, title: "Estados financieros" },
      {
        url: sp.estrategiaEmisionUrl,
        title: "Estrategia de emisión de participaciones",
      },
    ];
    for (const d of docs) {
      const url = d.url?.trim();
      if (!url) continue;
      const existing = await prisma.document.findFirst({
        where: { projectId: sp.project.id, storageKey: url },
      });
      if (existing) continue;
      await prisma.document.create({
        data: {
          projectId: sp.project.id,
          title: d.title,
          storageKey: url,
          uploadedById: sp.project.ownerId,
        },
      });
      created += 1;
      console.log(`+ ${sp.project.name} — ${d.title}`);
    }
  }

  console.log(`\nMigración completa: ${created} documento(s) creado(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Error en la migración:", e);
    await prisma.$disconnect();
    process.exit(1);
  });

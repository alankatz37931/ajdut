/**
 * One-off: garantiza que TODOS los proyectos tengan las 4 clases canónicas
 * fijas (Directivo, Administrativo, Embajador, Inversor pasivo), mapeando las
 * clases existentes por nombre. Idempotente — se puede correr varias veces.
 *
 *   npx tsx scripts/backfill-classes.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureProjectClasses } from "../lib/services/shareholder-class";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, slug: true } });
  console.log(`Proyectos: ${projects.length}`);
  for (const p of projects) {
    const classes = await ensureProjectClasses(prisma, p.id);
    console.log(`  ${p.slug}: ${classes.map((c) => c.kind).join(", ")}`);
  }
  console.log("Listo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

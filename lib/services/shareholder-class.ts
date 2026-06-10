import type { ParticipantClass, Prisma, PrismaClient } from "@prisma/client";

/**
 * Las 4 clases de participación son FIJAS para todo proyecto. No se crean ni
 * se borran; el owner solo reasigna participantes entre ellas. `kind` es el
 * identificador estable (el `id` del registro varía por proyecto). El stake de
 * AJDUT se contabiliza dentro de INVERSOR_PASIVO.
 */
export const CANONICAL_CLASSES: {
  kind: ParticipantClass;
  name: string;
  order: number;
}[] = [
  { kind: "DIRECTIVO", name: "Directivo", order: 0 },
  { kind: "ADMINISTRATIVO", name: "Administrativo", order: 1 },
  { kind: "EMBAJADOR", name: "Embajador", order: 2 },
  { kind: "INVERSOR_PASIVO", name: "Inversor pasivo", order: 3 },
];

export const INVESTOR_PASSIVE_KIND: ParticipantClass = "INVERSOR_PASIVO";

/** Mapa nombre (lowercase) → kind, para mapear data vieja sin `kind`. */
const NAME_TO_KIND: Record<string, ParticipantClass> = {
  directivo: "DIRECTIVO",
  administrativo: "ADMINISTRATIVO",
  operativo: "ADMINISTRATIVO",
  embajador: "EMBAJADOR",
  "inversor pasivo": "INVERSOR_PASIVO",
  "inversionista pasivo": "INVERSOR_PASIVO",
  "inversion pasiva": "INVERSOR_PASIVO",
  "inversor pasiva": "INVERSOR_PASIVO",
};

export function kindFromName(name: string): ParticipantClass | null {
  return NAME_TO_KIND[name.trim().toLowerCase()] ?? null;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Garantiza que el proyecto tenga exactamente las 4 clases canónicas, con su
 * `kind` y nombre. Idempotente:
 *  - Setea `kind`/`name`/`order` en clases existentes que matcheen por nombre.
 *  - Crea las que falten.
 * No borra clases extra (legacy) — quedan sin kind y el cap table las ignora.
 * Devuelve las 4 clases canónicas (ordenadas).
 */
export async function ensureProjectClasses(
  db: Db,
  projectId: string
): Promise<{ id: string; name: string; kind: ParticipantClass; order: number }[]> {
  const existing = await db.shareholderClass.findMany({
    where: { projectId },
    select: { id: true, name: true, kind: true, order: true },
  });

  // 1) Backfill kind por nombre en las que aún no lo tengan.
  for (const c of existing) {
    if (c.kind) continue;
    const guessed = kindFromName(c.name);
    if (!guessed) continue;
    // Evitá colisión con otra que ya tenga ese kind.
    if (existing.some((o) => o.id !== c.id && o.kind === guessed)) continue;
    await db.shareholderClass.update({
      where: { id: c.id },
      data: { kind: guessed },
    });
    c.kind = guessed;
  }

  const byKind = new Map(
    existing.filter((c) => c.kind).map((c) => [c.kind as ParticipantClass, c])
  );

  const result: {
    id: string;
    name: string;
    kind: ParticipantClass;
    order: number;
  }[] = [];

  // 2) Asegurá las 4 (crear faltantes, normalizar nombre/orden).
  for (const canon of CANONICAL_CLASSES) {
    const found = byKind.get(canon.kind);
    if (found) {
      if (found.name !== canon.name || found.order !== canon.order) {
        await db.shareholderClass.update({
          where: { id: found.id },
          data: { name: canon.name, order: canon.order },
        });
      }
      result.push({ id: found.id, name: canon.name, kind: canon.kind, order: canon.order });
    } else {
      const created = await db.shareholderClass.create({
        data: {
          projectId,
          name: canon.name,
          kind: canon.kind,
          order: canon.order,
        },
        select: { id: true },
      });
      result.push({ id: created.id, name: canon.name, kind: canon.kind, order: canon.order });
    }
  }

  return result.sort((a, b) => a.order - b.order);
}

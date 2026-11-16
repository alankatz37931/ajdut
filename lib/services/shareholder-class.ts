import type { ParticipantClass, Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "./errors";

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
  { kind: "CONSEJERO", name: "Consejero", order: 1 },
  { kind: "ADMINISTRATIVO", name: "Administrativo", order: 2 },
  { kind: "EMBAJADOR", name: "Embajador", order: 3 },
  { kind: "INVERSOR_PASIVO", name: "Inversor pasivo", order: 4 },
];

export const INVESTOR_PASSIVE_KIND: ParticipantClass = "INVERSOR_PASIVO";

/** Mapa nombre (lowercase) → kind, para mapear data vieja sin `kind`. */
const NAME_TO_KIND: Record<string, ParticipantClass> = {
  directivo: "DIRECTIVO",
  consejero: "CONSEJERO",
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
 * Id de la clase Inversor pasivo de un proyecto — la clase POR DEFECTO de quien
 * compra/adquiere participaciones en AJDUT (el owner la puede reasignar luego).
 * Si por algún motivo la clase no existe, la crea (ensureProjectClasses).
 */
export async function passiveClassId(db: Db, projectId: string): Promise<string> {
  const found = await db.shareholderClass.findFirst({
    where: { projectId, kind: INVESTOR_PASSIVE_KIND },
    select: { id: true },
  });
  if (found) return found.id;
  const classes = await ensureProjectClasses(db, projectId);
  return classes.find((c) => c.kind === INVESTOR_PASSIVE_KIND)!.id;
}

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

// ─── Clases custom ("Otro…") ────────────────────────────────────────
//
// El owner puede crear clases propias (ej. "CTO", "CAE") además de las 5
// canónicas. Se guardan con `kind=null` y `custom=true`. Las legacy sin kind
// quedan `custom=false` y no se muestran (compat hacia atrás).

/** Nombres reservados: los de las canónicas + sus alias (ver NAME_TO_KIND). */
const RESERVED_NAMES = new Set<string>([
  ...CANONICAL_CLASSES.map((c) => c.name.toLowerCase()),
  ...Object.keys(NAME_TO_KIND),
]);

/**
 * Clases que el owner puede ASIGNAR a un participante: las 5 canónicas
 * (garantizadas vía ensureProjectClasses) + las custom del proyecto. Ordenadas.
 */
export async function getAssignableClasses(
  db: Db,
  projectId: string
): Promise<{ id: string; name: string }[]> {
  await ensureProjectClasses(db, projectId);
  return db.shareholderClass.findMany({
    where: { projectId, OR: [{ kind: { not: null } }, { custom: true }] },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Crea una clase custom (kind=null, custom=true) para el proyecto y la devuelve.
 * Si ya existe una clase con ese nombre (case-insensitive), la reutiliza.
 * Rechaza nombres vacíos/largos o que choquen con una clase canónica.
 */
export async function createCustomClass(
  db: Db,
  projectId: string,
  rawName: string
): Promise<{ id: string; name: string }> {
  const name = rawName.trim();
  if (name.length < 2 || name.length > 40) {
    throw new ValidationError(
      "name",
      "El nombre de la clase debe tener entre 2 y 40 caracteres."
    );
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new ValidationError(
      "name",
      "Ese nombre corresponde a una clase del sistema. Elegí otro."
    );
  }

  // Reutilizar si ya existe una clase con ese nombre en el proyecto.
  const existing = await db.shareholderClass.findFirst({
    where: { projectId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  const agg = await db.shareholderClass.aggregate({
    where: { projectId },
    _max: { order: true },
  });
  const order = (agg._max.order ?? CANONICAL_CLASSES.length - 1) + 1;

  return db.shareholderClass.create({
    data: { projectId, name, kind: null, custom: true, order },
    select: { id: true, name: true },
  });
}

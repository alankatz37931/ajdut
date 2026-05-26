/**
 * Wrappers de resiliencia para queries de Prisma.
 *
 * Contexto: el entorno usa `DATABASE_URL?connection_limit=1`. Cualquier
 * `Promise.all([prisma.x, prisma.y, ...])` con varias lecturas concurrentes
 * agota el pool y dispara `PrismaClientKnownRequestError: pool timeout`.
 * Además, cualquier query suelta puede fallar por blip de red / db caída y
 * tirar abajo la página entera si no está envuelta.
 *
 * Estos helpers cubren ambos casos:
 *   - `safePrisma`     → wrapper individual: si la query falla, loguea y
 *                        devuelve el fallback en vez de lanzar.
 *   - `sequentialPrisma` → reemplazo de Promise.all que ejecuta las queries
 *                        de a una (await secuencial) y aplica safePrisma a
 *                        cada una. Pensado para connection_limit=1.
 */

type SafeQuery<T> = {
  run: () => Promise<T>;
  fallback: T;
  tag?: string;
};

/**
 * Envuelve una query de Prisma para que un fallo devuelva un fallback en vez
 * de lanzar. Loguea el error con `console.error` y el `tag` opcional para que
 * sea visible en dev y en los logs de prod.
 *
 * Uso típico — counts/aggregates no críticos de dashboards:
 *
 *   const total = await safePrisma(
 *     () => prisma.application.count({ where: { status: "PENDING" } }),
 *     0,
 *     "dashboard:pendingApps"
 *   );
 *
 * Si la query se tira a pique, el render sigue con `total === 0` en vez de
 * crashear la página.
 */
export async function safePrisma<T>(
  query: () => Promise<T>,
  fallback: T,
  tag?: string
): Promise<T> {
  try {
    return await query();
  } catch (err) {
    const prefix = tag ? `[safePrisma:${tag}]` : "[safePrisma]";
    console.error(`${prefix} query failed, returning fallback`, err);
    return fallback;
  }
}

/**
 * Variante secuencial de `Promise.all` para lecturas de Prisma.
 *
 * Cada query corre una detrás de la otra (await), envuelta en el mismo
 * comportamiento de `safePrisma`: si falla, loguea y devuelve su fallback.
 * Esto evita agotar el pool con `connection_limit=1` y además garantiza
 * que un único query roto no derribe toda la lista.
 *
 * Uso — reemplazo directo de Promise.all con tipado preservado:
 *
 *   const [items, total, pending] = await sequentialPrisma([
 *     { run: () => prisma.x.findMany(...),      fallback: [], tag: "page:items"   },
 *     { run: () => prisma.x.count(),            fallback: 0,  tag: "page:total"   },
 *     { run: () => prisma.x.count({ where }),   fallback: 0,  tag: "page:pending" },
 *   ] as const);
 *
 * El `as const` en el call-site mantiene la tupla y deja que TS infiera cada
 * tipo independientemente (no degrada a `unknown[]`).
 */
export async function sequentialPrisma<T extends readonly unknown[]>(
  queries: { [K in keyof T]: SafeQuery<T[K]> }
): Promise<T> {
  const results = [] as unknown[];
  for (const q of queries as readonly SafeQuery<unknown>[]) {
    results.push(await safePrisma(q.run, q.fallback, q.tag));
  }
  return results as unknown as T;
}

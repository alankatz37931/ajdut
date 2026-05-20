import { cn } from "@/lib/utils/cn";

/**
 * ProjectSection — shell consistente para cada bloque de la ficha.
 *
 * `tone="vitrina"` → marketing-grade: el número se pinta grande, el título
 *   también, mucho aire arriba/abajo. Usar en Resumen, Estructura, Equipo,
 *   Hitos.
 * `tone="ref"` → contenido de referencia: numeración + título igual de
 *   medidos, ritmo más compacto. Usar en Documentos, Cap table, Reportes,
 *   Métricas, Tu participación.
 *
 * Todas las secciones siguen el mismo lenguaje (hairline-t arriba, padding
 * top consistente), pero el `tone` ajusta el peso visual.
 */

type Props = {
  /** Número de orden (1-based). Pintamos en oro como acento. */
  index: number;
  /** Título de la sección. Permitimos undefined porque los lookups del dict
   *  son `Record<string, string>` y devuelven `string | undefined` bajo
   *  `noUncheckedIndexedAccess`. Si llega vacío, no pintamos el título. */
  title?: string;
  tone: "vitrina" | "ref";
  /** Si es la primera sección no pintamos hairline-t. */
  isFirst?: boolean;
  /** CTA al final del bloque (ej. "Me interesa participar →"). */
  trailingCta?: React.ReactNode;
  children: React.ReactNode;
};

export function ProjectSection({
  index,
  title,
  tone,
  isFirst,
  trailingCta,
  children,
}: Props) {
  const num = String(index).padStart(2, "0");

  return (
    <section
      className={cn(
        isFirst ? "" : "hairline-t",
        tone === "vitrina" ? "pt-12 sm:pt-16 pb-2" : "pt-8 sm:pt-10 pb-1",
        "mt-0"
      )}
    >
      {tone === "vitrina" ? (
        <div className="flex items-baseline gap-4 mb-7">
          <span className="font-mono text-base text-gold tracking-wider">{num}</span>
          {title && <h2 className="font-sans text-h2 text-navy">{title}</h2>}
        </div>
      ) : (
        <p className="font-mono text-sm tracking-wider mb-5">
          <span className="text-gold">{num}</span>
          {title && <span className="ml-2 text-navy">· {title}</span>}
        </p>
      )}

      <div>{children}</div>

      {trailingCta && <div className="mt-8">{trailingCta}</div>}
    </section>
  );
}

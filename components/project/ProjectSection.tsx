import { cn } from "@/lib/utils/cn";

/**
 * ProjectSection — shell consistente para cada bloque de la ficha.
 *
 * Un único lenguaje de encabezado para TODAS las secciones: número mono
 * en oro + título sans de peso medio. Sin variantes "vitrina/ref" — la
 * página se lee como una sola pieza, no como bloques sueltos.
 *
 * El prop `tone` se mantiene por compatibilidad con los callers pero ya
 * no altera el render.
 */

type Props = {
  /** Número de orden (1-based). Pintamos en oro como acento. */
  index: number;
  /** Título de la sección. Puede llegar undefined por los lookups del dict. */
  title?: string;
  /** Compat — ya no afecta el render. */
  tone?: "vitrina" | "ref";
  /** Si es la primera sección no pintamos hairline-t. */
  isFirst?: boolean;
  /** CTA al final del bloque. */
  trailingCta?: React.ReactNode;
  children: React.ReactNode;
};

export function ProjectSection({
  index,
  title,
  isFirst,
  trailingCta,
  children,
}: Props) {
  const num = String(index).padStart(2, "0");

  return (
    <section className={cn(isFirst ? "" : "hairline-t", "pt-7 sm:pt-8 pb-1")}>
      {/* Header único: NN gold mono + título sans medio. */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-sm text-gold tracking-wider">{num}</span>
        {title && (
          <h2 className="font-sans text-lg sm:text-xl text-navy leading-none">
            {title}
          </h2>
        )}
      </div>

      <div>{children}</div>

      {trailingCta && <div className="mt-6">{trailingCta}</div>}
    </section>
  );
}

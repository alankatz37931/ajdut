/**
 * InlineParticipateCta — empujón liviano al final de una sección "vitrina".
 *
 * No es el botón principal: es una banda hairline con un anchor en oro.
 * La idea: el lector terminó de leer una sección que vende, y el siguiente
 * paso natural está visible sin tener que volver al hero.
 *
 * Sin sombras, sin gradientes, sin fondos llamativos: un hairline-t con un
 * link tipográfico en mono.
 */

type Props = {
  label: string;
  href: string;
  /** Eyebrow al lado izquierdo. Ej.: "Próximo paso". */
  eyebrow?: string;
};

export function InlineParticipateCta({ label, href, eyebrow }: Props) {
  return (
    <a
      href={href}
      className="group hairline-t hairline-b flex items-center justify-between gap-4 py-4 px-1 transition-colors"
    >
      {eyebrow && (
        <span className="eyebrow !text-navy/40 group-hover:!text-navy/60">
          {eyebrow}
        </span>
      )}
      <span className="ml-auto eyebrow !text-navy group-hover:!text-gold">
        {label}
      </span>
    </a>
  );
}

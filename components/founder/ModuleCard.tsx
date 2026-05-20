import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils/cn";

/**
 * Tarjeta hairline limpia para la grilla de "módulos" del founder.
 * Composición:
 *   eyebrow del módulo · estado opcional
 *   métrica/cifra grande (mono)        ← lo que importa de un vistazo
 *   descripción de 1 línea (navy/75)
 *   "Abrir →" en oro al pie
 *
 * Si el módulo está vacío (`empty`), la cifra se reemplaza por un
 * call-to-action positivo en oro chico.
 */
export function ModuleCard({
  eyebrow,
  value,
  description,
  href,
  ctaLabel = "Abrir",
  empty,
  emptyCta,
  highlight,
  className,
}: {
  eyebrow: string;
  value?: React.ReactNode;
  description: React.ReactNode;
  href: Route;
  ctaLabel?: string;
  /** Si está "vacío" (sin datos cargados), mostramos un CTA positivo. */
  empty?: boolean;
  emptyCta?: string;
  /** Resalta la tarjeta (ej: tiene leads abiertos). */
  highlight?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-4 hairline bg-paper p-6 h-full transition-colors hover:bg-paper-light",
        highlight && "bg-paper-light",
        className,
      )}
    >
      <p
        className={cn(
          "eyebrow",
          highlight && "!text-gold",
        )}
      >
        {eyebrow}
      </p>

      <div className="flex-1">
        {empty ? (
          <p className="font-sans text-navy/60 leading-snug">
            {emptyCta ?? "Sin datos cargados todavía."}
          </p>
        ) : (
          value !== undefined && (
            <p className="font-mono text-kpi text-navy leading-none">{value}</p>
          )
        )}
        <p className="mt-3 text-sm text-navy/70 leading-relaxed">{description}</p>
      </div>

      <span className="eyebrow !text-gold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        {empty ? "Cargar" : ctaLabel} →
      </span>
    </Link>
  );
}

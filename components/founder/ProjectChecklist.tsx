import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils/cn";

export type ChecklistItem = {
  /** Etiqueta legible. */
  label: string;
  /** Si el ítem ya está "cumplido" (ej: hay equipo cargado, hay deck, etc.). */
  done: boolean;
  /** A dónde te lleva el "Completar →" si no está hecho. */
  href: Route;
  /** Descripción corta opcional. */
  hint?: string;
};

/**
 * Checklist de completitud del proyecto.
 * Visual minimalista — tilde oro (●) si está, círculo navy/40 (○) si falta.
 * No usa emojis ni colores semáforo: respeta el manual (oro único acento).
 */
export function ProjectChecklist({
  items,
  className,
}: {
  items: ChecklistItem[];
  className?: string;
}) {
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={cn("hairline bg-paper", className)}>
      {/* Header con progreso */}
      <div className="flex items-baseline justify-between gap-4 p-5 hairline-b">
        <p className="eyebrow">— Estado del proyecto</p>
        <p className="font-mono text-sm text-navy">
          <span className="text-gold">{done}</span>
          <span className="text-navy/40"> / {total}</span>
        </p>
      </div>

      {/* Barra de progreso hairline */}
      <div className="px-5 pt-4">
        <div className="h-px bg-line">
          <div
            className="h-px bg-gold transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Lista */}
      <ul>
        {items.map((it) => (
          <li key={it.label} className="hairline-b last:border-b-0">
            <div className="flex items-start gap-4 px-5 py-4">
              <span
                aria-hidden
                className={cn(
                  "mt-1 font-mono text-sm leading-none shrink-0",
                  it.done ? "text-gold" : "text-navy/30",
                )}
              >
                {it.done ? "●" : "○"}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-sans text-navy leading-snug",
                    it.done && "text-navy/60",
                  )}
                >
                  {it.label}
                </p>
                {it.hint && (
                  <p className="mt-1 text-xs text-navy/60 leading-relaxed">
                    {it.hint}
                  </p>
                )}
              </div>
              {!it.done && (
                <Link
                  href={it.href}
                  className="eyebrow !text-gold hover:!text-navy transition-colors shrink-0 self-center"
                >
                  Completar →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

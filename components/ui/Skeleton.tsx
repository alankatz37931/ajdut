import { cn } from "@/lib/utils/cn";

/**
 * Placeholders en estética blueprint — líneas hairline en gris cálido con
 * animación de pulso muy sutil. Reemplazan al "spinner" tradicional.
 */

type LineProps = {
  /** Ancho como % o token de Tailwind (ej. "w-1/2", "w-32") */
  width?: string;
  /** Alto en px o token (ej. "h-4", "h-8") */
  height?: string;
  className?: string;
};

export function SkeletonLine({
  width = "w-full",
  height = "h-4",
  className,
}: LineProps) {
  return (
    <div
      className={cn(
        "bg-line/80 animate-pulse",
        width,
        height,
        className
      )}
      aria-hidden
    />
  );
}

/**
 * Bloque vertical de varias líneas — para el área de contenido principal.
 */
export function SkeletonBlock({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 1 ? "w-3/5" : "w-full"}
          height="h-3"
        />
      ))}
    </div>
  );
}

/**
 * Skeleton genérico para el header de una página:
 * - una línea fina (eyebrow)
 * - un H1 grueso
 * - una descripción de 2 líneas
 */
export function SkeletonHeader() {
  return (
    <div aria-hidden className="space-y-4 hairline-b pb-8">
      <SkeletonLine width="w-24" height="h-3" />
      <SkeletonLine width="w-2/3" height="h-10" />
      <SkeletonLine width="w-1/2" height="h-3" />
    </div>
  );
}

/**
 * Card de proyecto en /proyectos.
 */
export function SkeletonProjectCard() {
  return (
    <li className="bg-paper" aria-hidden>
      <div className="block p-6 h-full space-y-4">
        <SkeletonLine width="w-32" height="h-3" />
        <SkeletonLine width="w-2/3" height="h-7" />
        <SkeletonLine width="w-full" height="h-3" />
        <SkeletonLine width="w-1/3" height="h-3" />
        <div className="hairline-t pt-4 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-24" height="h-4" />
          </div>
          <div className="space-y-2">
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-24" height="h-4" />
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Fila de lista (admin/applications, leads, etc.).
 */
export function SkeletonListRow() {
  return (
    <li className="flex gap-4 py-4" aria-hidden>
      <div className="shrink-0 w-[3px] self-stretch bg-line" />
      <div className="flex-1 space-y-2 py-1">
        <div className="flex items-baseline justify-between gap-3">
          <SkeletonLine width="w-1/3" height="h-5" />
          <SkeletonLine width="w-8" height="h-3" />
        </div>
        <SkeletonLine width="w-1/2" height="h-3" />
        <SkeletonLine width="w-full" height="h-3" />
      </div>
    </li>
  );
}

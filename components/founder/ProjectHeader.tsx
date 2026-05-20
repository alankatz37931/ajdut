import { BackLink } from "@/components/app/BackLink";
import { StatusBadge } from "./StatusBadge";

/**
 * Header reutilizable para TODAS las subpáginas del founder.
 * Patrón único:
 *   ← Volver al proyecto
 *   — Founder · {Proyecto}        [status badge]
 *   H1 contextual de la sección
 *   (sub-info opcional debajo)
 *
 * Mantiene la armonía del manual: eyebrow tracked → h1 grande →
 * descripción opcional → hairline-b implícito en el siguiente bloque.
 */
export function ProjectHeader({
  projectName,
  projectSlug,
  projectStatus,
  section,
  description,
  action,
}: {
  projectName: string;
  projectSlug: string;
  /** Status del proyecto — si se pasa, renderiza la pill al lado del eyebrow. */
  projectStatus?: string;
  /** Título contextual de la sección actual (h1). */
  section: string;
  /** Descripción debajo del h1 (opcional). */
  description?: React.ReactNode;
  /** Acción primaria al lado del h1 (botón / link). */
  action?: React.ReactNode;
}) {
  return (
    <header className="pb-8 sm:pb-10 hairline-b">
      <BackLink fallback={`/founder/${projectSlug}`}>← {projectName}</BackLink>

      <div className="mt-5 sm:mt-7 flex flex-wrap items-center gap-3">
        <p className="eyebrow">— Founder · {projectName}</p>
        {projectStatus && <StatusBadge status={projectStatus} />}
      </div>

      <div className="mt-3 sm:mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-sans text-h1 text-navy">{section}</h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {description && (
        <p className="mt-3 text-navy/75 leading-relaxed max-w-3xl">
          {description}
        </p>
      )}
    </header>
  );
}

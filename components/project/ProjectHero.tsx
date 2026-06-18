import Link from "next/link";
import type { Route } from "next";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

/**
 * ProjectHero — primera impresión de la ficha pública del proyecto.
 *
 * Pieza marketing-grade: eyebrow (sector · etapa · ubicación), h1 grande,
 * one-liner como manifesto, founder con inicial, sitio web y los CTAs
 * primarios del proyecto.
 *
 * El bloque respira con padding generoso y reserva el centro a UN solo
 * mensaje. El resto de los CTAs secundarios (editar, chat) va al margen.
 */

type StageInfoMap = Record<string, string | undefined>;

type Action = {
  kind: "primary" | "outline" | "ghost" | "muted";
  label: string;
  href?: string;
  /** Para el caso "esperando aprobación" — un texto sin acción. */
  asText?: boolean;
};

type Props = {
  eyebrow: {
    kind?: string;
    sector?: string | null;
    stage?: { key: string; label: string } | null;
    stageInfo?: StageInfoMap;
    /** Etiqueta accesible para el ícono "info" de la etapa (i18n). */
    stageInfoAriaLabel?: string;
    location?: string | null;
  };
  name: string;
  oneLiner?: string | null;
  founderName: string;
  founderRoleLabel: string;
  websiteUrl?: string | null;
  /** CTAs centrales debajo del bloque founder. Pintamos solo los que vengan. */
  actions: Action[];
  /** Acciones "satélite" en la esquina superior derecha (editar, abrir chat). */
  satellite?: Action[];
  /**
   * Eyebrow opcional al tope: "Ficha del proyecto" o similar.
   * Acepta string (se envuelve en <p className="eyebrow">) o ReactNode
   * (ej. <BackLink>) para que el eyebrow doble como botón de retorno.
   */
  contextEyebrow?: React.ReactNode;
  /** Nodo opcional alineado a la derecha del eyebrow de contexto (ej. el chip
   *  de estado/moderación del admin). */
  contextAside?: React.ReactNode;
  /**
   * Video del proyecto. Cuando viene, el hero se parte en 2 columnas:
   * texto a la izquierda, video a la derecha — el video deja de flotar
   * suelto y pasa a ser parte del encabezado.
   */
  video?: React.ReactNode;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "·";
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 1).toUpperCase();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

function ActionLink({ a }: { a: Action }) {
  if (a.asText) {
    return <span className="eyebrow !text-navy/60">{a.label}</span>;
  }
  if (!a.href) return null;
  const cls =
    a.kind === "primary"
      ? "btn-primary"
      : a.kind === "outline"
      ? "btn-outline"
      : a.kind === "muted"
      ? "eyebrow !text-navy/60"
      : "eyebrow hover:!text-gold";
  // External `#` anchors stay as <a>; internal app routes use <Link>.
  if (a.href.startsWith("#") || a.href.startsWith("http")) {
    return (
      <a href={a.href} className={cls}>
        {a.label}
      </a>
    );
  }
  return (
    <Link href={a.href as Route} className={cls}>
      {a.label}
    </Link>
  );
}

export function ProjectHero({
  eyebrow,
  name,
  oneLiner,
  founderName,
  founderRoleLabel,
  websiteUrl,
  actions,
  satellite,
  contextEyebrow,
  contextAside,
  video,
}: Props) {
  const eyebrowParts: React.ReactNode[] = [];
  if (eyebrow.kind) eyebrowParts.push(<span key="k">{eyebrow.kind}</span>);
  if (eyebrow.sector) eyebrowParts.push(<span key="s">{eyebrow.sector}</span>);
  if (eyebrow.stage) {
    const info = eyebrow.stageInfo?.[eyebrow.stage.key];
    eyebrowParts.push(
      // inline-flex items-center: label + ícono quedan centrados
      // verticalmente entre sí, sin desfase de baseline.
      <span key="st" className="inline-flex items-center">
        {eyebrow.stage.label}
        {info && (
          <InfoTooltip text={info} ariaLabel={eyebrow.stageInfoAriaLabel} />
        )}
      </span>
    );
  }
  if (eyebrow.location) eyebrowParts.push(<span key="l">{eyebrow.location}</span>);

  const cleanWebsite = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  // El CTA primario va en la columna 1; el secundario (outline, ej. chat)
  // en la columna 2 — alineado con la web del byline de arriba.
  const primaryAction = actions.find((a) => a.kind === "primary");
  const secondaryAction = actions.find((a) => a.kind !== "primary");

  // Bloque de texto del hero — reutilizado tal cual lleve o no video al lado.
  const textBlock = (
    <div className="min-w-0">
      {(contextEyebrow || contextAside) && (
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          {typeof contextEyebrow === "string" ? (
            <p className="eyebrow !text-navy/40">{contextEyebrow}</p>
          ) : (
            contextEyebrow
          )}
          {contextEyebrow && contextAside && (
            <span aria-hidden className="text-navy/30">
              ·
            </span>
          )}
          {contextAside}
        </div>
      )}
      {eyebrowParts.length > 0 && (
        // leading-none: la caja de línea abraza el texto, así el ícono
        // de info se centra contra las letras y no contra el line-box.
        <p className="eyebrow leading-none flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {eyebrowParts.map((node, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <span className="mr-3 text-navy/30">·</span>}
              {node}
            </span>
          ))}
        </p>
      )}

      <h1 className="font-sans mt-5 text-display text-navy break-words">
        {name}
      </h1>

      {oneLiner && (
        <p className="mt-4 max-w-3xl text-navy/75 leading-snug text-lg sm:text-xl italic">
          &ldquo;{oneLiner}&rdquo;
        </p>
      )}

      {/* Byline del founder + CTAs en UN grid de 2 columnas: así la web
          (col 2, fila 1) queda alineada justo arriba del botón secundario
          / "Abrir chat" (col 2, fila 2). Las columnas comparten track. */}
      <div className="mt-8 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-6 items-center">
        {/* Col 1 · Fila 1 — bloque del founder */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center hairline font-mono text-xs text-navy bg-paper-light"
          >
            {initialsOf(founderName)}
          </span>
          <div className="min-w-0">
            <p className="text-navy leading-tight truncate">{founderName}</p>
            <p className="eyebrow !text-navy/40 mt-1">{founderRoleLabel}</p>
          </div>
        </div>
        {/* Col 2 · Fila 1 — web del proyecto */}
        <div className="min-w-0">
          {cleanWebsite && websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="eyebrow !text-navy/50 hover:!text-gold transition-colors"
            >
              {cleanWebsite} ↗
            </a>
          )}
        </div>
        {/* Fila 2 — CTAs en una fila que ocupa las dos columnas y alinea a la
            izquierda. Así, si falta el primario (p.ej. proyecto inactivo), el
            secundario/chat no queda corrido a la derecha. */}
        {actions.length > 0 && (
          <div className="col-span-2 flex flex-wrap items-center gap-3">
            {primaryAction && <ActionLink a={primaryAction} />}
            {secondaryAction && <ActionLink a={secondaryAction} />}
          </div>
        )}
      </div>

      {/* Acciones de utilidad (editar) — link liviano, debajo del grid. */}
      {satellite && satellite.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {satellite.map((a, i) => (
            <ActionLink key={`s-${i}`} a={a} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="relative">
      <div className="hairline-b pt-2 pb-8 sm:pb-10 px-1 sm:px-2">
        {video ? (
          // 2 columnas (flex): texto a la izquierda, video a la derecha.
          // El video queda integrado al encabezado, no flotando suelto.
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 lg:items-center">
            <div className="lg:flex-1 min-w-0">{textBlock}</div>
            <div className="lg:w-[42%] lg:shrink-0 min-w-0">{video}</div>
          </div>
        ) : (
          textBlock
        )}
      </div>
    </section>
  );
}

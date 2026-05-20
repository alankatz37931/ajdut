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
  /** Eyebrow opcional al tope: "01 · Ficha del proyecto" o similar. */
  contextEyebrow?: string;
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
}: Props) {
  const eyebrowParts: React.ReactNode[] = [];
  if (eyebrow.kind) eyebrowParts.push(<span key="k">{eyebrow.kind}</span>);
  if (eyebrow.sector) eyebrowParts.push(<span key="s">{eyebrow.sector}</span>);
  if (eyebrow.stage) {
    const info = eyebrow.stageInfo?.[eyebrow.stage.key];
    eyebrowParts.push(
      <span key="st">
        {eyebrow.stage.label}
        {info && <InfoTooltip text={info} />}
      </span>
    );
  }
  if (eyebrow.location) eyebrowParts.push(<span key="l">{eyebrow.location}</span>);

  const cleanWebsite = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  return (
    <section className="relative">
      {/* Satélites: editar, abrir chat — discretos, esquina superior derecha. */}
      {satellite && satellite.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 mb-3">
          {satellite.map((a, i) => (
            <ActionLink key={i} a={a} />
          ))}
        </div>
      )}

      <div className="hairline-t hairline-b py-10 sm:py-14 px-1 sm:px-2">
        {contextEyebrow && (
          <p className="eyebrow !text-navy/40 mb-6">{contextEyebrow}</p>
        )}
        {eyebrowParts.length > 0 && (
          <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
            {eyebrowParts.map((node, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <span className="mr-3 text-navy/30">·</span>}
                {node}
              </span>
            ))}
          </p>
        )}

        <h1 className="font-sans mt-6 text-display text-navy break-words">
          {name}
        </h1>

        {oneLiner && (
          <p className="mt-6 max-w-3xl text-navy/80 leading-snug text-lg sm:text-xl italic">
            &ldquo;{oneLiner}&rdquo;
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center hairline font-mono text-xs text-navy bg-paper-light"
          >
            {initialsOf(founderName)}
          </span>
          <div className="min-w-0">
            <p className="eyebrow !text-navy/40">{founderRoleLabel}</p>
            <p className="mt-1 text-navy">{founderName}</p>
          </div>

          {cleanWebsite && websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 eyebrow hover:!text-gold"
            >
              {cleanWebsite} ↗
            </a>
          )}
        </div>

        {actions.length > 0 && (
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            {actions.map((a, i) => (
              <ActionLink key={i} a={a} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

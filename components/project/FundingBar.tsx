/**
 * FundingBar — banda única de números del proyecto.
 *
 * Sustituye la repetición que había entre "Participaciones" (KPIs en grilla)
 * + "Fondeo" (barra). Acá vive todo junto:
 *
 *   01 — Headline gigante "N de M acciones colocadas" (mono, kpi-lg)
 *   02 — Barra hairline ancha (h-2) — oro como progreso sobre gris cálido
 *   03 — Fila compacta de pares label/valor: disponibles, precio sugerido,
 *        valoración, monto a levantar — solo los que el founder declaró.
 *
 * Las cifras son mono (DM Mono). Los labels son eyebrow (DM Mono uppercase).
 * Nada de gradientes ni sombras (regla 09).
 */

type Stat = {
  label: string;
  /** Valor primario. Puede venir formateado con su moneda o sin ella. */
  value: string;
  hint?: string;
};

type Props = {
  headline: {
    /** "N de M" precomputado y formateado. */
    placed: string;
    total: string;
    /** "acciones colocadas" / "shares placed". */
    suffix: string;
  };
  /** Porcentaje 0..100 (ya validado por el caller). */
  percent: number;
  stats: Stat[];
};

export function FundingBar({ headline, percent, stats }: Props) {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="font-mono text-kpi-lg text-navy leading-none">
          <span className="text-gold">{headline.placed}</span>
          <span className="text-navy/40">{" / "}</span>
          {headline.total}
        </p>
        <p className="eyebrow !text-navy/60 sm:text-right">{headline.suffix}</p>
      </div>

      {/* Barra hairline ancha — gris cálido como track, oro como progreso. */}
      <div
        className="mt-5 h-2 w-full bg-line"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gold transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      {stats.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={i} className="bg-paper p-5">
              <p className="eyebrow">{s.label}</p>
              <p className="mt-3 font-mono text-kpi text-navy">{s.value}</p>
              {s.hint && <p className="mt-2 eyebrow !text-navy/40">{s.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

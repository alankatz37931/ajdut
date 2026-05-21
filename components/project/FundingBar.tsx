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
      {/* Bloque numérico unificado: micro-etiqueta arriba + número grande
          + denominador. El suffix queda como label superior en lugar de
          flotar al extremo derecho. */}
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-navy/50">
          {headline.suffix}
        </p>
        <p className="font-mono text-kpi-lg text-navy leading-none">
          <span className="text-gold">{headline.placed}</span>
          <span className="text-navy/40">{" / "}</span>
          {headline.total}
        </p>
      </div>

      {/* Barra premium — track ultra-suave + relleno gold con volumen,
          ambos rounded-full para sensación de pastilla, no de línea. */}
      <div
        className="mt-6 h-2.5 w-full rounded-full bg-line/60 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gold rounded-full transition-[width] duration-500 ease-out shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.06)]"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stats: hairlines explícitos por celda en vez del truco `gap-px bg-line`
          que dejaba bordes huérfanos cuando las celdas no llenaban la grilla. */}
      {stats.length > 0 && (
        <div className="mt-8 hairline-t hairline-l grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={i}
              className="bg-paper p-5 hairline-r hairline-b"
            >
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

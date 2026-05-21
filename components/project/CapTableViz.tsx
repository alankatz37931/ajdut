/**
 * CapTableViz — histograma horizontal del cap table.
 *
 * Una barra por holder. El ancho es proporcional al % del proyecto (sobre el
 * total emitido). El stake de la plataforma se marca con ◆ en oro. Top 10 +
 * "Otros" agrupado, para que la lista no se vuelva ruidosa con proyectos
 * grandes.
 *
 * Las barras son hairline (0.5px) por arriba/abajo — siguen la regla del
 * manual (retícula 0.5pt) y arman una tabla visual sin ensuciar con grids.
 */

type Row = {
  holder: string;
  isPlatform: boolean;
  shares: number;
};

type Props = {
  rows: Row[];
  totalShares: number;
  /** "de 1.500" → string fragment. */
  ofTotalLabel: string;
  formatShares: (n: number) => string;
  formatPct: (n: number) => string;
  othersLabel: string;
  /** Cuántos holders mostrar antes de agrupar como "Otros". */
  topN?: number;
};

export function CapTableViz({
  rows,
  totalShares,
  ofTotalLabel,
  formatShares,
  formatPct,
  othersLabel,
  topN = 10,
}: Props) {
  if (rows.length === 0 || totalShares <= 0) return null;

  // Top N + agrupado.
  const sorted = [...rows].sort((a, b) => b.shares - a.shares);
  const top = sorted.slice(0, topN);
  const restShares = sorted.slice(topN).reduce((s, r) => s + r.shares, 0);
  const displayRows: Row[] = [...top];
  if (restShares > 0) {
    displayRows.push({ holder: othersLabel, isPlatform: false, shares: restShares });
  }

  // Anchor: el holder más grande define el 100% visual.
  const max = displayRows[0]?.shares ?? 1;

  // Padding horizontal simétrico (px-5) en cada fila — los bordes
  // hairline-b van full-width del <ul>, así se alinean milimétricamente
  // sin importar el ancho del contenido.
  return (
    <ul className="hairline-t">
      {displayRows.map((r, i) => {
        const pct = (r.shares / totalShares) * 100;
        const widthPct = max > 0 ? (r.shares / max) * 100 : 0;
        return (
          <li key={i} className="hairline-b px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-navy break-words">
                {r.holder}
                {r.isPlatform && (
                  <span className="ml-2 text-gold" aria-hidden>
                    ◆
                  </span>
                )}
              </p>
              <p className="font-mono text-sm text-navy/70 shrink-0">
                {formatShares(r.shares)} {ofTotalLabel}
                <span className="ml-3 text-navy">{formatPct(pct)}</span>
              </p>
            </div>
            <div className="mt-2 h-px w-full bg-line/60 rounded-full">
              <div
                className={`h-full rounded-full ${r.isPlatform ? "bg-gold" : "bg-navy/70"}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

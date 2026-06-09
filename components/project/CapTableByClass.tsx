/**
 * CapTableByClass — cap table anonimizado, agregado por clase de accionista.
 *
 * El miembro normal NO ve quién tiene cada acción: ve la composición por
 * clase (Directivo, Operativo, Inversionistas, etc.) — cantidad de personas
 * y % del total. Mismo lenguaje visual que CapTableViz: barras hairline,
 * oro para el stake institucional de AJDUT.
 */

type Row = {
  label: string;
  /** Cantidad de personas en la clase. null = no aplica (pool / institucional). */
  people: number | null;
  shares: number;
  tone?: "default" | "platform" | "muted";
};

type Props = {
  rows: Row[];
  totalShares: number;
  /** "de 1.500" — fragmento ya formateado. */
  ofTotalLabel: string;
  formatShares: (n: number) => string;
  formatPct: (n: number) => string;
  /** Devuelve "3 personas" / "1 persona" según el idioma del viewer. */
  peopleLabel: (n: number) => string;
  /** Etiqueta de la fila de verificación (suma %). Si no se pasa, no se renderiza. */
  verificationLabel?: string;
  /** Mensaje a mostrar cuando la suma de shares excede totalShares. */
  overcommitWarn?: string;
};

export function CapTableByClass({
  rows,
  totalShares,
  ofTotalLabel,
  formatShares,
  formatPct,
  peopleLabel,
  verificationLabel,
  overcommitWarn,
}: Props) {
  if (rows.length === 0 || totalShares <= 0) return null;

  const sorted = [...rows].sort((a, b) => b.shares - a.shares);
  const max = sorted[0]?.shares ?? 1;
  // Verificación: suma de TODOS los rows. El miembro confía en que esto
  // sume ~100% — si no, hay un desfase con accionistas pre-existentes.
  const sumShares = sorted.reduce((s, r) => s + r.shares, 0);
  const sumPct = (sumShares / totalShares) * 100;
  const isOvercommit = sumShares > totalShares;

  return (
    <div>
      <ul>
      {sorted.map((r, i) => {
        const pct = (r.shares / totalShares) * 100;
        const widthPct = max > 0 ? (r.shares / max) * 100 : 0;
        const isPlatform = r.tone === "platform";
        const isMuted = r.tone === "muted";
        return (
          <li key={i} className="hairline-b last:border-b-0 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p
                className={`min-w-0 break-words ${
                  isMuted ? "text-navy/55" : "text-navy"
                }`}
              >
                {r.label}
                {isPlatform && (
                  <span className="ml-2 text-gold" aria-hidden>
                    ◆
                  </span>
                )}
                {r.people !== null && (
                  <span className="ml-2 eyebrow !text-navy/40">
                    {peopleLabel(r.people)}
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
                className={`h-full rounded-full ${
                  isPlatform
                    ? "bg-gold"
                    : isMuted
                      ? "bg-navy/30"
                      : "bg-navy/70"
                }`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
      </ul>
      {verificationLabel && (
        <div className="hairline-t px-5 py-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="eyebrow !text-navy/50">{verificationLabel}</p>
          <p
            className={`font-mono text-sm shrink-0 ${
              isOvercommit ? "text-red-700" : "text-navy"
            }`}
          >
            {formatShares(sumShares)} {ofTotalLabel}
            <span className="ml-3">{formatPct(sumPct)}</span>
          </p>
        </div>
      )}
      {isOvercommit && overcommitWarn && (
        <p className="px-5 pb-4 text-xs text-red-700 leading-relaxed">
          {overcommitWarn}
        </p>
      )}
    </div>
  );
}

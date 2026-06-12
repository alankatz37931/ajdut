import { formatNumber, formatPercent } from "@/lib/utils/format";

export type CapCompactRow = {
  key: string;
  name: string;
  shares: number;
  /** pool / reservado / sin-clasificar → atenuado. */
  muted?: boolean;
  /** stake de plataforma → marca gold (normalmente foldeado en Inversor pasivo). */
  gold?: boolean;
};

/**
 * Distribución de capital agregada por clase, en formato compacto (nombre +
 * % + participaciones, sin barras). Mismo lenguaje visual que el widget del
 * dashboard del founder. La ven los 3 tipos de usuario en la ficha del proyecto.
 */
export function CapTableByClassCompact({
  rows,
  totalShares,
  locale,
}: {
  rows: CapCompactRow[];
  totalShares: number;
  locale: string;
}) {
  return (
    <ul>
      {rows.map((row) => {
        const pct = totalShares > 0 ? (row.shares / totalShares) * 100 : 0;
        return (
          <li key={row.key} className="hairline-b last:border-b-0">
            <div className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm">
              <span
                className={`min-w-0 truncate ${
                  row.muted ? "text-navy/50" : "text-navy"
                }`}
              >
                {row.name}
                {row.gold && <span className="ml-2 text-gold">◆</span>}
              </span>
              <span className="flex items-baseline gap-2 shrink-0 font-mono">
                <span className="text-navy/40 text-xs">
                  {formatPercent(pct, 1, locale)}
                </span>
                <span className="text-navy">
                  {formatNumber(row.shares, undefined, locale)}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sparkline SVG puro (sin estado, renderiza en server) para el reporte PDF.
 * Usa `currentColor` en el trazo/relleno, así el color lo define el contenedor
 * (text-gold / text-navy) y se imprime nítido. Sin dependencias.
 */

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  /** Opacidad del área bajo la curva (0 = sin relleno). */
  fillOpacity?: number;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  values,
  width = 220,
  height = 48,
  fillOpacity = 0.12,
  className,
  ariaLabel,
}: SparklineProps) {
  if (values.length === 0) return null;

  const pad = 3; // deja aire para que el trazo no se corte en los bordes
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Un solo punto → lo mostramos centrado como un marcador.
  if (values.length === 1) {
    const cx = width / 2;
    const cy = height / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        role="img"
        aria-label={ariaLabel}
      >
        <circle cx={cx} cy={cy} r={3} fill="currentColor" />
      </svg>
    );
  }

  const stepX = innerW / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const last = coords[coords.length - 1]!;
  const area =
    fillOpacity > 0
      ? `${line} L${last[0].toFixed(1)},${(height - pad).toFixed(1)} L${pad.toFixed(
          1
        )},${(height - pad).toFixed(1)} Z`
      : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {area && <path d={area} fill="currentColor" fillOpacity={fillOpacity} stroke="none" />}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />
    </svg>
  );
}

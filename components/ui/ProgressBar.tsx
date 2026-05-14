import { cn } from "@/lib/utils/cn";

type Props = {
  current: number;
  total: number;
  label?: string;
  className?: string;
};

/**
 * Barra de progreso minimalista en bloques █ y ░ (estilo retícula técnica).
 * No usa color como significado: solo intensidad del navy.
 */
export function ProgressBar({ current, total, label, className }: Props) {
  const safe = total > 0 ? Math.min(current / total, 1) : 0;
  const segments = 16;
  const filled = Math.round(safe * segments);
  return (
    <div className={cn("font-mono text-sm", className)}>
      <div className="flex items-center gap-3">
        <span className="text-navy/85 tracking-tight">
          {"█".repeat(filled)}
          <span className="text-navy/25">{"░".repeat(segments - filled)}</span>
        </span>
        <span className="eyebrow !text-navy">
          {current} / {total}
        </span>
      </div>
      {label && <p className="mt-1 eyebrow">{label}</p>}
    </div>
  );
}

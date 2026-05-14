import { cn } from "@/lib/utils/cn";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
  className?: string;
};

export function KpiCard({ label, value, hint, highlight, className }: Props) {
  return (
    <div className={cn("bg-paper p-6", className)}>
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-mono text-kpi text-navy">
        {value}
        {highlight && <span className="ml-2 text-gold">◆</span>}
      </p>
      {hint && <p className="mt-2 eyebrow">{hint}</p>}
    </div>
  );
}

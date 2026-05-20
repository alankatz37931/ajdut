import { cn } from "@/lib/utils/cn";

type Status =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "CLOSED"
  | "ARCHIVED";

const LABEL: Record<Status, string> = {
  DRAFT: "Borrador",
  PENDING_APPROVAL: "En revisión",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  CLOSED: "Cerrado",
  ARCHIVED: "Archivado",
};

const SYMBOL: Record<Status, string> = {
  DRAFT: "○",
  PENDING_APPROVAL: "◐",
  ACTIVE: "●",
  SUSPENDED: "▪",
  CLOSED: "✕",
  ARCHIVED: "◇",
};

/**
 * Píldora de estado de proyecto.
 * - ACTIVE → acento oro (positivo).
 * - PENDING_APPROVAL → navy/70 (neutro-en-espera).
 * - DRAFT → navy/50 (borrador).
 * - SUSPENDED/CLOSED/ARCHIVED → navy/40 (apagado).
 * Sin background fuerte: respeta la regla "el oro nunca como fondo plano".
 */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = (status as Status) ?? "DRAFT";
  const tone =
    s === "ACTIVE"
      ? "!text-gold"
      : s === "PENDING_APPROVAL"
        ? "!text-navy/75"
        : s === "DRAFT"
          ? "!text-navy/60"
          : "!text-navy/40";

  return (
    <span
      className={cn(
        "eyebrow inline-flex items-center gap-1.5 hairline px-2.5 py-1 whitespace-nowrap",
        tone,
        className,
      )}
    >
      <span aria-hidden className="text-[0.85em] leading-none">
        {SYMBOL[s] ?? "·"}
      </span>
      {LABEL[s] ?? s}
    </span>
  );
}

import { cn } from "@/lib/utils/cn";
import { getDict } from "@/lib/i18n";

type Status =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "CLOSED"
  | "ARCHIVED";

/**
 * Píldora de estado de proyecto. Server component — usa getDict para
 * traducir el label según el idioma activo. El estado se comunica solo
 * con color (gold = activo, navy atenuado = resto), sin símbolos.
 */
export async function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = (status as Status) ?? "DRAFT";
  const dict = await getDict();
  const label = dict.projectStatus[s] ?? s;
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
        "eyebrow inline-flex items-center hairline px-2.5 py-1 whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

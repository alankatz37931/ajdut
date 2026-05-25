import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Logo AJDUT — "El Sello de Unión" (manual de marca v1.0 §5.1).
 *
 * Lockup vertical: wordmark + tagline. Peso bold, tracking amplio.
 * Solo la "U" en Oro (el Sello de Unión); A J D T en Navy. El color
 * marca el punto de unión. Debajo, el tagline en Oro (i18n).
 *
 * `variant="paper"` → A J D T en crema para fondos navy.
 */
export function BrandMark({
  className,
  variant = "navy",
  tagline = "Comunidades de negocio",
  ariaLabel = "AJDUT — Comunidades de negocio — inicio",
}: {
  className?: string;
  variant?: "navy" | "paper";
  tagline?: string;
  ariaLabel?: string;
}) {
  const ink = variant === "paper" ? "text-paper" : "text-navy";
  return (
    <Link
      href="/"
      aria-label={ariaLabel}
      className={cn("inline-flex flex-col items-start leading-none", className)}
    >
      <span className="font-sans font-bold text-2xl tracking-[0.08em]">
        <span className={ink}>AJD</span>
        <span className="text-gold">U</span>
        <span className={ink}>T</span>
      </span>
      <span className="mt-1.5 font-sans text-[0.625rem] tracking-[0.14em] text-gold">
        {tagline}
      </span>
    </Link>
  );
}

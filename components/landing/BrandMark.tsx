import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Logo AJDUT — "El Sello de Unión" (manual de marca v1.0 §5.1).
 *
 * Imagen del logo (wordmark "AJDUT" con la U en Oro + tagline "Hermandad y
 * Unión"). Dos versiones según el fondo:
 *  · `variant="navy"`  (fondos claros) → logo navy.
 *  · `variant="paper"` (fondos navy)   → logo en crema (mismas formas, el
 *    navy recoloreado a crema; el Oro se mantiene).
 *
 * El prop `tagline` se conserva por compatibilidad con los call sites (la
 * imagen ya trae el tagline embebido).
 */
export function BrandMark({
  className,
  variant = "navy",
  ariaLabel = "AJDUT — Hermandad y Unión — inicio",
}: {
  className?: string;
  variant?: "navy" | "paper";
  tagline?: string;
  ariaLabel?: string;
}) {
  const src = variant === "paper" ? "/brand/logo-paper.png" : "/brand/logo.png";
  return (
    <Link href="/" aria-label={ariaLabel} className={cn("inline-flex", className)}>
      <Image
        src={src}
        alt="AJDUT — Hermandad y Unión"
        width={1123}
        height={331}
        priority
        className="h-11 w-auto"
      />
    </Link>
  );
}

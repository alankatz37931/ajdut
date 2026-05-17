import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Logo AJDUT — "El Sello de Unión".
 *
 * Spec del manual de marca v1.0 (§5.1):
 *  - Mayúsculas, sans-serif geométrica, peso bold.
 *  - Tracking amplio (+40 ≈ 0.08em) — lenguaje de planos, no fintech genérico.
 *  - La base de la "U" lleva un trazo en Oro (#C8A96E): el puente que coordina.
 *    No es decoración — es la misión hecha tipografía.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="AJDUT — inicio"
      className={cn("inline-flex items-baseline font-sans font-bold text-navy", className)}
    >
      <span className="text-2xl tracking-[0.08em]">AJD</span>
      <span className="relative text-2xl tracking-[0.08em]">
        U
        {/* Sello de Unión: el puente bajo la U */}
        <span
          aria-hidden
          className="absolute -bottom-[1px] left-0 right-[0.08em] h-[2.5px] rounded-[1px] bg-gold"
        />
      </span>
      <span className="text-2xl tracking-[0.08em]">T</span>
    </Link>
  );
}

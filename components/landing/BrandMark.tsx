import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Logo AJDUT — "Sello de Unión".
 * La base de la "U" se renderiza en oro #C8A96E, único uso decorativo del color.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="AJDUT — inicio" className={cn("inline-flex items-baseline", className)}>
      <span className="font-sans text-2xl tracking-tight text-navy">AJD</span>
      <span className="relative font-sans text-2xl tracking-tight text-navy">
        U
        <span
          aria-hidden
          className="absolute -bottom-[2px] left-[10%] right-[10%] h-[2px] bg-gold"
        />
      </span>
      <span className="font-sans text-2xl tracking-tight text-navy">T</span>
    </Link>
  );
}

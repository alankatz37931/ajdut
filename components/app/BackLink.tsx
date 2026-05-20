"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * "Volver" genérico: usa el historial del navegador (router.back()), así
 * siempre vuelve a donde estabas — no a una ruta hardcodeada. Si no hay
 * historial (entraste directo por URL / refresh), cae al `fallback`.
 *
 * Estilo único en todo el sitio: eyebrow (uppercase + tracked + chico),
 * navy/40 por default, navy en hover, con la flecha "←" que se desplaza
 * suavemente a la izquierda en hover. Los call sites pasan SOLO el label
 * del destino como `children` (sin "←" ni "—"); el componente agrega la
 * flecha y la animación.
 */
export function BackLink({
  children,
  fallback,
  className,
}: {
  children: React.ReactNode;
  fallback: string;
  /** Override opcional del className; reemplaza completamente el estilo default. */
  className?: string;
}) {
  const router = useRouter();
  const baseClass =
    "group eyebrow inline-flex items-baseline gap-1.5 !text-navy/40 hover:!text-navy transition-colors duration-300 cursor-pointer border-0 bg-transparent p-0 m-0";
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback as Route);
        }
      }}
      className={className ?? baseClass}
    >
      <span
        aria-hidden
        className="inline-block transition-transform duration-300 ease-in-out group-hover:-translate-x-1"
      >
        ←
      </span>
      <span>{children}</span>
    </button>
  );
}

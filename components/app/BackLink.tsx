"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * "Volver" genérico: usa el historial del navegador (router.back()), así
 * siempre vuelve a donde estabas — no a una ruta hardcodeada. Si no hay
 * historial (entraste directo por URL / refresh), cae al `fallback`.
 */
export function BackLink({
  children,
  fallback,
  className = "eyebrow hover:!text-gold cursor-pointer border-0 bg-transparent p-0 m-0",
}: {
  children: React.ReactNode;
  fallback: string;
  className?: string;
}) {
  const router = useRouter();
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
      className={className}
    >
      {children}
    </button>
  );
}

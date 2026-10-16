"use client";

import { useEffect } from "react";

/**
 * Dispara el diálogo de impresión ("Guardar como PDF") apenas carga la página,
 * con un pequeño delay para que fuentes y SVG terminen de pintar. Es la forma
 * "un clic → descargar" sin dependencias ni navegador headless en el server.
 */
export function AutoPrint({ delayMs = 500 }: { delayMs?: number }) {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // Si el navegador bloquea el print automático, el botón manual queda.
      }
    }, delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return null;
}

/** Botón visible en pantalla (oculto al imprimir) para re-disparar la descarga. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary">
      {label}
    </button>
  );
}

"use client";

/** Botón que dispara el diálogo de impresión del navegador (Imprimir → PDF). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      {label}
    </button>
  );
}

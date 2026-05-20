"use client";

/**
 * InfoTooltip — ícono "ⓘ" minimal con tooltip CSS-only (hover/focus).
 *
 * Sin dependencias: usamos `group` + `group-hover:block / group-focus-within:block`
 * para mostrar el cuadrito. Pensado para etiquetas de etapa, métricas y
 * cualquier término que necesite una definición rápida sin abandonar la página.
 */
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-block group align-baseline ml-1">
      <button
        type="button"
        tabIndex={0}
        aria-label="Más información"
        className="text-xs text-navy/40 cursor-help bg-transparent border-0 p-0 m-0 leading-none align-baseline focus:outline-none focus:text-navy/80"
      >
        ⓘ
      </button>
      <span
        role="tooltip"
        className="hidden group-hover:block group-focus-within:block absolute left-0 top-full z-10 mt-1 w-64 hairline bg-paper-light p-2 text-xs text-navy/80 leading-relaxed normal-case tracking-normal font-sans"
      >
        {text}
      </span>
    </span>
  );
}

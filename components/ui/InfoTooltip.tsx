"use client";

/**
 * InfoTooltip — ícono "info" minimal con tooltip CSS-only (hover/focus).
 *
 * El ícono es un SVG (no el carácter Unicode ⓘ, que renderizaba borroso al
 * depender de la fuente). Vector nítido a cualquier tamaño.
 *
 * Sin dependencias: usamos `group` + `group-hover:block / group-focus-within:block`
 * para mostrar el cuadrito.
 */
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-block group align-middle ml-1.5">
      <button
        type="button"
        tabIndex={0}
        aria-label="Más información"
        /* Nudge sub-pixel: con leading-none en el eyebrow la caja abraza
           el texto, así que el desfase restante es mínimo. Ajustable en
           pasos de 0.25px. */
        className="inline-flex items-center justify-center translate-y-[0.75px] text-navy/35 hover:text-navy/70 cursor-help bg-transparent border-0 p-0 m-0 transition-colors focus:outline-none focus:text-navy/70"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="7.75" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="hidden group-hover:block group-focus-within:block absolute left-0 top-full z-10 mt-1.5 w-64 hairline bg-paper-light p-2.5 text-xs text-navy/80 leading-relaxed normal-case tracking-normal font-sans"
      >
        {text}
      </span>
    </span>
  );
}

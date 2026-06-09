"use client";

/**
 * Fila colapsable con el lenguaje visual de las filas de /configuracion:
 * label izquierda, resumen + chevron derecha, hairline-b debajo, altura
 * fija. Al expandir, el contenido cae abajo con respiración.
 *
 * Usada por ProfileSurface para que el patrón "fila colapsable" sea uno
 * solo en toda la app.
 */
export function ToggleRow({
  label,
  summary,
  open,
  onToggle,
  ariaLabel,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline-b">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center justify-between h-[4.75rem] text-left bg-transparent border-0 m-0 p-0 cursor-pointer hover:[&_.toggle-chevron]:text-navy"
      >
        <span className="text-navy">{label}</span>
        <span className="flex items-center gap-3">
          <span className="eyebrow !text-navy/40 normal-case tracking-normal">
            {summary}
          </span>
          <span
            aria-hidden
            className={`toggle-chevron font-mono text-navy/40 leading-none transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
        </span>
      </button>
      {open && <div className="pb-6">{children}</div>}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Floating-label form primitives — patrón unificado del sitio.
 *
 * El estilo es:
 *  - Sin caja: solo hairline navy/30 abajo del campo.
 *  - Al focus, un trazo gold de 1px hace scaleX(0)→1 desde la izquierda.
 *  - Para inputs: label flota dentro del campo y sube a eyebrow al
 *    focus o cuando hay contenido (Tailwind peer + placeholder-shown).
 *  - Para select y textarea: label estático arriba como eyebrow (un
 *    label flotando dentro de una caja multi-línea o un control con
 *    valor permanente queda raro).
 *
 * Nacido en /aplicar — replicado en el resto del site.
 */

const FIELD_BASE =
  "peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 pt-5 pb-1.5 font-sans text-navy outline-none focus:border-navy/30 transition-colors";

const LABEL_BASE =
  "absolute left-0 pointer-events-none origin-left transition-all duration-200 ease-out text-navy/40";

// Cuando el input tiene placeholder visible (vacío y sin foco), label
// grande abajo. Al focus o si hay valor, label arriba en eyebrow.
const LABEL_FLOATING =
  "top-[1.4rem] text-base " +
  "peer-focus:top-0 peer-focus:text-[0.7rem] peer-focus:uppercase peer-focus:tracking-[0.18em] peer-focus:text-navy " +
  "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[0.7rem] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.18em] peer-[:not(:placeholder-shown)]:text-navy/60";

/** Trazo gold animado debajo del campo al focus. */
export function GoldUnderline() {
  return (
    <span
      aria-hidden
      className="absolute left-0 right-0 bottom-0 h-px bg-gold origin-left scale-x-0 transition-transform duration-200 ease-out peer-focus:scale-x-100"
    />
  );
}

export function FloatingInput({
  id,
  name,
  type = "text",
  label,
  value,
  onChange,
  autoFocus,
  maxLength,
  autoComplete,
  required,
  inputMode,
}: {
  id: string;
  name?: string;
  type?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  maxLength?: number;
  autoComplete?: string;
  required?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url" | "search";
}) {
  return (
    <div className="relative pt-2">
      <input
        id={id}
        name={name ?? id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        maxLength={maxLength}
        autoComplete={autoComplete}
        required={required}
        inputMode={inputMode}
        placeholder=" "
        className={FIELD_BASE}
      />
      <label htmlFor={id} className={`${LABEL_BASE} ${LABEL_FLOATING}`}>
        {label}
      </label>
      <GoldUnderline />
    </div>
  );
}

/**
 * FloatingSelect — dropdown custom (NO <select> nativo) que respeta el
 * estilo del form: paper-light bg, hairlines, gold accent.
 */
export function FloatingSelect({
  id,
  label,
  value,
  onChange,
  options,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (autoFocus) buttonRef.current?.focus();
  }, [autoFocus]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="pt-2" ref={wrapperRef}>
      <label htmlFor={id} className="block eyebrow !text-navy mb-1.5">
        {label}
      </label>
      <div className="relative">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-navy text-left outline-none cursor-pointer flex items-center justify-between gap-3 transition-colors"
        >
          <span>{selected?.label ?? ""}</span>
          <span
            aria-hidden
            className={`text-navy/40 text-sm transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>
        <GoldUnderline />

        {open && (
          <ul
            role="listbox"
            aria-labelledby={id}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 bg-paper-light hairline shadow-sm overflow-hidden"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              const isLast = i === options.length - 1;
              return (
                <li key={o.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={`relative w-full text-left px-4 py-2.5 font-sans text-navy hover:bg-paper transition-colors cursor-pointer ${
                      !isLast ? "border-b-[0.5px] border-line" : ""
                    }`}
                  >
                    {isSelected && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
                      />
                    )}
                    <span className={isSelected ? "text-navy" : "text-navy/85"}>
                      {o.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * FloatingTextarea — para multi-línea NO usamos floating label (queda
 * raro). Patrón igual al select: eyebrow estático arriba, hairline
 * estática + trazo gold animado debajo. La hairline base vive en un
 * span absolute (no en el border del textarea) para que el gold
 * underline se superponga perfecto sin offset por inline-block.
 */
export function FloatingTextarea({
  id,
  label,
  value,
  onChange,
  rows,
  maxLength,
  counterSuffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  maxLength: number;
  counterSuffix: string;
}) {
  return (
    <div className="pt-2">
      <label htmlFor={id} className="block eyebrow !text-navy mb-1.5">
        {label}
      </label>
      <div className="relative">
        <textarea
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          className="peer block w-full bg-transparent border-0 px-0 py-1.5 font-sans text-navy leading-relaxed outline-none resize-none"
        />
        <span
          aria-hidden
          className="absolute left-0 right-0 bottom-0 h-px bg-navy/30"
        />
        <GoldUnderline />
      </div>
      <span className="mt-1.5 block eyebrow !text-navy/40">
        {value.length} / {maxLength} {counterSuffix}
      </span>
    </div>
  );
}

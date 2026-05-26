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
  step,
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
  /** Para type="number" — pasá "any" para permitir decimales. */
  step?: string;
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
        step={step}
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
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  autoFocus?: boolean;
  disabled?: boolean;
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
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-navy text-left outline-none flex items-center justify-between gap-3 transition-colors ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
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
 * FloatingMultiSelect — versión multi-select del FloatingSelect. Mismo
 * estilo visual; cada opción tiene un checkbox y click toggle. Cuando no
 * hay nada seleccionado se muestra `placeholder` (típicamente "All X").
 */
export function FloatingMultiSelect({
  id,
  label,
  values,
  onChange,
  options,
  placeholder,
  autoFocus,
  disabled,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  autoFocus?: boolean;
  disabled?: boolean;
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

  function toggle(val: string) {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  }

  const display =
    values.length === 0
      ? placeholder
      : options
          .filter((o) => values.includes(o.value))
          .map((o) => o.label)
          .join(", ");

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
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-navy text-left outline-none flex items-center justify-between gap-3 transition-colors ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span className={`truncate ${values.length === 0 ? "text-navy/40" : ""}`}>
            {display}
          </span>
          <span
            aria-hidden
            className={`text-navy/40 text-sm transition-transform duration-200 shrink-0 ${
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
            aria-multiselectable
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 bg-paper-light hairline shadow-sm overflow-hidden max-h-72 overflow-y-auto"
          >
            {options.map((o, i) => {
              const isSelected = values.includes(o.value);
              const isLast = i === options.length - 1;
              return (
                <li key={o.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`relative w-full text-left px-4 py-2.5 font-sans text-navy hover:bg-paper transition-colors cursor-pointer flex items-center gap-3 ${
                      !isLast ? "border-b-[0.5px] border-line" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-4 w-4 shrink-0 hairline items-center justify-center transition-colors ${
                        isSelected ? "bg-navy" : "bg-paper"
                      }`}
                    >
                      {isSelected && (
                        <span className="text-paper text-[10px] leading-none">
                          ✓
                        </span>
                      )}
                    </span>
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
  counterSuffix = "",
  required,
  discreetCounter = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  /** Si se omite, no se renderiza el contador y no hay tope de caracteres. */
  maxLength?: number;
  counterSuffix?: string;
  required?: boolean;
  /** Contador en estilo discreto: mono chico, tenue, alineado a la derecha. */
  discreetCounter?: boolean;
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
          required={required}
          className="peer block w-full bg-transparent border-0 px-0 py-1.5 font-sans text-navy leading-relaxed outline-none resize-none"
        />
        <span
          aria-hidden
          className="absolute left-0 right-0 bottom-0 h-px bg-navy/30"
        />
        <GoldUnderline />
      </div>
      {maxLength != null && (
        <span
          className={
            discreetCounter
              ? "mt-1.5 block text-right font-mono text-[0.7rem] tracking-wide tabular-nums text-navy/30"
              : "mt-1.5 block eyebrow !text-navy/40"
          }
        >
          {value.length} / {maxLength} {counterSuffix}
        </span>
      )}
    </div>
  );
}

/**
 * FloatingDate — para <input type="date">. Los date inputs no soportan
 * `placeholder`, así que el floating label no aplica: usamos label estático
 * arriba como eyebrow, igual que FloatingSelect / FloatingTextarea.
 */
export function FloatingDate({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="pt-2">
      <label htmlFor={id} className="block eyebrow !text-navy mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-mono text-sm text-navy outline-none"
        />
        <GoldUnderline />
      </div>
    </div>
  );
}

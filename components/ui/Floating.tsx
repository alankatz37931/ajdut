"use client";

import { memo, useEffect, useRef, useState } from "react";

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
 *
 * Perf: todas las primitivas exportadas están envueltas en `React.memo`.
 * Esto es preparación: el bail por shallow-equality se activa cuando el
 * padre estabiliza el callback `onChange` (e.g. con `useCallback`). En
 * forms que no estabilizan callbacks, el memo no produce ganancia (cada
 * render el padre crea una arrow nueva), pero tampoco hace daño.
 */

const FIELD_BASE =
  "peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 pt-5 pb-1.5 font-sans text-navy outline-none focus:border-navy/60 transition-colors";

const LABEL_BASE =
  "absolute left-0 pointer-events-none origin-left transition-all duration-200 ease-out text-navy/40";

// Cuando el input tiene placeholder visible (vacío y sin foco), label
// grande abajo. Al focus o si hay valor, label arriba en eyebrow.
const LABEL_FLOATING =
  "top-[1.4rem] text-base " +
  "peer-focus:top-0 peer-focus:text-[0.7rem] peer-focus:uppercase peer-focus:tracking-[0.18em] peer-focus:text-navy " +
  "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[0.7rem] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.18em] peer-[:not(:placeholder-shown)]:text-navy/60";

/**
 * Trazo gold debajo del campo al focus. h-0.5 (2px) para que sea visible
 * en pantallas estándar y cumpla WCAG 2.4.7 (Focus Visible). El border base
 * navy/30 también se oscurece a navy/60 al focus, dando doble señal.
 */
export function GoldUnderline() {
  return (
    <span
      aria-hidden
      className="absolute left-0 right-0 bottom-0 h-0.5 bg-gold origin-left scale-x-0 transition-transform duration-200 ease-out peer-focus:scale-x-100"
    />
  );
}

function FloatingInputImpl({
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
export const FloatingInput = memo(FloatingInputImpl);

/**
 * Hook compartido por FloatingSelect / FloatingMultiSelect.
 *
 * Maneja:
 *  - estado `open` + outside-click + Escape para cerrar
 *  - `activeIndex` para keyboard nav (Up/Down/Home/End)
 *  - reset de activeIndex al abrir (sincronizado con el valor seleccionado)
 *
 * Devuelve también helpers para que el componente decida qué hacer en
 * Enter/Space (single vs multi).
 */
function useListboxNav(opts: {
  optionsLen: number;
  /** Index inicial al abrir (típicamente el del valor seleccionado). */
  initialActive: number;
  /** Llamado cuando el usuario apretó Enter o Space sobre `activeIndex`. */
  onActivate: (index: number) => void;
}) {
  const { optionsLen, initialActive, onActivate } = opts;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialActive);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Cuando abrimos, sincronizamos el activeIndex con la selección actual
  // para que Up/Down arranque desde un lugar predecible.
  useEffect(() => {
    if (open) {
      setActiveIndex(initialActive >= 0 ? initialActive : 0);
    }
  }, [open, initialActive]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      // Solo manejamos keys si el foco está dentro del wrapper — así no
      // robamos keys cuando el usuario está en otro listbox o input.
      if (!wrapperRef.current?.contains(document.activeElement)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(optionsLen - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(optionsLen - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // Usamos un getter del activeIndex actual vía functional state — no
        // queremos cerrar sobre stale.
        setActiveIndex((i) => {
          if (i >= 0 && i < optionsLen) onActivate(i);
          return i;
        });
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, optionsLen, onActivate]);

  return {
    open,
    setOpen,
    activeIndex,
    setActiveIndex,
    wrapperRef,
    buttonRef,
    listRef,
  };
}

/**
 * FloatingSelect — dropdown custom (NO <select> nativo) que respeta el
 * estilo del form: paper-light bg, hairlines, gold accent.
 *
 * Teclado: ArrowUp/Down/Home/End mueven el item activo; Enter/Space lo
 * selecciona y cierra; Escape cierra; click fuera cierra.
 */
function FloatingSelectImpl({
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
  const selectedIndex = options.findIndex((o) => o.value === value);
  const { open, setOpen, activeIndex, setActiveIndex, wrapperRef, buttonRef } =
    useListboxNav({
      optionsLen: options.length,
      initialActive: selectedIndex,
      onActivate: (i) => {
        const opt = options[i];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
          buttonRef.current?.focus();
        }
      },
    });

  useEffect(() => {
    if (autoFocus) buttonRef.current?.focus();
  }, [autoFocus, buttonRef]);

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
          aria-activedescendant={
            open && activeIndex >= 0 && activeIndex < options.length
              ? `${id}-opt-${activeIndex}`
              : undefined
          }
          className={`peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-navy text-left outline-none focus:border-navy/60 flex items-center justify-between gap-3 transition-colors ${
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
              const isActive = i === activeIndex;
              const isLast = i === options.length - 1;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`relative w-full text-left px-4 py-2.5 font-sans text-navy transition-colors cursor-pointer ${
                      isActive ? "bg-paper" : "hover:bg-paper"
                    } ${!isLast ? "border-b-[0.5px] border-line" : ""}`}
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
export const FloatingSelect = memo(FloatingSelectImpl);

/**
 * FloatingMultiSelect — versión multi-select del FloatingSelect. Mismo
 * estilo visual; cada opción tiene un checkbox y click toggle. Cuando no
 * hay nada seleccionado se muestra `placeholder` (típicamente "All X").
 *
 * Teclado: igual que FloatingSelect, pero Enter/Space hace TOGGLE (no
 * cierra), respetando el patrón ARIA listbox multi-selectable.
 */
function FloatingMultiSelectImpl({
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
  // Para multi, "initialActive" arranca en el primer seleccionado (o 0).
  const firstSelectedIndex = options.findIndex((o) => values.includes(o.value));

  function toggle(val: string) {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  }

  const { open, setOpen, activeIndex, setActiveIndex, wrapperRef, buttonRef } =
    useListboxNav({
      optionsLen: options.length,
      initialActive: firstSelectedIndex,
      onActivate: (i) => {
        const opt = options[i];
        if (opt) toggle(opt.value);
      },
    });

  useEffect(() => {
    if (autoFocus) buttonRef.current?.focus();
  }, [autoFocus, buttonRef]);

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
          aria-activedescendant={
            open && activeIndex >= 0 && activeIndex < options.length
              ? `${id}-opt-${activeIndex}`
              : undefined
          }
          className={`peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-navy text-left outline-none focus:border-navy/60 flex items-center justify-between gap-3 transition-colors ${
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
              const isActive = i === activeIndex;
              const isLast = i === options.length - 1;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`relative w-full text-left px-4 py-2.5 font-sans text-navy transition-colors cursor-pointer flex items-center gap-3 ${
                      isActive ? "bg-paper" : "hover:bg-paper"
                    } ${!isLast ? "border-b-[0.5px] border-line" : ""}`}
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
export const FloatingMultiSelect = memo(FloatingMultiSelectImpl);

/**
 * FloatingTextarea — para multi-línea NO usamos floating label (queda
 * raro). Patrón igual al select: eyebrow estático arriba, hairline
 * estática + trazo gold animado debajo. La hairline base vive en un
 * span absolute (no en el border del textarea) para que el gold
 * underline se superponga perfecto sin offset por inline-block.
 */
function FloatingTextareaImpl({
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
          className="absolute left-0 right-0 bottom-0 h-px bg-navy/30 peer-focus:bg-navy/60 transition-colors"
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
export const FloatingTextarea = memo(FloatingTextareaImpl);

/**
 * FloatingDate — para <input type="date">. Los date inputs no soportan
 * `placeholder`, así que el floating label no aplica: usamos label estático
 * arriba como eyebrow, igual que FloatingSelect / FloatingTextarea.
 */
function FloatingDateImpl({
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
          className="peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-mono text-sm text-navy outline-none focus:border-navy/60 transition-colors"
        />
        <GoldUnderline />
      </div>
    </div>
  );
}
export const FloatingDate = memo(FloatingDateImpl);


"use client";

import { useState } from "react";

/**
 * Botón con confirmación inline en el mismo lugar — reemplaza window.confirm()
 * que rompe la estética. Click 1 → muestra "Sí · No"; click 2 → ejecuta.
 */
export function InlineConfirm({
  label,
  confirmLabel = "Sí",
  cancelLabel = "No",
  question = "¿Confirmás?",
  onConfirm,
  disabled,
  className = "eyebrow hover:!text-navy/40",
  confirmClassName = "eyebrow !text-gold hover:!text-navy",
  cancelClassName = "eyebrow hover:!text-gold",
}: {
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  question?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  confirmClassName?: string;
  cancelClassName?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-3 flex-wrap">
        <span className="eyebrow !text-navy">{question}</span>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          disabled={disabled}
          className={confirmClassName}
        >
          {confirmLabel}
        </button>
        <span aria-hidden className="eyebrow !text-navy/30">
          ·
        </span>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={disabled}
          className={cancelClassName}
        >
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={disabled}
      className={className}
    >
      {label}
    </button>
  );
}

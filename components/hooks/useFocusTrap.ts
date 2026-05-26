"use client";

import { useEffect, useRef } from "react";

/**
 * Focus trap accesible para modales y drawers. Cuando `active` es true:
 *  - Guarda el elemento que tenía foco al activar.
 *  - Mueve el foco al primer elemento focusable dentro del container (o al
 *    container mismo si no hay elementos focusables — typical close-only).
 *  - Atrapa Tab/Shift-Tab dentro del container.
 *  - Esc llama a `onClose`.
 *  - Al desactivar, restaura el foco al elemento original.
 *
 * Uso:
 *   const ref = useFocusTrap<HTMLDivElement>(open, onClose);
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Mover foco al primer focusable del container
    const focusables = getFocusables(container);
    const initialTarget = focusables[0] ?? container;
    // Algunos containers necesitan tabindex=-1 para recibir foco programático
    if (initialTarget === container && !container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }
    initialTarget.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      if (!container) return;

      const list = getFocusables(container);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [active, onClose]);

  return containerRef;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null
  );
}

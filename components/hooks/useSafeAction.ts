"use client";

import { useCallback, useRef, useState, useTransition } from "react";

/**
 * Shape de respuesta estándar de los server actions del proyecto. La rama de
 * éxito puede traer cualquier conjunto de campos extra (`{ ok: true; slug }`,
 * `{ ok: true; count }`, etc.); la de error siempre trae `{ error: string }`.
 *
 * Toleramos `void` porque varias acciones hacen `redirect()` y nunca
 * retornan al cliente (la promesa resuelve a `undefined`).
 */
export type ActionSuccess = { ok: true; [k: string]: unknown };
export type ActionFailure = {
  ok: false;
  error: string;
  /** Código semántico opcional (e.g., `NOT_FOUND`, `VALIDATION`, `FORBIDDEN`). */
  code?: string;
  /** Nombre del campo del form que disparó el error, para resaltarlo en UI. */
  field?: string;
};
export type ActionResult<TSuccess extends ActionSuccess = ActionSuccess> =
  | TSuccess
  | ActionFailure;

export type ActionFn<TInput, TSuccess extends ActionSuccess> = (
  input: TInput
) => Promise<ActionResult<TSuccess> | void>;

export type UseSafeActionOptions<TSuccess extends ActionSuccess> = {
  /**
   * Callback opcional cuando la acción retorna `{ ok: true, ... }`. Recibe el
   * objeto completo (incluyendo el flag `ok`), para que el caller pueda hacer
   * destructuring de los campos extra con tipado correcto.
   */
  onSuccess?: (data: TSuccess) => void;
  /**
   * Callback opcional cuando la acción retorna `{ ok: false }` o tira.
   */
  onError?: (message: string) => void;
  /**
   * Mensaje a mostrar cuando la llamada explota fuera del contrato (red caída,
   * runtime error, etc.). Default: `"Network error"` — el dict del consumidor
   * puede sobreescribirlo si tiene una cadena localizada.
   */
  networkErrorMessage?: string;
};

export type UseSafeActionReturn<TInput> = {
  run: (input: TInput) => void;
  isPending: boolean;
  error: string | null;
  reset: () => void;
};

/**
 * Centraliza el patrón repetido en ~15-20 forms: `useTransition` + `setError`
 * manual + guard de doble click.
 *
 * Garantías clave:
 *  - **Double-click guard:** si ya hay una transición en curso, `run` es no-op.
 *    Cubre el caso "el usuario hace click 3 veces antes de que React marque
 *    `isPending = true`" via un ref interno (no depende del re-render).
 *  - **Error normalizado:** errores de red / runtime se atrapan y se exponen
 *    como `error: string`, evitando que el form quede colgado en `isPending`.
 *  - **No swallow:** si la acción retorna `void` (caso `redirect()`), `error`
 *    queda en `null` y `onSuccess` NO se invoca — el browser navega solo.
 */
export function useSafeAction<
  TInput,
  TSuccess extends ActionSuccess = ActionSuccess,
>(
  action: ActionFn<TInput, TSuccess>,
  options: UseSafeActionOptions<TSuccess> = {}
): UseSafeActionReturn<TInput> {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inFlightRef = useRef(false);
  const { onSuccess, onError, networkErrorMessage = "Network error" } = options;

  const run = useCallback(
    (input: TInput) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setError(null);
      startTransition(async () => {
        try {
          const result = await action(input);
          if (result && result.ok === false) {
            setError(result.error);
            onError?.(result.error);
            return;
          }
          if (result && result.ok === true) {
            onSuccess?.(result);
          }
          // result === undefined → la acción hizo redirect(); no tocamos error.
        } catch {
          setError(networkErrorMessage);
          onError?.(networkErrorMessage);
        } finally {
          inFlightRef.current = false;
        }
      });
    },
    [action, networkErrorMessage, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { run, isPending, error, reset };
}

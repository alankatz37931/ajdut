"use client";

import { useCallback } from "react";
import { acquireResaleAction } from "./actions";
import { useSafeAction } from "@/components/hooks/useSafeAction";

/**
 * Botón "Adquirir participaciones" del tablón de reventa (first-to-acquire).
 * La page es server component, así que la acción se dispara desde acá.
 *
 * El revalidatePath del server action refresca la lista al cerrar el trato; no
 * recargamos la página a mano.
 */
export function AcquireButton({
  projectSlug,
  resaleListingId,
  label,
  acquiringLabel,
}: {
  projectSlug: string;
  resaleListingId: string;
  label: string;
  acquiringLabel: string;
}) {
  const acquireFn = useCallback(
    () => acquireResaleAction(projectSlug, resaleListingId),
    [projectSlug, resaleListingId]
  );
  const { run, isPending, error } = useSafeAction<void>(acquireFn);

  return (
    <div className="mt-4">
      <button
        onClick={() => run()}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        {isPending ? acquiringLabel : label}
      </button>
      {error && (
        <p className="mt-3 eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

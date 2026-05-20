"use client";

import { useState, useTransition } from "react";
import { confirmValidationAction } from "./actions";

export function ConfirmButton({ checkId }: { checkId: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const r = await confirmValidationAction(checkId);
      if (r.ok) {
        setDone(true);
      } else {
        setError(r.error);
      }
    });
  }

  if (done) {
    return (
      <div className="mt-8 hairline p-6 bg-paper">
        <p className="eyebrow !text-gold">✓ Confirmado</p>
        <h2 className="font-sans mt-3 text-h2 text-navy">Gracias.</h2>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Quedó registrado que seguís activo. La próxima verificación llegará
          según la frecuencia que configuraste.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper mb-4" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        {isPending ? "Confirmando…" : "Sí, sigo activo →"}
      </button>
    </div>
  );
}

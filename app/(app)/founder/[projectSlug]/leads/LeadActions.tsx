"use client";

import { useState, useTransition } from "react";
import {
  markLeadContactedAction,
  dismissLeadAction,
  acceptLeadAndAssignAction,
} from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

type Props = {
  leadId: string;
  status: string;
  shareCountRequested: number;
  investorName: string;
};

export function LeadActions({ leadId, status, shareCountRequested, investorName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "confirming-accept">("idle");
  const [isPending, startTransition] = useTransition();

  function markContacted() {
    setError(null);
    startTransition(async () => {
      const r = await markLeadContactedAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const r = await dismissLeadAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function acceptAndAssign() {
    setError(null);
    startTransition(async () => {
      const r = await acceptLeadAndAssignAction(leadId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // El revalidatePath en el servidor refresca la lista
    });
  }

  if (mode === "confirming-accept") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">Confirmar asignación</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          Vas a asignar <span className="font-mono text-navy">{shareCountRequested.toLocaleString("es-MX")}</span> acciones
          a <span className="text-navy">{investorName}</span>. Esta acción es{" "}
          <strong>irreversible</strong>: queda registrada en la cadena inmutable y se genera un
          certificado. Asegurate de haber cerrado el pago por fuera antes de confirmar.
        </p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={acceptAndAssign}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Asignando…" : "Sí, asignar acciones"}
          </button>
          <button
            onClick={() => setMode("idle")}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        onClick={() => setMode("confirming-accept")}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        Aceptar y asignar acciones →
      </button>
      {status === "OPEN" && (
        <button
          onClick={markContacted}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          Marcar como contactado
        </button>
      )}
      <InlineConfirm
        label="Descartar"
        question="¿Descartar este lead?"
        onConfirm={dismiss}
        disabled={isPending}
        className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
      />
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import {
  approvePendingAssignmentAction,
  rejectPendingAssignmentAction,
} from "./actions";

type Props = {
  pendingId: string;
  recipientLabel: string;
  shareCount: number;
};

export function PendingAssignmentActions({
  pendingId,
  recipientLabel,
  shareCount,
}: Props) {
  const [mode, setMode] = useState<
    "idle" | "confirming-approve" | "rejecting" | "done-approved" | "done-rejected"
  >("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approvePendingAssignmentAction(pendingId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode("done-approved");
    });
  }

  function reject() {
    setError(null);
    if (note.trim().length < 10) {
      setError("La nota debe tener al menos 10 caracteres.");
      return;
    }
    startTransition(async () => {
      const r = await rejectPendingAssignmentAction(pendingId, note);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode("done-rejected");
    });
  }

  if (mode === "done-approved") {
    return (
      <p className="eyebrow !text-gold" role="status">
        Asignación aprobada. Participación y certificado emitidos.
      </p>
    );
  }
  if (mode === "done-rejected") {
    return (
      <p className="eyebrow !text-navy/60" role="status">
        Asignación rechazada. El project owner recibió la nota.
      </p>
    );
  }

  if (mode === "confirming-approve") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">Confirmar aprobación</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          Vas a ejecutar la asignación de{" "}
          <span className="font-mono text-navy">
            {shareCount.toLocaleString("es-MX")}
          </span>{" "}
          acciones a <span className="text-navy">{recipientLabel}</span>. Se
          decrementa el pool, se crea la Participation y se emite el
          Certificate. Es <strong>irreversible</strong>.
        </p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={approve}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Aprobando…" : "Sí, aprobar y ejecutar"}
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

  if (mode === "rejecting") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-navy">Nota de rechazo (mínimo 10 caracteres)</p>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy"
          placeholder="Explicale al project owner por qué se rechaza esta asignación…"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reject}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Rechazando…" : "Confirmar rechazo"}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
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
        onClick={() => setMode("confirming-approve")}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        Aprobar →
      </button>
      <button
        onClick={() => setMode("rejecting")}
        disabled={isPending}
        className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

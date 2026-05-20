"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveProjectAction, rejectProjectAction } from "./admin-actions";

export function AdminApprovalActions({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirming-approve" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveProjectAction(projectSlug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    if (reason.trim().length < 10) {
      setError("La razón debe tener al menos 10 caracteres.");
      return;
    }
    startTransition(async () => {
      const r = await rejectProjectAction(projectSlug, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (mode === "confirming-approve") {
    return (
      <div className="hairline p-6 bg-paper-light space-y-4">
        <p className="eyebrow !text-gold">Confirmar aprobación</p>
        <p className="text-navy/85 leading-relaxed">
          Al aprobar, AJDUT emite automáticamente el <strong>10%</strong> institucional y el resto
          queda como pool de acciones disponibles para los miembros. Esta acción no se puede revertir
          desde la UI.
        </p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={approve} disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Aprobando…" : "Sí, aprobar proyecto"}
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
      <div className="hairline p-6 bg-paper-light space-y-4">
        <p className="eyebrow">Rechazar proyecto</p>
        <p className="text-navy/75 leading-relaxed">
          El founder recibirá esta nota explicando por qué no avanzamos.
        </p>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Mínimo 10 caracteres"
          className="w-full hairline bg-paper px-3 py-2 font-sans text-navy focus:outline-none focus:border-navy"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={reject} disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Rechazando…" : "Confirmar rechazo"}
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
    <div className="hairline p-6 bg-paper-light space-y-4">
      <p className="eyebrow">Moderación · proyecto pendiente</p>
      <p className="text-navy/75 leading-relaxed">
        Este proyecto fue creado por el founder y espera tu aprobación. Al aprobar, AJDUT emite
        automáticamente el 10% institucional y crea el pool de acciones disponibles para los
        miembros.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setMode("confirming-approve")}
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          Aprobar proyecto
        </button>
        <button
          onClick={() => setMode("rejecting")}
          disabled={isPending}
          className="btn-outline disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

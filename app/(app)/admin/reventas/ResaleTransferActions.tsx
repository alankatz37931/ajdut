"use client";

import { useState, useTransition } from "react";
import { FloatingTextarea } from "@/components/ui/Floating";
import { approveTransferAction, rejectTransferAction } from "./actions";

type Props = {
  resaleListingId: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
};

export function ResaleTransferActions({
  resaleListingId,
  sellerName,
  buyerName,
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
      const r = await approveTransferAction(resaleListingId);
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
      const r = await rejectTransferAction(resaleListingId, note);
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
        Traspaso aprobado. Las acciones quedaron a nombre del comprador.
      </p>
    );
  }
  if (mode === "done-rejected") {
    return (
      <p className="eyebrow !text-navy/60" role="status">
        Traspaso rechazado. La reventa vuelve al tablón del proyecto.
      </p>
    );
  }

  if (mode === "confirming-approve") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">Confirmar aprobación</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          Vas a traspasar{" "}
          <span className="font-mono text-navy">
            {shareCount.toLocaleString("es-MX")}
          </span>{" "}
          acciones de <span className="text-navy">{sellerName}</span> a{" "}
          <span className="text-navy">{buyerName}</span>. Se registra el cambio
          de titularidad en la cadena de propiedad. Es{" "}
          <strong>irreversible</strong>.
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
            {isPending ? "Aprobando…" : "Sí, aprobar el traspaso"}
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
        <FloatingTextarea
          id={`reject-${resaleListingId}`}
          label="Nota de rechazo (mínimo 10 caracteres)"
          value={note}
          onChange={setNote}
          rows={4}
          maxLength={1000}
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
        Aprobar traspaso →
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

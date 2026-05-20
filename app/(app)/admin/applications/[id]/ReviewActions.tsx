"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  approveApplicationAction,
  rejectApplicationAction,
  type ApproveResult,
} from "./actions";

const ROLE_LABEL: Record<"PARTNER" | "PROJECT_OWNER" | "CO_ADMIN", string> = {
  PARTNER: "Miembro",
  PROJECT_OWNER: "Founder",
  CO_ADMIN: "Co-admin",
};

export function ApplicationReviewActions({
  applicationId,
  defaultRole = "PARTNER",
}: {
  applicationId: string;
  /**
   * Rol pre-seleccionado en el radio al abrir el formulario de aprobación.
   * Lo decide el caller en función del tipo de aplicación:
   *   - COMPANY → PROJECT_OWNER (responsable de un proyecto)
   *   - PERSON  → PARTNER (miembro de la comunidad)
   * El admin puede cambiarlo manualmente antes de confirmar.
   */
  defaultRole?: "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN";
}) {
  const [mode, setMode] = useState<
    "idle" | "approving" | "rejecting" | "approved" | "rejected"
  >("idle");
  const [approvedRole, setApprovedRole] =
    useState<"PARTNER" | "PROJECT_OWNER" | "CO_ADMIN">(defaultRole);
  const [rejectionNote, setRejectionNote] = useState("");
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveApplicationAction(applicationId, approvedRole);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setMode("approved");
    });
  }

  function reject() {
    setError(null);
    if (rejectionNote.trim().length < 10) {
      setError("La nota debe tener al menos 10 caracteres.");
      return;
    }
    startTransition(async () => {
      const res = await rejectApplicationAction(applicationId, rejectionNote);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMode("rejected");
    });
  }

  if (mode === "approved" && result) {
    const expires = new Date(result.expiresAtISO);
    const hours = Math.max(
      1,
      Math.round((expires.getTime() - Date.now()) / (60 * 60 * 1000))
    );
    return (
      <div className="space-y-4 hairline p-6 bg-paper-light">
        <p className="eyebrow">Aplicación aprobada</p>
        <p className="text-navy">
          Le enviamos a <span className="font-mono">{result.email}</span> un email con un link
          de un solo uso para que establezca su propia contraseña.
        </p>
        <p className="eyebrow">
          El link expira en {hours} horas. Si el usuario no lo recibe, podés reenviarlo desde el
          panel de usuarios.
        </p>
        <Link
          href={"/admin/applications" as Route}
          className="eyebrow !text-gold hover:!text-navy inline-block"
        >
          Volver a aplicaciones →
        </Link>
      </div>
    );
  }

  if (mode === "rejected") {
    return (
      <div className="space-y-4 hairline p-6 bg-paper-light">
        <p className="eyebrow">Aplicación rechazada</p>
        <p className="text-navy">
          El aplicante recibió un email con la nota que escribiste. La aplicación queda archivada.
        </p>
        <Link
          href={"/admin/applications" as Route}
          className="eyebrow !text-gold hover:!text-navy inline-block"
        >
          Volver a aplicaciones →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setMode("approving")} className="btn-primary" disabled={isPending}>
            Aprobar
          </button>
          <button onClick={() => setMode("rejecting")} className="btn-outline" disabled={isPending}>
            Rechazar
          </button>
        </div>
      )}

      {mode === "approving" && (
        <div className="space-y-4 hairline p-6">
          <p className="eyebrow">— Rol asignado</p>
          <div className="flex flex-wrap gap-3">
            {(["PARTNER", "PROJECT_OWNER", "CO_ADMIN"] as const).map((r) => (
              <label
                key={r}
                className={`hairline px-4 py-2 cursor-pointer ${approvedRole === r ? "bg-navy text-paper" : ""}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={approvedRole === r}
                  onChange={() => setApprovedRole(r)}
                  className="sr-only"
                />
                <span className="eyebrow">{ROLE_LABEL[r]}</span>
              </label>
            ))}
          </div>
          <p className="eyebrow">
            Al confirmar, le enviaremos al aplicante un email con un link de un solo uso para que
            establezca su propia contraseña. Vos no vas a ver esa contraseña.
          </p>
          <div className="flex gap-3">
            <button onClick={approve} disabled={isPending} className="btn-primary">
              {isPending ? "Aprobando…" : "Confirmar aprobación"}
            </button>
            <button onClick={() => setMode("idle")} disabled={isPending} className="btn-outline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === "rejecting" && (
        <div className="space-y-4 hairline p-6">
          <p className="eyebrow">— Nota de rechazo (mínimo 10 caracteres)</p>
          <textarea
            rows={4}
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy"
          />
          <div className="flex gap-3">
            <button onClick={reject} disabled={isPending} className="btn-primary">
              {isPending ? "Rechazando…" : "Confirmar rechazo"}
            </button>
            <button onClick={() => setMode("idle")} disabled={isPending} className="btn-outline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

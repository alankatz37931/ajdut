"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { Dict } from "@/lib/i18n";
import {
  approveApplicationAction,
  rejectApplicationAction,
  type ApproveResult,
} from "./actions";
import { FloatingTextarea } from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type ReviewDict = Dict["adminApplications"]["review"];
type Role = "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN";

type Mode = "idle" | "approving" | "rejecting" | "approved" | "rejected";

export function ApplicationReviewActions({
  applicationId,
  defaultRole = "PARTNER",
  dict,
}: {
  applicationId: string;
  /**
   * Rol pre-seleccionado en el radio al abrir el formulario de aprobación.
   * Lo decide el caller en función del tipo de aplicación:
   *   - COMPANY → PROJECT_OWNER (responsable de un proyecto)
   *   - PERSON  → PARTNER (miembro de la comunidad)
   * El admin puede cambiarlo manualmente antes de confirmar.
   */
  defaultRole?: Role;
  dict: ReviewDict;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [approvedRole, setApprovedRole] = useState<Role>(defaultRole);
  const [rejectionNote, setRejectionNote] = useState("");
  const [result, setResult] = useState<ApproveResult | null>(null);
  // Validación local del rejectionNote (min 10 chars).
  const [validationError, setValidationError] = useState<string | null>(null);

  // El action retorna `{ ok: true; data: ApproveResult }` — el hook expone el
  // objeto completo al `onSuccess`, así que destructuramos `data`.
  const approveFn = useCallback(
    (role: Role) => approveApplicationAction(applicationId, role),
    [applicationId]
  );
  const {
    run: runApprove,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useSafeAction<Role, { ok: true; data: ApproveResult }>(approveFn, {
    onSuccess: ({ data }) => {
      setResult(data);
      setMode("approved");
    },
  });

  const rejectFn = useCallback(
    (note: string) => rejectApplicationAction(applicationId, note),
    [applicationId]
  );
  const {
    run: runReject,
    isPending: isRejectPending,
    error: rejectError,
    reset: resetReject,
  } = useSafeAction<string>(rejectFn, {
    onSuccess: () => setMode("rejected"),
  });

  const isPending = isApprovePending || isRejectPending;
  const error = validationError ?? approveError ?? rejectError;

  function approve() {
    resetApprove();
    setValidationError(null);
    runApprove(approvedRole);
  }

  function reject() {
    resetReject();
    setValidationError(null);
    if (rejectionNote.trim().length < 10) {
      setValidationError(dict.noteTooShort);
      return;
    }
    runReject(rejectionNote);
  }

  if (mode === "approved" && result) {
    const expires = new Date(result.expiresAtISO);
    const hours = Math.max(
      1,
      Math.round((expires.getTime() - Date.now()) / (60 * 60 * 1000))
    );
    return (
      <div className="space-y-4 hairline p-6 bg-paper-light">
        <p className="eyebrow">{dict.approvedTitle}</p>
        <p className="text-navy">
          {dict.approvedBodyFmt.split("{email}").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className="font-mono">{result.email}</span>
              )}
            </span>
          ))}
        </p>
        <p className="eyebrow">
          {dict.approvedExpiresFmt.replace("{hours}", String(hours))}
        </p>
        <Link
          href={"/admin/applications" as Route}
          className="eyebrow !text-gold hover:!text-navy inline-block"
        >
          {dict.backLink}
        </Link>
      </div>
    );
  }

  if (mode === "rejected") {
    return (
      <div className="space-y-4 hairline p-6 bg-paper-light">
        <p className="eyebrow">{dict.rejectedTitle}</p>
        <p className="text-navy">{dict.rejectedBody}</p>
        <Link
          href={"/admin/applications" as Route}
          className="eyebrow !text-gold hover:!text-navy inline-block"
        >
          {dict.backLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setMode("approving")} className="btn-primary" disabled={isPending}>
            {dict.approveBtn}
          </button>
          <button onClick={() => setMode("rejecting")} className="btn-outline" disabled={isPending}>
            {dict.rejectBtn}
          </button>
        </div>
      )}

      {mode === "approving" && (
        <div className="space-y-4 hairline p-6">
          <p className="eyebrow">{dict.roleEyebrow}</p>
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
                <span className="eyebrow">{dict.roleLabels[r] ?? r}</span>
              </label>
            ))}
          </div>
          <p className="eyebrow">{dict.approveDisclaimer}</p>
          <div className="flex gap-3">
            <button onClick={approve} disabled={isPending} className="btn-primary">
              {isPending ? dict.approvingBtn : dict.confirmApproveBtn}
            </button>
            <button onClick={() => setMode("idle")} disabled={isPending} className="btn-outline">
              {dict.cancelBtn}
            </button>
          </div>
        </div>
      )}

      {mode === "rejecting" && (
        <div className="space-y-4 hairline p-6">
          <FloatingTextarea
            id="rejectionNote"
            label={dict.noteLabel}
            value={rejectionNote}
            onChange={setRejectionNote}
            rows={4}
            maxLength={1000}
            counterSuffix=""
          />
          <div className="flex gap-3">
            <button onClick={reject} disabled={isPending} className="btn-primary">
              {isPending ? dict.rejectingBtn : dict.confirmRejectBtn}
            </button>
            <button onClick={() => setMode("idle")} disabled={isPending} className="btn-outline">
              {dict.cancelBtn}
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

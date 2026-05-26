"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
import {
  approvePendingAssignmentAction,
  rejectPendingAssignmentAction,
} from "./actions";
import { FloatingTextarea } from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type ActionsDict = Dict["adminAsignaciones"]["actions"];

type Props = {
  pendingId: string;
  recipientLabel: string;
  shareCount: number;
  dict: ActionsDict;
  locale: string;
};

type Mode =
  | "idle"
  | "confirming-approve"
  | "rejecting"
  | "done-approved"
  | "done-rejected";

export function PendingAssignmentActions({
  pendingId,
  recipientLabel,
  shareCount,
  dict,
  locale,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  // Errores de validación local (sin viaje al server) — el hook solo gestiona
  // errores de las server actions; el chequeo del note <10 chars vive acá.
  const [validationError, setValidationError] = useState<string | null>(null);

  const approveFn = useCallback(
    () => approvePendingAssignmentAction(pendingId),
    [pendingId]
  );
  const {
    run: runApprove,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useSafeAction<void>(approveFn, {
    onSuccess: () => setMode("done-approved"),
  });

  const rejectFn = useCallback(
    (n: string) => rejectPendingAssignmentAction(pendingId, n),
    [pendingId]
  );
  const {
    run: runReject,
    isPending: isRejectPending,
    error: rejectError,
    reset: resetReject,
  } = useSafeAction<string>(rejectFn, {
    onSuccess: () => setMode("done-rejected"),
  });

  const isPending = isApprovePending || isRejectPending;
  // Mostramos el error que corresponda al modo activo: validación local
  // (sólo en rejecting) o el del último intento contra el server.
  const error = validationError ?? approveError ?? rejectError;

  function approve() {
    resetApprove();
    setValidationError(null);
    runApprove();
  }

  function reject() {
    resetReject();
    setValidationError(null);
    if (note.trim().length < 10) {
      setValidationError(dict.noteTooShort);
      return;
    }
    runReject(note);
  }

  if (mode === "done-approved") {
    return (
      <p className="eyebrow !text-gold" role="status">
        {dict.doneApproved}
      </p>
    );
  }
  if (mode === "done-rejected") {
    return (
      <p className="eyebrow !text-navy/60" role="status">
        {dict.doneRejected}
      </p>
    );
  }

  if (mode === "confirming-approve") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">{dict.confirmTitle}</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {dict.confirmDescription
            .replace("{shares}", shareCount.toLocaleString(locale))
            .replace("{recipient}", recipientLabel)}
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
            {isPending ? dict.approvingBtn : dict.confirmApproveBtn}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              resetApprove();
              setValidationError(null);
            }}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            {dict.cancelBtn}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "rejecting") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <FloatingTextarea
          id="note"
          label={dict.noteLabel}
          value={note}
          onChange={setNote}
          rows={4}
          maxLength={1000}
          counterSuffix=""
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
            {isPending ? dict.rejectingBtn : dict.confirmRejectBtn}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              resetReject();
              setValidationError(null);
            }}
            disabled={isPending}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            {dict.cancelBtn}
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
        {dict.approveBtn}
      </button>
      <button
        onClick={() => setMode("rejecting")}
        disabled={isPending}
        className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
      >
        {dict.rejectBtn}
      </button>
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

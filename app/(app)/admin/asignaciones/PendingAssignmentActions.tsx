"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
import {
  approvePendingAssignmentAction,
  rejectPendingAssignmentAction,
  resendTargetConfirmationAction,
} from "./actions";
import { FloatingTextarea } from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type ActionsDict = Dict["adminAsignaciones"]["actions"];

/**
 * Sub-dict de copy para los controles de validación bilateral. Se pasa como
 * prop separado (no anidamos en `ActionsDict` para no romper consumidores
 * existentes ni los renames en curso de "acciones" → "participaciones").
 */
type BilateralDict = {
  resendBtn: string;
  resendingBtn: string;
  resendDoneFmt: string;
  bothPartiesPendingTooltip: string;
  targetPendingTooltip: string;
  overrideBtn: string;
  overrideTitle: string;
  overrideDescription: string;
  overrideNoteLabel: string;
  overrideConfirmBtn: string;
};

type Props = {
  pendingId: string;
  recipientLabel: string;
  shareCount: number;
  dict: ActionsDict;
  bilateralDict: BilateralDict;
  locale: string;
  targetEmail: string;
  proposerAccepted: boolean;
  targetAccepted: boolean;
};

type Mode =
  | "idle"
  | "confirming-approve"
  | "rejecting"
  | "overriding"
  | "done-approved"
  | "done-rejected"
  | "done-resend";

export function PendingAssignmentActions({
  pendingId,
  recipientLabel,
  shareCount,
  dict,
  bilateralDict,
  locale,
  targetEmail,
  proposerAccepted,
  targetAccepted,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  // Errores de validación local (sin viaje al server) — el hook solo gestiona
  // errores de las server actions; el chequeo del note <10 chars vive acá.
  const [validationError, setValidationError] = useState<string | null>(null);

  const bothAccepted = proposerAccepted && targetAccepted;

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

  const overrideFn = useCallback(
    (n: string) =>
      approvePendingAssignmentAction(pendingId, {
        override: true,
        overrideNote: n,
      }),
    [pendingId]
  );
  const {
    run: runOverride,
    isPending: isOverridePending,
    error: overrideError,
    reset: resetOverride,
  } = useSafeAction<string>(overrideFn, {
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

  const resendFn = useCallback(
    () => resendTargetConfirmationAction(pendingId),
    [pendingId]
  );
  const {
    run: runResend,
    isPending: isResendPending,
    error: resendError,
    reset: resetResend,
  } = useSafeAction<void>(resendFn, {
    onSuccess: () => setMode("done-resend"),
  });

  const isPending =
    isApprovePending || isRejectPending || isOverridePending || isResendPending;
  // Mostramos el error que corresponda al modo activo: validación local
  // (sólo en rejecting/overriding) o el del último intento contra el server.
  const error =
    validationError ??
    approveError ??
    rejectError ??
    overrideError ??
    resendError;

  function approve() {
    resetApprove();
    setValidationError(null);
    runApprove();
  }

  function override() {
    resetOverride();
    setValidationError(null);
    if (overrideNote.trim().length < 10) {
      setValidationError(dict.noteTooShort);
      return;
    }
    runOverride(overrideNote);
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

  function resend() {
    resetResend();
    setValidationError(null);
    runResend();
  }

  // Locale-aware (no-op por ahora, sirve para evitar el lint "unused")
  void locale;

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
  if (mode === "done-resend") {
    return (
      <p className="eyebrow !text-navy/60" role="status">
        {bilateralDict.resendDoneFmt.replace("{email}", targetEmail)}
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

  if (mode === "overriding") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">{bilateralDict.overrideTitle}</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {bilateralDict.overrideDescription}
        </p>
        <FloatingTextarea
          id="overrideNote"
          label={bilateralDict.overrideNoteLabel}
          value={overrideNote}
          onChange={setOverrideNote}
          rows={3}
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
            onClick={override}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.approvingBtn : bilateralDict.overrideConfirmBtn}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              resetOverride();
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

  // idle: el botón "Aprobar" se deshabilita si falta alguna confirmación.
  // Si falta sólo el target, ofrecemos "Re-enviar mail" y "Override bilateral".
  const approveDisabled = isPending || !bothAccepted;
  const approveTooltip = !bothAccepted
    ? !targetAccepted && proposerAccepted
      ? bilateralDict.targetPendingTooltip
      : bilateralDict.bothPartiesPendingTooltip
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        onClick={() => setMode("confirming-approve")}
        disabled={approveDisabled}
        title={approveTooltip}
        className="btn-primary disabled:opacity-50"
      >
        {dict.approveBtn}
      </button>
      {!targetAccepted && (
        <button
          onClick={resend}
          disabled={isPending}
          className="eyebrow hover:!text-gold !text-navy/60 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          {isResendPending ? bilateralDict.resendingBtn : bilateralDict.resendBtn}
        </button>
      )}
      {!bothAccepted && (
        <button
          onClick={() => setMode("overriding")}
          disabled={isPending}
          className="eyebrow hover:!text-gold !text-navy/60 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          {bilateralDict.overrideBtn}
        </button>
      )}
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

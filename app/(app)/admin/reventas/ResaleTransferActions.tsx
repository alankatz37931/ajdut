"use client";

import { useCallback, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { FloatingTextarea } from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import {
  approveTransferAction,
  rejectTransferAction,
  overrideTransferAction,
} from "./actions";

type ActionsDict = Dict["adminReventas"]["actions"];
type TripartiteDict = Dict["adminReventas"]["tripartite"];

type Props = {
  resaleListingId: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
  buyerConfirmed: boolean;
  ownerConfirmed: boolean;
  dict: ActionsDict;
  tripartiteDict: TripartiteDict;
};

type Mode =
  | "idle"
  | "confirming-approve"
  | "rejecting"
  | "overriding"
  | "done-approved"
  | "done-rejected";

export function ResaleTransferActions({
  resaleListingId,
  sellerName,
  buyerName,
  shareCount,
  buyerConfirmed,
  ownerConfirmed,
  dict,
  tripartiteDict,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  // Validación local del note (mínimo 10 chars) — no la maneja el hook
  // porque no involucra un viaje al server.
  const [validationError, setValidationError] = useState<string | null>(null);

  // Gate tripartito: el botón de aprobar sólo se habilita cuando comprador y
  // founder confirmaron. Si falta alguno, el admin puede usar Override.
  const bothConfirmed = buyerConfirmed && ownerConfirmed;

  const approveFn = useCallback(
    () => approveTransferAction(resaleListingId),
    [resaleListingId]
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
    (n: string) => rejectTransferAction(resaleListingId, n),
    [resaleListingId]
  );
  const {
    run: runReject,
    isPending: isRejectPending,
    error: rejectError,
    reset: resetReject,
  } = useSafeAction<string>(rejectFn, {
    onSuccess: () => setMode("done-rejected"),
  });

  const overrideFn = useCallback(
    (n: string) => overrideTransferAction(resaleListingId, n),
    [resaleListingId]
  );
  const {
    run: runOverride,
    isPending: isOverridePending,
    error: overrideError,
    reset: resetOverride,
  } = useSafeAction<string>(overrideFn, {
    onSuccess: () => setMode("done-approved"),
  });

  const isPending = isApprovePending || isRejectPending || isOverridePending;
  const error = validationError ?? approveError ?? rejectError ?? overrideError;

  function approve() {
    resetApprove();
    setValidationError(null);
    runApprove();
  }

  function reject() {
    resetReject();
    setValidationError(null);
    if (note.trim().length < 10) {
      setValidationError(dict.errNoteTooShort);
      return;
    }
    runReject(note);
  }

  function override() {
    resetOverride();
    setValidationError(null);
    if (overrideNote.trim().length < 10) {
      setValidationError(dict.errNoteTooShort);
      return;
    }
    runOverride(overrideNote);
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
            .replace("{shares}", shareCount.toLocaleString("es-MX"))
            .replace("{seller}", sellerName)
            .replace("{buyer}", buyerName)}
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
            {isPending ? dict.approving : dict.confirmApprove}
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
          id={`reject-${resaleListingId}`}
          label={dict.rejectNoteLabel}
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
            {isPending ? dict.rejecting : dict.confirmReject}
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

  if (mode === "overriding") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">{tripartiteDict.overrideTitle}</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {tripartiteDict.overrideDescription}
        </p>
        <FloatingTextarea
          id={`override-${resaleListingId}`}
          label={tripartiteDict.overrideNoteLabel}
          value={overrideNote}
          onChange={setOverrideNote}
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
            onClick={override}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.approving : tripartiteDict.overrideConfirmBtn}
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => setMode("confirming-approve")}
          disabled={isPending || !bothConfirmed}
          className="btn-primary disabled:opacity-50"
          title={!bothConfirmed ? tripartiteDict.approveGatedTooltip : undefined}
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
        {!bothConfirmed && (
          <button
            onClick={() => setMode("overriding")}
            disabled={isPending}
            className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          >
            {tripartiteDict.overrideBtn}
          </button>
        )}
        {error && (
          <span className="eyebrow !text-navy" role="alert">
            {error}
          </span>
        )}
      </div>
      {!bothConfirmed && (
        <p className="eyebrow !text-navy/40">
          {tripartiteDict.approveGatedHint}
        </p>
      )}
    </div>
  );
}

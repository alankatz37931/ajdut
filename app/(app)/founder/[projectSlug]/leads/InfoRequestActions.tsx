"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import {
  approveInfoRequestAction,
  rejectInfoRequestAction,
} from "./actions";

type InfoActionsDict = Dict["founderLeads"]["infoActions"];
type Mode = "idle" | "approving" | "rejecting";

export function InfoRequestActions({
  infoRequestId,
  dict,
}: {
  infoRequestId: string;
  dict: InfoActionsDict;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveInfoRequestAction(infoRequestId, note.trim());
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectInfoRequestAction(infoRequestId, note.trim());
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  if (mode === "approving" || mode === "rejecting") {
    const isApprove = mode === "approving";
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">
          {isApprove ? dict.approveTitle : dict.rejectTitle}
        </p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {isApprove ? dict.approveDesc : dict.rejectDesc}
        </p>
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={dict.notePlaceholder}
          className="w-full resize-none border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={isApprove ? approve : reject}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending
              ? isApprove
                ? dict.approvingBtn
                : dict.rejectingBtn
              : isApprove
              ? dict.confirmApproveBtn
              : dict.confirmRejectBtn}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              setNote("");
              setError(null);
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
        onClick={() => setMode("approving")}
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

"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { FloatingTextarea } from "@/components/ui/Floating";
import { approveTransferAction, rejectTransferAction } from "./actions";

type ActionsDict = Dict["adminReventas"]["actions"];

type Props = {
  resaleListingId: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
  dict: ActionsDict;
};

export function ResaleTransferActions({
  resaleListingId,
  sellerName,
  buyerName,
  shareCount,
  dict,
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
      setError(dict.errNoteTooShort);
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
            onClick={() => setMode("idle")}
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

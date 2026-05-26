"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";
import { approveProjectAction, rejectProjectAction } from "./admin-actions";

type AdminDict = Dict["adminApproval"];

export function AdminApprovalActions({
  projectSlug,
  dict,
}: {
  projectSlug: string;
  dict: AdminDict;
}) {
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
      setError(dict.errReasonTooShort);
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
        <p className="eyebrow !text-gold">{dict.confirmApproveTitle}</p>
        <p className="text-navy/85 leading-relaxed">{dict.confirmApproveBody}</p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={approve} disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? dict.approvingBtn : dict.confirmApproveBtn}
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
      <div className="hairline p-6 bg-paper-light space-y-4">
        <p className="eyebrow">{dict.rejectTitle}</p>
        <p className="text-navy/75 leading-relaxed">{dict.rejectBody}</p>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={dict.rejectPlaceholder}
          className="w-full hairline bg-paper px-3 py-2 font-sans text-navy focus:outline-none focus:border-navy"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={reject} disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? dict.rejectingBtn : dict.confirmRejectBtn}
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

  return (
    <div className="hairline p-6 bg-paper-light space-y-4">
      <p className="eyebrow">{dict.moderationEyebrow}</p>
      <p className="text-navy/75 leading-relaxed">{dict.moderationBody}</p>
      <div className="flex flex-wrap gap-3">
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
          className="btn-outline disabled:opacity-50"
        >
          {dict.rejectBtn}
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

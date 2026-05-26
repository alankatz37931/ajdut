"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import {
  markLeadContactedAction,
  markLeadInterviewingAction,
  dismissLeadAction,
  acceptLeadAndAssignAction,
  requestMoreInfoAction,
} from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

type ActionsDict = Dict["founderLeads"]["actions"];

type Props = {
  leadId: string;
  status: string;
  shareCountRequested: number;
  investorName: string;
  dict: ActionsDict;
  locale: string;
};

type Mode = "idle" | "confirming-accept" | "asking-more-info";

export function LeadActions({
  leadId,
  status,
  shareCountRequested,
  investorName,
  dict,
  locale,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [question, setQuestion] = useState("");
  const [isPending, startTransition] = useTransition();

  function markContacted() {
    setError(null);
    startTransition(async () => {
      const r = await markLeadContactedAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function markInterviewing() {
    setError(null);
    startTransition(async () => {
      const r = await markLeadInterviewingAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const r = await dismissLeadAction(leadId);
      if (!r.ok) setError(r.error);
    });
  }

  function acceptAndAssign() {
    setError(null);
    startTransition(async () => {
      const r = await acceptLeadAndAssignAction(leadId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function sendMoreInfoRequest() {
    setError(null);
    startTransition(async () => {
      const r = await requestMoreInfoAction(leadId, question);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setQuestion("");
      setMode("idle");
    });
  }

  if (mode === "confirming-accept") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">{dict.proposeTitle}</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {dict.proposeDescFmt
            .split(/(\{n\}|\{name\})/)
            .map((part, i) => {
              if (part === "{n}")
                return (
                  <span key={i} className="font-mono text-navy">
                    {shareCountRequested.toLocaleString(locale)}
                  </span>
                );
              if (part === "{name}")
                return (
                  <span key={i} className="text-navy">
                    {investorName}
                  </span>
                );
              return <span key={i}>{part}</span>;
            })}
        </p>
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={acceptAndAssign}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.proposeSubmittingBtn : dict.proposeSubmitBtn}
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

  if (mode === "asking-more-info") {
    return (
      <div className="hairline p-4 bg-paper-light space-y-3">
        <p className="eyebrow !text-gold">{dict.askMoreInfoTitle}</p>
        <p className="text-navy/85 text-sm leading-relaxed">
          {dict.askMoreInfoDescFmt.replace("{name}", investorName)}
        </p>
        <textarea
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={dict.askMoreInfoPlaceholder}
          maxLength={2000}
          className="w-full hairline bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={sendMoreInfoRequest}
            disabled={isPending || question.trim().length < 5}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.askMoreInfoSendingBtn : dict.askMoreInfoSendBtn}
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
        onClick={() => setMode("confirming-accept")}
        disabled={isPending}
        className="btn-primary disabled:opacity-50"
      >
        {dict.acceptBtn}
      </button>
      {(status === "OPEN" || status === "CONTACTED" || status === "INTERVIEWING") && (
        <button
          onClick={() => setMode("asking-more-info")}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          {dict.askMoreBtn}
        </button>
      )}
      {status === "OPEN" && (
        <button
          onClick={markContacted}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          {dict.markContactedBtn}
        </button>
      )}
      {(status === "OPEN" || status === "CONTACTED") && (
        <button
          onClick={markInterviewing}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
        >
          {dict.markInterviewingBtn}
        </button>
      )}
      <InlineConfirm
        label={dict.dismissBtn}
        question={dict.dismissConfirm}
        onConfirm={dismiss}
        disabled={isPending}
        className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
      />
      {error && (
        <span className="eyebrow !text-navy" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

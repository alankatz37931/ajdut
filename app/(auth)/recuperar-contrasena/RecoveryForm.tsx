"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { requestPasswordResetAction } from "./actions";
import { FloatingInput } from "@/components/ui/Floating";

type RecoveryDict = Dict["recoveryPassword"];

export function RecoveryForm({ dict }: { dict: RecoveryDict }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.append("email", email);
    startTransition(async () => {
      const r = await requestPasswordResetAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div>
        <p className="eyebrow">{dict.submittedEyebrow}</p>
        <p className="mt-3 font-sans text-h2 text-navy">{dict.submittedTitle}</p>
        <p className="mt-3 text-navy/75 leading-relaxed">
          {dict.submittedBody.split("{email}").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className="font-mono text-navy">{email}</span>
              )}
            </span>
          ))}
        </p>
        <p className="mt-3 eyebrow">{dict.submittedDisclaimer}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FloatingInput
        id="email"
        type="email"
        label={dict.emailLabel}
        value={email}
        onChange={setEmail}
        autoComplete="email"
        autoFocus
        required
      />

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full disabled:opacity-50"
      >
        {isPending ? dict.submittingBtn : dict.submitBtn}
      </button>
    </form>
  );
}

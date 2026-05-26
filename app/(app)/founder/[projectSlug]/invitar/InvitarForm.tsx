"use client";

import { useCallback, useRef, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { inviteMemberAction } from "./actions";
import { FloatingInput, FloatingTextarea } from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type InvitarDict = Dict["founderInvitar"];

type Props = {
  projectSlug: string;
  availableShares: number;
  dict: InvitarDict;
  locale: string;
};

type SuccessState = {
  pending: true;
  shareCount: number;
  email: string;
  fullName: string;
};

export function InvitarForm({
  projectSlug,
  availableShares,
  dict,
  locale,
}: Props) {
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [shareCount, setShareCount] = useState("");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const boundAction = useCallback(
    (fd: FormData) => inviteMemberAction(projectSlug, fd),
    [projectSlug]
  );
  const { run, isPending, error, reset } = useSafeAction<
    FormData,
    { ok: true; data: SuccessState }
  >(boundAction, {
    onSuccess: ({ data }) => {
      setSuccess(data);
      setEmail("");
      setFullName("");
      setShareCount("");
      setMessage("");
      formRef.current?.reset();
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    setSuccess(null);
    run(new FormData(e.currentTarget));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-6">
      <FloatingInput
        id="email"
        type="email"
        inputMode="email"
        label={dict.emailLabel}
        value={email}
        onChange={setEmail}
        required
      />

      <div>
        <FloatingInput
          id="fullName"
          label={dict.fullNameLabel}
          value={fullName}
          onChange={setFullName}
          maxLength={120}
          required
        />
        <p className="eyebrow !text-navy/50 mt-1.5">{dict.fullNameHelper}</p>
      </div>

      <div>
        <FloatingInput
          id="shareCount"
          type="number"
          label={dict.sharesLabel}
          value={shareCount}
          onChange={setShareCount}
          required
        />
        <p className="eyebrow !text-navy/50 mt-1.5">
          {dict.sharesAvailableFmt
            .split(/(\{n\})/)
            .map((part, i) =>
              part === "{n}" ? (
                <span key={i} className="font-mono text-navy">
                  {availableShares.toLocaleString(locale)}
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
        </p>
      </div>

      <FloatingTextarea
        id="message"
        label={dict.messageLabel}
        value={message}
        onChange={setMessage}
        rows={5}
        maxLength={1000}
      />

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
      {success && (
        <div className="hairline p-3 bg-paper-light" role="status">
          <p className="eyebrow !text-gold">{dict.successEyebrow}</p>
          <p className="mt-2 text-sm text-navy/75">
            {dict.successBodyFmt
              .split(/(\{n\}|\{name\}|\{email\})/)
              .map((part, i) => {
                if (part === "{n}")
                  return (
                    <span key={i} className="font-mono text-navy">
                      {success.shareCount.toLocaleString(locale)}
                    </span>
                  );
                if (part === "{name}")
                  return (
                    <span key={i} className="text-navy">
                      {success.fullName}
                    </span>
                  );
                if (part === "{email}")
                  return <span key={i}>{success.email}</span>;
                return <span key={i}>{part}</span>;
              })}
          </p>
        </div>
      )}

      {availableShares === 0 && (
        <p className="eyebrow !text-navy/60">{dict.emptyPool}</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending || availableShares === 0}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.sendingBtn : dict.sendBtn}
        </button>
        <span className="eyebrow !text-navy/40">{dict.disclaimer}</span>
      </div>
    </form>
  );
}

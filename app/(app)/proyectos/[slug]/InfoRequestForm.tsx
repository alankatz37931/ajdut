"use client";

import { useState, useTransition, useEffect } from "react";
import type { Dict } from "@/lib/i18n";
import { requestProjectInfoAction } from "./actions";

type Props = {
  projectSlug: string;
  projectName: string;
  viewerName: string;
  dict: Dict["infoRequestForm"];
};

/**
 * Mini-form para la etapa 1 ("Quiero más información"). Solo mensaje opcional.
 * Al enviar crea una InfoRequest PENDING. Se abre con el hash #info-request.
 */
export function InfoRequestForm({
  projectSlug,
  projectName,
  viewerName,
  dict,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#info-request") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  function close() {
    setOpen(false);
    if (window.location.hash === "#info-request") {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      window.dispatchEvent(new Event("hashchange"));
    }
  }

  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    formData.set("message", message);
    startTransition(async () => {
      const r = await requestProjectInfoAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="mt-10 hairline p-8 sm:p-10 bg-paper-light max-w-3xl">
        <p className="eyebrow">{dict.successEyebrow}</p>
        <p className="mt-5 font-sans text-h1 text-navy">{dict.successTitle}</p>
        <p className="mt-4 text-navy/75 leading-relaxed max-w-xl">
          {dict.successBody}
        </p>
      </div>
    );
  }

  if (!open) return null;

  return (
    <form
      action={submit}
      className="mt-10 hairline p-6 sm:p-10 bg-paper-light max-w-3xl"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">{dict.title}</p>
          <p className="mt-3 font-sans text-h2 text-navy">{projectName}</p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
        >
          {dict.backShort}
        </button>
      </div>

      <p className="mt-6 text-navy/75 leading-relaxed max-w-xl">
        {dict.explainBody}
      </p>

      <div className="mt-7 hairline-t pt-6">
        <label htmlFor="message" className="eyebrow block mb-2">
          {dict.messageLabel}{" "}
          <span className="!text-navy/40">{dict.messageOptional}</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`${dict.messagePlaceholderPrefix} ${viewerName.trim() || dict.yourNameFallback} ${dict.messagePlaceholderInfix} ${projectName} ${dict.messagePlaceholderSuffix}`}
          className="w-full resize-none border-hairline border-navy/40 bg-paper px-3 py-2.5 font-sans text-sm text-navy focus:outline-none focus:border-navy"
        />
        <span className="eyebrow mt-2 block !text-navy/40">
          {message.length} / 2000
        </span>
      </div>

      {error && (
        <p className="eyebrow !text-navy mt-5" role="alert">
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-5">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.sending : dict.send}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          {dict.cancel}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition, useEffect } from "react";
import type { Dict } from "@/lib/i18n";
import { requestProjectInfoAction } from "./actions";
import { FloatingTextarea } from "@/components/ui/Floating";

type Props = {
  projectSlug: string;
  projectName: string;
  viewerName: string;
  dict: Dict["infoRequestForm"];
};

/**
 * Form de la etapa 1 ("Quiero más información"). Solo mensaje opcional.
 * Al enviar crea una InfoRequest PENDING. Se abre con el hash #info-request.
 *
 * Layout de 2 columnas, ancho completo — formulario a la izquierda, panel
 * de contexto ("qué pasa al enviar") a la derecha. Mismo lenguaje editorial
 * que el InterestForm y el resto de la plataforma.
 */
export function InfoRequestForm({
  projectSlug,
  projectName,
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
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

  if (!open && !success) return null;

  if (success) {
    return (
      <div className="w-full pt-8 sm:pt-10 pb-12 max-w-3xl">
        <p className="eyebrow !text-navy/40">{dict.successEyebrow}</p>
        <h1 className="font-sans mt-3 text-h1 text-navy">{dict.successTitle}</h1>
        <p className="mt-4 text-navy/75 leading-relaxed">{dict.successBody}</p>
      </div>
    );
  }

  return (
    <div className="w-full pt-8 sm:pt-10 pb-12">
      {/* Header — eyebrow + nombre del proyecto como H1. Sin botón de
          volver: el form ya tiene "Cancelar". */}
      <div className="hairline-b pb-6 sm:pb-7">
        <p className="eyebrow !text-navy/40">{dict.title}</p>
        <h1 className="font-sans mt-3 text-h1 text-navy">{projectName}</h1>
      </div>

      {/* 2 columnas: formulario a la izquierda, panel de contexto sticky
          a la derecha — ocupa el ancho completo de la página. */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-x-10 xl:gap-x-14 gap-y-8">
        {/* ─── COLUMNA FORM ──────────────────────────────────────── */}
        <form onSubmit={submit} className="min-w-0 space-y-7">
          <FloatingTextarea
            id="message"
            label={dict.messageLabel}
            value={message}
            onChange={setMessage}
            rows={5}
            maxLength={2000}
            counterSuffix=""
          />

          {error && (
            <p className="eyebrow !text-navy" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-5 pt-1">
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

        {/* ─── PANEL DE CONTEXTO STICKY ──────────────────────────── */}
        <aside className="lg:sticky lg:top-6 lg:self-start lg:h-fit">
          <div className="hairline bg-paper p-5">
            <p className="eyebrow !text-navy/40">{dict.title}</p>
            <p className="mt-3 text-sm text-navy/75 leading-relaxed">
              {dict.explainBody}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

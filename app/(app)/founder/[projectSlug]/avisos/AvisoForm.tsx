"use client";

import { useRef, useState, useTransition } from "react";
import { sendBroadcastAction } from "./actions";

type Props = {
  projectSlug: string;
  memberCount: number;
};

export function AvisoForm({ projectSlug, memberCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await sendBroadcastAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-6">
      <div>
        <label htmlFor="subject" className="eyebrow block mb-1.5">
          Asunto
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          maxLength={160}
          required
          disabled={isPending}
          placeholder="Reporte trimestral disponible"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="body" className="eyebrow block mb-1.5">
          Mensaje
        </label>
        <textarea
          id="body"
          name="body"
          rows={8}
          maxLength={5000}
          required
          disabled={isPending}
          placeholder="Escribí el aviso que querés enviar a tus miembros…"
          className="w-full resize-y border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy leading-relaxed focus:outline-none focus:border-navy disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="eyebrow !text-gold" role="status">
          Aviso enviado a {memberCount} miembro{memberCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending
            ? "Enviando…"
            : `Enviar a ${memberCount} miembro${memberCount === 1 ? "" : "s"} →`}
        </button>
        <span className="eyebrow !text-navy/40">
          Se envía por email a todos los miembros del proyecto.
        </span>
      </div>
    </form>
  );
}

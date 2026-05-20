"use client";

import { useRef, useState, useTransition } from "react";
import { sendBroadcastAction } from "./actions";

type Member = { userId: string; label: string; email: string };

type Props = {
  projectSlug: string;
  memberCount: number;
  members: Member[];
};

type Mode = "ALL" | "ONE";

export function AvisoForm({ projectSlug, memberCount, members }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<Mode>("ALL");
  const [recipientUserId, setRecipientUserId] = useState<string>(
    members[0]?.userId ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    if (mode === "ONE") {
      if (!recipientUserId) {
        setError("Elegí un miembro destinatario.");
        return;
      }
      formData.set("recipientUserId", recipientUserId);
    } else {
      formData.delete("recipientUserId");
    }
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

  const selected =
    mode === "ONE" ? members.find((m) => m.userId === recipientUserId) ?? null : null;

  const buttonLabel =
    mode === "ONE"
      ? selected
        ? `Enviar a ${selected.label} →`
        : "Enviar →"
      : `Enviar a ${memberCount} miembro${memberCount === 1 ? "" : "s"} →`;

  const successLabel =
    mode === "ONE" && selected
      ? `Aviso enviado a ${selected.label}.`
      : `Aviso enviado a ${memberCount} miembro${memberCount === 1 ? "" : "s"}.`;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-6">
      {/* ─── Destinatarios ───────────────────────────────────────── */}
      <div className="space-y-3 hairline p-5 bg-paper">
        <p className="eyebrow !text-navy">Destinatarios</p>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recipientMode"
              value="ALL"
              checked={mode === "ALL"}
              onChange={() => setMode("ALL")}
              disabled={isPending}
              className="accent-navy"
            />
            <span className="font-sans text-sm text-navy">
              Todos los miembros ({memberCount})
            </span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recipientMode"
              value="ONE"
              checked={mode === "ONE"}
              onChange={() => setMode("ONE")}
              disabled={isPending}
              className="accent-navy"
            />
            <span className="font-sans text-sm text-navy">Un miembro específico</span>
          </label>
        </div>

        {mode === "ONE" && (
          <div className="mt-2">
            <label htmlFor="recipientUserId" className="eyebrow block mb-1.5">
              Miembro
            </label>
            <select
              id="recipientUserId"
              value={recipientUserId}
              onChange={(e) => setRecipientUserId(e.target.value)}
              disabled={isPending}
              className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
          placeholder="Escribí el aviso que querés enviar…"
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
          {successLabel}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? "Enviando…" : buttonLabel}
        </button>
        <span className="eyebrow !text-navy/40">
          {mode === "ONE"
            ? "Se envía solo al miembro seleccionado."
            : "Se envía por email a todos los miembros del proyecto."}
        </span>
      </div>
    </form>
  );
}

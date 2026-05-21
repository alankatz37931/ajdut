"use client";

import { useRef, useState, useTransition } from "react";
import { sendBroadcastAction } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!subject.trim() || !body.trim()) {
      setError("Completá el asunto y el mensaje del aviso.");
      return;
    }
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
      setSubject("");
      setBody("");
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
          <FloatingSelect
            id="recipientUserId"
            label="Miembro"
            value={recipientUserId}
            onChange={setRecipientUserId}
            disabled={isPending}
            options={members.map((m) => ({ value: m.userId, label: m.label }))}
          />
        )}
      </div>

      <FloatingInput
        id="subject"
        label="Asunto"
        value={subject}
        onChange={setSubject}
        maxLength={160}
      />

      <FloatingTextarea
        id="body"
        label="Mensaje"
        value={body}
        onChange={setBody}
        rows={8}
        maxLength={5000}
      />

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

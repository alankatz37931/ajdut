"use client";

import { useRef, useState, useTransition } from "react";
import { inviteMemberAction } from "./actions";
import { FloatingInput, FloatingTextarea } from "@/components/ui/Floating";

type Props = {
  projectSlug: string;
  availableShares: number;
};

type SuccessState = {
  pending: true;
  shareCount: number;
  email: string;
  fullName: string;
};

export function InvitarForm({ projectSlug, availableShares }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [shareCount, setShareCount] = useState("");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await inviteMemberAction(projectSlug, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r.data);
      setEmail("");
      setFullName("");
      setShareCount("");
      setMessage("");
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-6">
      <FloatingInput
        id="email"
        type="email"
        inputMode="email"
        label="Email del invitado"
        value={email}
        onChange={setEmail}
        required
      />

      <div>
        <FloatingInput
          id="fullName"
          label="Nombre completo"
          value={fullName}
          onChange={setFullName}
          maxLength={120}
          required
        />
        <p className="eyebrow !text-navy/50 mt-1.5">
          Se usa para crear la cuenta si el email no está registrado todavía.
        </p>
      </div>

      <div>
        <FloatingInput
          id="shareCount"
          type="number"
          label="Acciones a asignar"
          value={shareCount}
          onChange={setShareCount}
          required
        />
        <p className="eyebrow !text-navy/50 mt-1.5">
          Disponibles ahora:{" "}
          <span className="font-mono text-navy">
            {availableShares.toLocaleString("es-MX")}
          </span>
        </p>
      </div>

      <FloatingTextarea
        id="message"
        label="Mensaje (opcional)"
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
          <p className="eyebrow !text-gold">
            Invitación propuesta — esperando validación del admin
          </p>
          <p className="mt-2 text-sm text-navy/75">
            Propusiste asignar{" "}
            <span className="font-mono text-navy">
              {success.shareCount.toLocaleString("es-MX")}
            </span>{" "}
            acciones a <span className="text-navy">{success.fullName}</span> ({success.email}).
            El equipo de AJDUT recibió el aviso. Cuando lo aprueben, se va a crear
            la cuenta (si hace falta), se va a emitir el certificado y vamos a
            avisarle al invitado por email.
          </p>
        </div>
      )}

      {availableShares === 0 && (
        <p className="eyebrow !text-navy/60">
          No hay acciones disponibles en el pool. Para invitar nuevos miembros, primero
          recuperá acciones desde el pool del proyecto.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending || availableShares === 0}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Proponer al admin →"}
        </button>
        <span className="eyebrow !text-navy/40">
          La propuesta queda pendiente. Recién cuando el admin la valida se crea
          la cuenta, se asignan las acciones y se le avisa al invitado.
        </span>
      </div>
    </form>
  );
}

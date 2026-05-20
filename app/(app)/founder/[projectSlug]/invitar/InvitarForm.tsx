"use client";

import { useRef, useState, useTransition } from "react";
import { inviteMemberAction } from "./actions";

type Props = {
  projectSlug: string;
  availableShares: number;
};

type SuccessState = {
  wasNew: boolean;
  shareCount: number;
  email: string;
};

export function InvitarForm({ projectSlug, availableShares }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isPending, startTransition] = useTransition();
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
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10 space-y-6">
      <div>
        <label htmlFor="email" className="eyebrow block mb-1.5">
          Email del invitado
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          disabled={isPending}
          placeholder="socio@ejemplo.com"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="fullName" className="eyebrow block mb-1.5">
          Nombre completo
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          disabled={isPending}
          placeholder="María González"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
        <p className="mt-1.5 eyebrow !text-navy/50">
          Se usa para crear la cuenta si el email no está registrado todavía.
        </p>
      </div>

      <div>
        <label htmlFor="shareCount" className="eyebrow block mb-1.5">
          Acciones a asignar
        </label>
        <input
          id="shareCount"
          name="shareCount"
          type="number"
          required
          min={1}
          max={availableShares}
          step={1}
          disabled={isPending || availableShares === 0}
          placeholder="100"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
        <p className="mt-1.5 eyebrow !text-navy/50">
          Disponibles ahora:{" "}
          <span className="font-mono text-navy">
            {availableShares.toLocaleString("es-MX")}
          </span>
        </p>
      </div>

      <div>
        <label htmlFor="message" className="eyebrow block mb-1.5">
          Mensaje (opcional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          maxLength={1000}
          disabled={isPending}
          placeholder="Bienvenida/o al proyecto…"
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
          {success.wasNew
            ? `Invitación enviada a ${success.email} con ${success.shareCount.toLocaleString("es-MX")} acciones. Recibirá un link para establecer su contraseña.`
            : `Acciones asignadas: ${success.shareCount.toLocaleString("es-MX")} a ${success.email}. Le avisamos por email.`}
        </p>
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
          {isPending ? "Enviando…" : "Invitar y asignar →"}
        </button>
        <span className="eyebrow !text-navy/40">
          Crea/usa al usuario, asigna acciones del pool y envía el email en un solo paso.
        </span>
      </div>
    </form>
  );
}

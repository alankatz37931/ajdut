"use client";

import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "./actions";
import { FloatingInput } from "@/components/ui/Floating";

export function RecoveryForm() {
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
        <p className="eyebrow">Solicitud recibida</p>
        <p className="mt-3 font-sans text-h2 text-navy">Revisá tu email.</p>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Si <span className="font-mono text-navy">{email}</span> está registrado en AJDUT, te
          enviamos un link de un solo uso para restablecer tu contraseña. El link es válido por 1
          hora.
        </p>
        <p className="mt-3 eyebrow">
          Por seguridad no confirmamos si una dirección existe o no.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FloatingInput
        id="email"
        type="email"
        label="Email de tu cuenta"
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
        {isPending ? "Enviando…" : "Enviar link de recuperación"}
      </button>
    </form>
  );
}

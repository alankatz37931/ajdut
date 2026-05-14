"use client";

import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "./actions";

export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
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
    <form action={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="eyebrow block mb-2">
          Email de tu cuenta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy focus:outline-none focus:border-navy"
        />
      </div>

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

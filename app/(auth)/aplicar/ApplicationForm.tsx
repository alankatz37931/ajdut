"use client";

import { useState, useTransition } from "react";
import {
  requestEmailVerification,
  verifyAndSubmitApplication,
  type RequestCodeResult,
  type SubmitResult,
} from "./actions";

type Step = "identity" | "contact" | "motivation" | "review" | "verify" | "submitted";

const steps: Array<{ id: Step; label: string }> = [
  { id: "identity", label: "Identidad" },
  { id: "contact", label: "Contacto" },
  { id: "motivation", label: "Motivación" },
  { id: "review", label: "Revisión" },
  { id: "verify", label: "Verificación" },
];

type Draft = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  motivation: string;
  referredBy: string;
};

const emptyDraft: Draft = {
  fullName: "",
  email: "",
  phone: "",
  country: "",
  motivation: "",
  referredBy: "",
};

export function ApplicationForm() {
  const [step, setStep] = useState<Step>("identity");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === "identity")
      return draft.fullName.length >= 2 && draft.email.includes("@");
    return true;
  }

  const stepOrder: Step[] = [
    "identity",
    "contact",
    "motivation",
    "review",
    "verify",
    "submitted",
  ];

  /** Saltar a un paso ANTERIOR tocándolo en el indicador (no hacia adelante). */
  function goTo(target: Step) {
    const cur = stepOrder.indexOf(step);
    const tgt = stepOrder.indexOf(target);
    if (tgt < 0 || tgt >= cur) return;
    if (step === "verify") {
      setVerifiedEmail(null);
      setCode("");
      setCodeExpiresAt(null);
    }
    setError(null);
    setStep(target);
  }

  function next() {
    const order: Step[] = ["identity", "contact", "motivation", "review", "verify", "submitted"];
    const idx = order.indexOf(step);
    if (idx >= 0 && idx < order.length - 1) {
      const target = order[idx + 1];
      if (target) setStep(target);
    }
  }

  function back() {
    if (step === "verify") {
      // Volver desde verify desarma el código pendiente — pero no lo invalida en backend
      // (eso lo maneja la rotación cuando se vuelva a solicitar).
      setVerifiedEmail(null);
      setCode("");
      setCodeExpiresAt(null);
    }
    const order: Step[] = ["identity", "contact", "motivation", "review", "verify", "submitted"];
    const idx = order.indexOf(step);
    if (idx > 0) {
      const target = order[idx - 1];
      if (target) setStep(target);
    }
  }

  function requestCode() {
    setError(null);
    const formData = new FormData();
    Object.entries(draft).forEach(([k, v]) => formData.append(k, v));

    startTransition(async () => {
      const res: RequestCodeResult = await requestEmailVerification(formData);
      if (res.ok) {
        setVerifiedEmail(res.email);
        setCodeExpiresAt(res.expiresAt);
        setStep("verify");
      } else {
        setError(res.error);
      }
    });
  }

  function submitCode() {
    if (!verifiedEmail) return;
    setError(null);
    startTransition(async () => {
      const res = await verifyAndSubmitApplication(verifiedEmail, code);
      setSubmitResult(res);
      if (res.ok) {
        setStep("submitted");
      } else {
        setError(res.error);
      }
    });
  }

  function resendCode() {
    setError(null);
    setCode("");
    const formData = new FormData();
    Object.entries(draft).forEach(([k, v]) => formData.append(k, v));
    startTransition(async () => {
      const res = await requestEmailVerification(formData);
      if (res.ok) {
        setVerifiedEmail(res.email);
        setCodeExpiresAt(res.expiresAt);
      } else {
        setError(res.error);
      }
    });
  }

  if (step === "submitted" && submitResult?.ok) {
    return (
      <div className="space-y-4">
        <p className="eyebrow">— Aplicación registrada</p>
        <h2 className="font-sans text-h2 text-navy">Recibimos tu aplicación.</h2>
        <p className="text-navy/75 leading-relaxed">
          Tu solicitud queda en revisión manual. Te contactaremos al email proporcionado en cuanto
          el equipo complete la evaluación. No hay registro automático en AJDUT.
        </p>
        <p className="eyebrow">Referencia: {submitResult.applicationId}</p>
      </div>
    );
  }

  return (
    <div>
      <ol className="mb-5 flex w-full items-center gap-1.5">
        {steps.map((s, i) => {
          const isPast =
            stepOrder.indexOf(s.id) < stepOrder.indexOf(step);
          const isCurrent = step === s.id;
          const numCls = `font-mono text-xs shrink-0 ${
            isCurrent ? "text-gold" : "text-navy/40"
          }`;
          const lblCls = `eyebrow tracking-wide shrink-0 ${
            isCurrent ? "!text-navy" : "!text-navy/40"
          }`;
          const inner = (
            <>
              <span className={numCls}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`${lblCls} hidden sm:inline`}>{s.label}</span>
              {isCurrent && (
                <span className={`${lblCls} sm:hidden`}>{s.label}</span>
              )}
            </>
          );
          return (
            <li
              key={s.id}
              className={`flex items-center gap-2 whitespace-nowrap ${
                i < steps.length - 1 ? "flex-1" : "shrink-0"
              }`}
            >
              {isPast ? (
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                  aria-label={`Volver a ${s.label}`}
                >
                  {inner}
                </button>
              ) : (
                <span className="flex items-center gap-2">{inner}</span>
              )}
              {i < steps.length - 1 && (
                <span className="ml-2 h-px flex-1 bg-line" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <div className="space-y-3">
        {step === "identity" && (
          <>
            <Field label="Nombre completo" htmlFor="fullName">
              <input
                id="fullName"
                type="text"
                value={draft.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                className="input"
                autoFocus
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                value={draft.email}
                onChange={(e) => update("email", e.target.value)}
                className="input"
              />
            </Field>
          </>
        )}

        {step === "contact" && (
          <>
            <Field label="Teléfono" htmlFor="phone">
              <input
                id="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="input"
                autoFocus
              />
            </Field>
            <Field label="País de residencia" htmlFor="country">
              <input
                id="country"
                type="text"
                value={draft.country}
                onChange={(e) => update("country", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="¿Alguien te recomendó? (opcional)" htmlFor="referredBy">
              <input
                id="referredBy"
                type="text"
                value={draft.referredBy}
                onChange={(e) => update("referredBy", e.target.value)}
                className="input"
              />
            </Field>
          </>
        )}

        {step === "motivation" && (
          <Field label="Motivación" htmlFor="motivation">
            <textarea
              id="motivation"
              rows={5}
              value={draft.motivation}
              onChange={(e) => update("motivation", e.target.value)}
              className="input"
              autoFocus
              placeholder="Cuéntanos qué buscas en AJDUT y qué proyectos te interesan."
            />
            <span className="eyebrow mt-2 block">
              {draft.motivation.length} / 2000 caracteres
            </span>
          </Field>
        )}

        {step === "review" && (
          <div className="space-y-3 text-navy/85">
            <Row label="Nombre" value={draft.fullName} />
            <Row label="Email" value={draft.email} />
            {draft.phone.trim() && <Row label="Teléfono" value={draft.phone} />}
            {draft.country.trim() && <Row label="País" value={draft.country} />}
            {draft.referredBy.trim() && (
              <Row label="Referido por" value={draft.referredBy} />
            )}
            {draft.motivation.trim() && (
              <Row label="Motivación" value={draft.motivation} multiline />
            )}

            <p className="mt-6 eyebrow">
              Al continuar, te vamos a enviar un código de verificación al email de arriba para
              confirmar que es tuyo.
            </p>
          </div>
        )}

        {step === "verify" && verifiedEmail && (
          <div className="space-y-5">
            <p className="eyebrow">— Verificación de email</p>
            <h2 className="font-sans text-h2 text-navy">Revisá tu casilla.</h2>
            <p className="text-navy/75 leading-relaxed">
              Te enviamos un código de 6 dígitos a{" "}
              <span className="font-mono text-navy">{verifiedEmail}</span>. Ingresalo abajo para
              completar la aplicación.
            </p>
            {codeExpiresAt && (
              <p className="eyebrow">
                Válido hasta{" "}
                {new Date(codeExpiresAt).toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}

            <Field label="Código de 6 dígitos" htmlFor="code">
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input font-mono text-center text-lg tracking-[0.4em]"
                autoFocus
                autoComplete="one-time-code"
              />
            </Field>

            <button
              type="button"
              onClick={resendCode}
              disabled={isPending}
              className="eyebrow hover:!text-gold"
            >
              ¿No te llegó? Reenviar código →
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="eyebrow mt-6 !text-navy" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        {step !== "identity" ? (
          <button type="button" onClick={back} className="eyebrow hover:!text-gold">
            ← Atrás
          </button>
        ) : (
          <span aria-hidden />
        )}

        {step === "review" ? (
          <button
            type="button"
            onClick={requestCode}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Enviando código…" : "Enviar código de verificación →"}
          </button>
        ) : step === "verify" ? (
          <button
            type="button"
            onClick={submitCode}
            disabled={isPending || code.length !== 6}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? "Verificando…" : "Verificar y enviar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance()}
            className="btn-primary disabled:opacity-50"
          >
            Continuar →
          </button>
        )}
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 0.5px solid rgba(26, 26, 46, 0.4);
          background: #f5f3ee;
          padding: 0.4rem 0.7rem;
          font-family: var(--font-inter);
          color: #1a1a2e;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #1a1a2e;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 hairline-b py-3 sm:items-baseline">
      <span className="eyebrow">{label}</span>
      <span
        className={`sm:col-span-2 min-w-0 break-words [overflow-wrap:anywhere] ${
          multiline ? "whitespace-pre-line" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

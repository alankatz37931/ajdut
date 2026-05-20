"use client";

import { useState, useTransition } from "react";
import {
  requestEmailVerification,
  verifyAndSubmitApplication,
  type RequestCodeResult,
  type SubmitResult,
} from "./actions";

type Kind = "PERSON" | "COMPANY";
type CompanyKind = "REAL_ESTATE" | "MERCHANDISE" | "STARTUP";

type Step =
  | "kind"
  | "identity"
  | "contact"
  | "company"
  | "motivation"
  | "review"
  | "verify"
  | "submitted";

const BASE_STEPS: Array<{ id: Step; label: string }> = [
  { id: "kind", label: "Tipo" },
  { id: "identity", label: "Identidad" },
  { id: "contact", label: "Contacto" },
  { id: "motivation", label: "Motivación" },
  { id: "review", label: "Revisión" },
  { id: "verify", label: "Verificación" },
];

/** Inserta el paso "Empresa" después de "Contacto" cuando el aplicante es COMPANY. */
function stepsFor(kind: Kind): Array<{ id: Step; label: string }> {
  if (kind === "PERSON") return BASE_STEPS;
  const out: Array<{ id: Step; label: string }> = [];
  for (const s of BASE_STEPS) {
    out.push(s);
    if (s.id === "contact") out.push({ id: "company", label: "Empresa" });
  }
  return out;
}

type Draft = {
  kind: Kind;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  motivation: string; // Texto libre (detalles adicionales, opcional)
  motivationOption: string; // Label del select elegido
  referredBy: string;
  // Solo COMPANY
  companyName: string;
  companyDescription: string;
  companyKind: CompanyKind;
};

const MOTIVATION_OPTIONS: string[] = [
  "Busco diversificar mi portafolio con proyectos reales",
  "Me interesa apoyar emprendimientos de mi región",
  "Tengo experiencia en startups / inmobiliario y quiero participar",
  "Vengo recomendado por un miembro actual",
  "Conocí AJDUT por redes / medios",
  "Otro (especificar abajo)",
];

const COMPANY_KIND_LABEL: Record<CompanyKind, string> = {
  REAL_ESTATE: "Inmobiliario",
  MERCHANDISE: "Mercancía",
  STARTUP: "Otro",
};

const emptyDraft: Draft = {
  kind: "PERSON",
  fullName: "",
  email: "",
  phone: "",
  country: "",
  motivation: "",
  motivationOption: MOTIVATION_OPTIONS[0]!,
  referredBy: "",
  companyName: "",
  companyDescription: "",
  companyKind: "STARTUP",
};

/**
 * Compone el string que se persiste como `motivation` en la Application:
 * label del select + (si hay) "\n\n" + texto libre. El backend valida
 * max(2000), sin mínimo.
 */
function composeMotivation(opt: string, freeText: string): string {
  const trimmed = freeText.trim();
  if (trimmed.length === 0) return opt;
  return `${opt}\n\n${trimmed}`;
}

export function ApplicationForm() {
  const [step, setStep] = useState<Step>("kind");
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

  const steps = stepsFor(draft.kind);
  // stepOrder incluye "submitted" al final para que next() pueda avanzar al
  // estado terminal sin caer fuera del array.
  const stepOrder: Step[] = [...steps.map((s) => s.id), "submitted"];

  function canAdvance(): boolean {
    if (step === "identity")
      return draft.fullName.length >= 2 && draft.email.includes("@");
    if (step === "company")
      return draft.companyName.trim().length >= 2;
    return true;
  }

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
    const idx = stepOrder.indexOf(step);
    if (idx >= 0 && idx < stepOrder.length - 1) {
      const target = stepOrder[idx + 1];
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
    const idx = stepOrder.indexOf(step);
    if (idx > 0) {
      const target = stepOrder[idx - 1];
      if (target) setStep(target);
    }
  }

  /** El usuario eligió tipo en el paso 0 — guardamos y avanzamos a Identity. */
  function chooseKind(kind: Kind) {
    setError(null);
    setDraft((p) => ({ ...p, kind }));
    setStep("identity");
  }

  function buildFormData(): FormData {
    const formData = new FormData();
    // Componemos el campo motivation (label + texto libre) y descartamos el
    // option interno: el backend solo conoce `motivation`.
    const composed = composeMotivation(draft.motivationOption, draft.motivation);
    const payload: Record<string, string> = {
      kind: draft.kind,
      fullName: draft.fullName,
      email: draft.email,
      phone: draft.phone,
      country: draft.country,
      motivation: composed,
      referredBy: draft.referredBy,
    };
    if (draft.kind === "COMPANY") {
      payload.companyName = draft.companyName;
      payload.companyDescription = draft.companyDescription;
      payload.companyKind = draft.companyKind;
    }
    Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
    return formData;
  }

  function requestCode() {
    setError(null);
    startTransition(async () => {
      const res: RequestCodeResult = await requestEmailVerification(buildFormData());
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
    startTransition(async () => {
      const res = await requestEmailVerification(buildFormData());
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
        {step === "kind" && (
          <div className="space-y-4">
            <p className="eyebrow">— ¿Cómo querés sumarte?</p>
            <p className="text-navy/75 leading-relaxed">
              Elegí el tipo de aplicación. Podés volver atrás más tarde si te equivocás.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <KindCard
                title="Persona"
                subtitle="Quiero ser miembro de la comunidad"
                description="Sumate como socio individual: ver proyectos, manifestar interés y participar de la red."
                selected={draft.kind === "PERSON"}
                onClick={() => chooseKind("PERSON")}
              />
              <KindCard
                title="Empresa"
                subtitle="Quiero registrar mi proyecto"
                description="Vengo a presentar un proyecto (startup, inmobiliario, mercancía u otro) para alojarlo en AJDUT."
                selected={draft.kind === "COMPANY"}
                onClick={() => chooseKind("COMPANY")}
              />
            </div>
          </div>
        )}

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

        {step === "company" && (
          <>
            <Field label="Nombre de la empresa o proyecto" htmlFor="companyName">
              <input
                id="companyName"
                type="text"
                value={draft.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                className="input"
                autoFocus
                maxLength={160}
              />
            </Field>
            <Field label="Tipo de proyecto" htmlFor="companyKind">
              <select
                id="companyKind"
                value={draft.companyKind}
                onChange={(e) =>
                  update("companyKind", e.target.value as CompanyKind)
                }
                className="input"
              >
                <option value="REAL_ESTATE">{COMPANY_KIND_LABEL.REAL_ESTATE}</option>
                <option value="MERCHANDISE">{COMPANY_KIND_LABEL.MERCHANDISE}</option>
                <option value="STARTUP">{COMPANY_KIND_LABEL.STARTUP}</option>
              </select>
            </Field>
            <Field label="Descripción corta de la propuesta (opcional)" htmlFor="companyDescription">
              <textarea
                id="companyDescription"
                rows={4}
                maxLength={1000}
                value={draft.companyDescription}
                onChange={(e) => update("companyDescription", e.target.value)}
                className="input"
                placeholder="En pocas líneas: qué hace el proyecto, en qué etapa está, qué necesitás de AJDUT."
              />
              <span className="eyebrow mt-2 block">
                {draft.companyDescription.length} / 1000 caracteres
              </span>
            </Field>
          </>
        )}

        {step === "motivation" && (
          <>
            <Field label="¿Qué te motiva?" htmlFor="motivationOption">
              <select
                id="motivationOption"
                value={draft.motivationOption}
                onChange={(e) => update("motivationOption", e.target.value)}
                className="input"
                autoFocus
              >
                {MOTIVATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Más detalles" htmlFor="motivation">
              <textarea
                id="motivation"
                rows={4}
                maxLength={2000}
                value={draft.motivation}
                onChange={(e) => update("motivation", e.target.value)}
                className="input"
                placeholder="Detalles adicionales (opcional)"
              />
              <span className="eyebrow mt-2 block">
                {draft.motivation.length} / 2000 caracteres
              </span>
            </Field>
          </>
        )}

        {step === "review" && (
          <div className="space-y-3 text-navy/85">
            <Row
              label="Tipo"
              value={draft.kind === "COMPANY" ? "Empresa" : "Persona"}
            />
            <Row label="Nombre" value={draft.fullName} />
            <Row label="Email" value={draft.email} />
            {draft.phone.trim() && <Row label="Teléfono" value={draft.phone} />}
            {draft.country.trim() && <Row label="País" value={draft.country} />}
            {draft.referredBy.trim() && (
              <Row label="Referido por" value={draft.referredBy} />
            )}
            {draft.kind === "COMPANY" && (
              <>
                <Row label="Empresa" value={draft.companyName} />
                <Row
                  label="Tipo de proyecto"
                  value={COMPANY_KIND_LABEL[draft.companyKind]}
                />
                {draft.companyDescription.trim() && (
                  <Row
                    label="Descripción"
                    value={draft.companyDescription}
                    multiline
                  />
                )}
              </>
            )}
            <Row
              label="Motivación"
              value={composeMotivation(draft.motivationOption, draft.motivation)}
              multiline
            />

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
        {step !== "kind" ? (
          <button type="button" onClick={back} className="eyebrow hover:!text-gold">
            ← Atrás
          </button>
        ) : (
          <span aria-hidden />
        )}

        {step === "kind" ? (
          // En el paso "kind" no hay botón Continuar — al elegir tarjeta
          // ya avanzamos automáticamente. Reservamos espacio igual.
          <span aria-hidden />
        ) : step === "review" ? (
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

function KindCard({
  title,
  subtitle,
  description,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hairline p-5 text-left transition-colors hover:bg-paper-light ${
        selected ? "bg-paper-light" : ""
      }`}
    >
      <p className="eyebrow">{title}</p>
      <p className="font-sans text-navy text-lg mt-2 leading-tight">{subtitle}</p>
      <p className="mt-3 text-navy/75 leading-relaxed text-sm">{description}</p>
    </button>
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

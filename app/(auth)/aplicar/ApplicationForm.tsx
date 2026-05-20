"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
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

function baseSteps(dict: Dict["apply"]): Array<{ id: Step; label: string }> {
  return [
    { id: "kind", label: dict.steps.kind ?? "Tipo" },
    { id: "identity", label: dict.steps.identity ?? "Identidad" },
    { id: "contact", label: dict.steps.contact ?? "Contacto" },
    { id: "motivation", label: dict.steps.motivation ?? "Motivación" },
    { id: "review", label: dict.steps.review ?? "Revisión" },
    { id: "verify", label: dict.steps.verify ?? "Verificación" },
  ];
}

/** Inserta el paso "Empresa" después de "Contacto" cuando el aplicante es COMPANY. */
function stepsFor(kind: Kind, dict: Dict["apply"]): Array<{ id: Step; label: string }> {
  const base = baseSteps(dict);
  if (kind === "PERSON") return base;
  const out: Array<{ id: Step; label: string }> = [];
  for (const s of base) {
    out.push(s);
    if (s.id === "contact")
      out.push({ id: "company", label: dict.steps.company ?? "Empresa" });
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

export function ApplicationForm({
  dict,
  locale,
}: {
  dict: Dict["apply"];
  locale: string;
}) {
  // Opciones de motivación traducidas. Default a primera opción del dict.
  const motivationOptions = dict.motivation.options;
  const firstOption = motivationOptions[0] ?? "";

  const emptyDraft: Draft = {
    kind: "PERSON",
    fullName: "",
    email: "",
    phone: "",
    country: "",
    motivation: "",
    motivationOption: firstOption,
    referredBy: "",
    companyName: "",
    companyDescription: "",
    companyKind: "STARTUP",
  };

  const COMPANY_KIND_LABEL: Record<CompanyKind, string> = {
    REAL_ESTATE: dict.company.kindRealEstate,
    MERCHANDISE: dict.company.kindMerchandise,
    STARTUP: dict.company.kindStartup,
  };

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

  const steps = stepsFor(draft.kind, dict);
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
        <p className="eyebrow">{dict.submitted.eyebrow}</p>
        <h2 className="font-sans text-h2 text-navy">{dict.submitted.title}</h2>
        <p className="text-navy/75 leading-relaxed">{dict.submitted.body}</p>
        <p className="eyebrow">
          {dict.submitted.reference} {submitResult.applicationId}
        </p>
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
                  aria-label={`${dict.backStep}${s.label}`}
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
            <p className="eyebrow">{dict.kind.eyebrow}</p>
            <p className="text-navy/75 leading-relaxed">{dict.kind.intro}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <KindCard
                title={dict.kind.personTitle}
                subtitle={dict.kind.personSubtitle}
                description={dict.kind.personDescription}
                selected={draft.kind === "PERSON"}
                onClick={() => chooseKind("PERSON")}
              />
              <KindCard
                title={dict.kind.companyTitle}
                subtitle={dict.kind.companySubtitle}
                description={dict.kind.companyDescription}
                selected={draft.kind === "COMPANY"}
                onClick={() => chooseKind("COMPANY")}
              />
            </div>
          </div>
        )}

        {step === "identity" && (
          <>
            <Field label={dict.identity.fullNameLabel} htmlFor="fullName">
              <input
                id="fullName"
                type="text"
                value={draft.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                className="input"
                autoFocus
              />
            </Field>
            <Field label={dict.identity.emailLabel} htmlFor="email">
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
            <Field label={dict.contact.phoneLabel} htmlFor="phone">
              <input
                id="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="input"
                autoFocus
              />
            </Field>
            <Field label={dict.contact.countryLabel} htmlFor="country">
              <input
                id="country"
                type="text"
                value={draft.country}
                onChange={(e) => update("country", e.target.value)}
                className="input"
              />
            </Field>
            <Field label={dict.contact.referredLabel} htmlFor="referredBy">
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
            <Field label={dict.company.nameLabel} htmlFor="companyName">
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
            <Field label={dict.company.kindLabel} htmlFor="companyKind">
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
            <Field label={dict.company.descriptionLabel} htmlFor="companyDescription">
              <textarea
                id="companyDescription"
                rows={4}
                maxLength={1000}
                value={draft.companyDescription}
                onChange={(e) => update("companyDescription", e.target.value)}
                className="input"
                placeholder={dict.company.descriptionPlaceholder}
              />
              <span className="eyebrow mt-2 block">
                {draft.companyDescription.length} / 1000 {dict.company.charsCounter}
              </span>
            </Field>
          </>
        )}

        {step === "motivation" && (
          <>
            <Field label={dict.motivation.questionLabel} htmlFor="motivationOption">
              <select
                id="motivationOption"
                value={draft.motivationOption}
                onChange={(e) => update("motivationOption", e.target.value)}
                className="input"
                autoFocus
              >
                {motivationOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={dict.motivation.detailsLabel} htmlFor="motivation">
              <textarea
                id="motivation"
                rows={4}
                maxLength={2000}
                value={draft.motivation}
                onChange={(e) => update("motivation", e.target.value)}
                className="input"
                placeholder={dict.motivation.detailsPlaceholder}
              />
              <span className="eyebrow mt-2 block">
                {draft.motivation.length} / 2000 {dict.company.charsCounter}
              </span>
            </Field>
          </>
        )}

        {step === "review" && (
          <div className="space-y-3 text-navy/85">
            <Row
              label={dict.review.typeLabel}
              value={draft.kind === "COMPANY" ? dict.review.typeCompany : dict.review.typePerson}
            />
            <Row label={dict.review.nameLabel} value={draft.fullName} />
            <Row label={dict.review.emailLabel} value={draft.email} />
            {draft.phone.trim() && <Row label={dict.review.phoneLabel} value={draft.phone} />}
            {draft.country.trim() && <Row label={dict.review.countryLabel} value={draft.country} />}
            {draft.referredBy.trim() && (
              <Row label={dict.review.referredLabel} value={draft.referredBy} />
            )}
            {draft.kind === "COMPANY" && (
              <>
                <Row label={dict.review.companyLabel} value={draft.companyName} />
                <Row
                  label={dict.review.companyKindLabel}
                  value={COMPANY_KIND_LABEL[draft.companyKind]}
                />
                {draft.companyDescription.trim() && (
                  <Row
                    label={dict.review.descriptionLabel}
                    value={draft.companyDescription}
                    multiline
                  />
                )}
              </>
            )}
            <Row
              label={dict.review.motivationLabel}
              value={composeMotivation(draft.motivationOption, draft.motivation)}
              multiline
            />

            <p className="mt-6 eyebrow">{dict.review.footnote}</p>
          </div>
        )}

        {step === "verify" && verifiedEmail && (
          <div className="space-y-5">
            <p className="eyebrow">{dict.verify.eyebrow}</p>
            <h2 className="font-sans text-h2 text-navy">{dict.verify.title}</h2>
            <p className="text-navy/75 leading-relaxed">
              {dict.verify.sentTo}{" "}
              <span className="font-mono text-navy">{verifiedEmail}</span>
              {dict.verify.sentSuffix}
            </p>
            {codeExpiresAt && (
              <p className="eyebrow">
                {dict.verify.validUntil}{" "}
                {new Date(codeExpiresAt).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}

            <Field label={dict.verify.codeLabel} htmlFor="code">
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
              {dict.verify.resend}
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
            {dict.backShort}
          </button>
        ) : (
          <span aria-hidden />
        )}

        {step === "kind" ? (
          <span aria-hidden />
        ) : step === "review" ? (
          <button
            type="button"
            onClick={requestCode}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.sendingCode : dict.sendCode}
          </button>
        ) : step === "verify" ? (
          <button
            type="button"
            onClick={submitCode}
            disabled={isPending || code.length !== 6}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.verifying : dict.verifyAndSubmit}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance()}
            className="btn-primary disabled:opacity-50"
          >
            {dict.continue}
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

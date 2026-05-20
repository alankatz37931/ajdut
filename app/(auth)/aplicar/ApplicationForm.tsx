"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { submitApplication, type SubmitResult } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type Kind = "PERSON" | "COMPANY";
type CompanyKind = "REAL_ESTATE" | "MERCHANDISE" | "STARTUP" | "OTHER";

type Step =
  | "kind"
  | "identity"
  | "contact"
  | "company"
  | "motivation"
  | "review"
  | "submitted";

function baseSteps(dict: Dict["apply"]): Array<{ id: Step; label: string }> {
  return [
    { id: "kind", label: dict.steps.kind ?? "Tipo" },
    { id: "identity", label: dict.steps.identity ?? "Identidad" },
    { id: "contact", label: dict.steps.contact ?? "Contacto" },
    { id: "motivation", label: dict.steps.motivation ?? "Motivación" },
    { id: "review", label: dict.steps.review ?? "Revisión" },
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
    STARTUP: dict.company.kindStartup,
    REAL_ESTATE: dict.company.kindRealEstate,
    MERCHANDISE: dict.company.kindMerchandise,
    OTHER: dict.company.kindOther,
  };

  const [step, setStep] = useState<Step>("kind");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

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

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitApplication(buildFormData());
      setSubmitResult(res);
      if (res.ok) {
        setStep("submitted");
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

  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] lg:gap-x-14 gap-y-6">
      {/* ─── Sidebar vertical sticky (desktop) ────────────────────────
          En desktop vive a la izquierda como tabla de contenidos del
          documento. Cada paso es un dot + label en una columna.
          ● gold filled     = completado, clickeable, vuelve a ese paso
          ◉ gold ring + bg  = paso actual
          ○ hairline        = paso por venir (no clickeable) */}
      <aside className="hidden lg:block">
        <ol className="sticky top-8 space-y-0">
          {steps.map((s, i) => {
            const idxOfThis = stepOrder.indexOf(s.id);
            const isPast = idxOfThis < currentIdx;
            const isCurrent = step === s.id;
            const isLast = i === steps.length - 1;

            const dotCls = isPast
              ? "h-2.5 w-2.5 rounded-full bg-gold shrink-0"
              : isCurrent
              ? "h-2.5 w-2.5 rounded-full ring-1 ring-gold ring-offset-2 ring-offset-paper bg-gold/15 shrink-0"
              : "h-2.5 w-2.5 rounded-full border-[0.5px] border-navy/30 bg-transparent shrink-0";

            const numCls = `font-mono text-xs shrink-0 w-6 ${
              isCurrent ? "text-gold" : isPast ? "text-navy/60" : "text-navy/30"
            }`;
            const lblCls = `eyebrow tracking-wide whitespace-nowrap ${
              isCurrent
                ? "!text-navy"
                : isPast
                ? "!text-navy/60"
                : "!text-navy/30"
            }`;

            const Row = (
              <div className="flex items-center gap-3">
                <span className={numCls}>{String(i + 1).padStart(2, "0")}</span>
                <span className={dotCls} aria-hidden />
                <span className={lblCls}>{s.label}</span>
              </div>
            );

            return (
              <li key={s.id} className="relative">
                {isPast ? (
                  <button
                    type="button"
                    onClick={() => goTo(s.id)}
                    aria-label={`${dict.backStep}${s.label}`}
                    className="block w-full text-left py-2.5 cursor-pointer hover:opacity-70 transition-opacity"
                  >
                    {Row}
                  </button>
                ) : (
                  <div className="py-2.5">{Row}</div>
                )}
                {/* Conector vertical entre dots: gold si ya pasaste por acá,
                    line si todavía no. Alineado con el centro del dot. */}
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[2.625rem] top-[2.4rem] bottom-0 w-px ${
                      isPast ? "bg-gold/40" : "bg-line"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </aside>

      {/* ─── Step indicator compacto (mobile) ───────────────────────── */}
      <div className="lg:hidden">
        <div className="h-px bg-line w-full overflow-hidden">
          <div
            className="h-px bg-gold transition-all duration-300"
            style={{
              width: `${((currentIdx + 1) / steps.length) * 100}%`,
            }}
            aria-hidden
          />
        </div>
        <p className="mt-3 font-mono text-xs tracking-[0.18em] uppercase text-navy/60">
          <span className="text-gold">
            {String(currentIdx + 1).padStart(2, "0")}
          </span>{" "}
          / {String(steps.length).padStart(2, "0")}{" "}
          <span className="text-navy/30">·</span>{" "}
          <span className="!text-navy">
            {steps.find((s) => s.id === step)?.label ?? ""}
          </span>
        </p>
      </div>

      {/* ─── Columna derecha: contenido del paso + acciones ────────── */}
      <div>

      <div className="space-y-3">
        {step === "kind" && (
          <div className="space-y-4">

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
          <div className="space-y-5">
            <FloatingInput
              id="fullName"
              type="text"
              label={dict.identity.fullNameLabel}
              value={draft.fullName}
              onChange={(v) => update("fullName", v)}
              autoFocus
            />
            <FloatingInput
              id="email"
              type="email"
              label={dict.identity.emailLabel}
              value={draft.email}
              onChange={(v) => update("email", v)}
            />
          </div>
        )}

        {step === "contact" && (
          <div className="space-y-5">
            <FloatingInput
              id="phone"
              type="tel"
              label={dict.contact.phoneLabel}
              value={draft.phone}
              onChange={(v) => update("phone", v)}
              autoFocus
            />
            <FloatingInput
              id="country"
              type="text"
              label={dict.contact.countryLabel}
              value={draft.country}
              onChange={(v) => update("country", v)}
            />
          </div>
        )}

        {step === "company" && (
          <div className="space-y-5">
            <FloatingInput
              id="companyName"
              type="text"
              label={dict.company.nameLabel}
              value={draft.companyName}
              onChange={(v) => update("companyName", v)}
              autoFocus
              maxLength={160}
            />
            <FloatingSelect
              id="companyKind"
              label={dict.company.kindLabel}
              value={draft.companyKind}
              onChange={(v) => update("companyKind", v as CompanyKind)}
              options={[
                { value: "STARTUP", label: COMPANY_KIND_LABEL.STARTUP },
                { value: "REAL_ESTATE", label: COMPANY_KIND_LABEL.REAL_ESTATE },
                { value: "MERCHANDISE", label: COMPANY_KIND_LABEL.MERCHANDISE },
                { value: "OTHER", label: COMPANY_KIND_LABEL.OTHER },
              ]}
            />
            <FloatingTextarea
              id="companyDescription"
              label={dict.company.descriptionLabel}
              value={draft.companyDescription}
              onChange={(v) => update("companyDescription", v)}
              rows={4}
              maxLength={1000}
              counterSuffix={dict.company.charsCounter}
            />
          </div>
        )}

        {step === "motivation" && (
          <div className="space-y-5">
            <FloatingSelect
              id="motivationOption"
              label={dict.motivation.questionLabel}
              value={draft.motivationOption}
              onChange={(v) => update("motivationOption", v)}
              options={motivationOptions.map((opt) => ({ value: opt, label: opt }))}
              autoFocus
            />
            <FloatingInput
              id="referredBy"
              type="text"
              label={dict.contact.referredLabel}
              value={draft.referredBy}
              onChange={(v) => update("referredBy", v)}
            />
          </div>
        )}

        {step === "review" && (
          <div className="text-navy/85">
            {/* Grid 2 columnas para campos cortos: label eyebrow arriba +
                value debajo. Mucho más compacto que filas horizontales. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
              <Cell
                label={dict.review.typeLabel}
                value={
                  draft.kind === "COMPANY"
                    ? dict.review.typeCompany
                    : dict.review.typePerson
                }
              />
              <Cell label={dict.review.nameLabel} value={draft.fullName} />
              <Cell label={dict.review.emailLabel} value={draft.email} />
              {draft.phone.trim() && (
                <Cell label={dict.review.phoneLabel} value={draft.phone} />
              )}
              {draft.country.trim() && (
                <Cell label={dict.review.countryLabel} value={draft.country} />
              )}
              {draft.referredBy.trim() && (
                <Cell
                  label={dict.review.referredLabel}
                  value={draft.referredBy}
                />
              )}
              {draft.kind === "COMPANY" && (
                <>
                  <Cell
                    label={dict.review.companyLabel}
                    value={draft.companyName}
                  />
                  <Cell
                    label={dict.review.companyKindLabel}
                    value={COMPANY_KIND_LABEL[draft.companyKind]}
                  />
                </>
              )}
            </div>

            {/* Textos largos a fila completa, separados por hairline. */}
            <div className="mt-6 hairline-t pt-5 space-y-5">
              {draft.kind === "COMPANY" && draft.companyDescription.trim() && (
                <Cell
                  label={dict.review.descriptionLabel}
                  value={draft.companyDescription}
                  multiline
                />
              )}
              <Cell
                label={dict.review.motivationLabel}
                value={composeMotivation(draft.motivationOption, draft.motivation)}
                multiline
              />
            </div>
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
            onClick={submit}
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.sendingApplication : dict.sendApplication}
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
      </div>
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

// Cell para el Review: label como eyebrow arriba + value debajo. Stacked,
// más denso que el Row horizontal. Multiline solo para textos largos.
function Cell({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow !text-navy/40 mb-1">{label}</p>
      <p
        className={`text-navy break-words [overflow-wrap:anywhere] leading-relaxed ${
          multiline ? "whitespace-pre-line" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

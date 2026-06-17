"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { createProjectAction } from "./actions";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type NewDict = Dict["founderNuevoProyecto"];
type Kind = "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER";
type Stage = "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE";

// Hoisted fuera del render: solo ids + dict-keys, sin labels resueltos
// (los labels vienen del dict y se resuelven con `useMemo`). Antes esto se
// reconstruía en cada keystroke del form (20+ inputs).
const STAGE_DEFS: Array<{ id: Stage; key: keyof NewDict }> = [
  { id: "IDEA", key: "stageIdea" },
  { id: "PRE_SEED", key: "stagePreSeed" },
  { id: "SEED", key: "stageSeed" },
  { id: "EARLY_REVENUE", key: "stageEarlyRevenue" },
  { id: "GROWTH", key: "stageGrowth" },
  { id: "SCALE", key: "stageScale" },
];
const KIND_DEFS: Array<{ id: Kind; key: keyof NewDict }> = [
  { id: "REAL_ESTATE", key: "kindRealEstate" },
  { id: "MERCHANDISE", key: "kindMerchandise" },
  { id: "STARTUP", key: "kindOther" },
];

type FormState = {
  name: string;
  legalName: string;
  jurisdiction: string;
  kind: Kind;
  /** Valor del select de sector (un sector predefinido o "__OTHER__"). */
  sector: string;
  /** Texto libre cuando sector === "__OTHER__". */
  sectorOther: string;
  stage: Stage;
  location: string;
  targetRaiseAmount: string;
  oneLiner: string;
  description: string;
  problemStatement: string;
  solutionStatement: string;
  businessModel: string;
  totalParticipations: string;
  pricePerParticipation: string;
  valuationCurrency: "USD" | "MXN";
  websiteUrl: string;
  videoUrl: string;
  assetBackingNote: string;
  equityStructureNote: string;
  projectionsUrl: string;
  planNegociosUrl: string;
  estrategiasPeriodicasUrl: string;
  estadosFinancierosUrl: string;
  estrategiaEmisionUrl: string;
  policyShares: string;
  policyDividends: string;
  dividendsFrequency: string;
};

export function NewProjectForm({
  dict,
  locale,
}: {
  dict: NewDict;
  locale: string;
}) {
  const [form, setForm] = useState<FormState>({
    name: "",
    legalName: "",
    jurisdiction: "",
    kind: "STARTUP",
    sector: "",
    sectorOther: "",
    stage: "IDEA",
    location: "",
    targetRaiseAmount: "",
    oneLiner: "",
    description: "",
    problemStatement: "",
    solutionStatement: "",
    businessModel: "",
    totalParticipations: "",
    pricePerParticipation: "",
    valuationCurrency: "USD",
    websiteUrl: "",
    videoUrl: "",
    assetBackingNote: "",
    equityStructureNote: "",
    projectionsUrl: "",
    planNegociosUrl: "",
    estrategiasPeriodicasUrl: "",
    estadosFinancierosUrl: "",
    estrategiaEmisionUrl: "",
    policyShares: "",
    policyDividends: "",
    dividendsFrequency: "",
  });
  const { run, isPending, error } = useSafeAction(createProjectAction);

  // Emisión directa: el founder define total + precio. La valoración es el
  // producto (read-only, solo display).
  const totalParts = Number.parseInt(form.totalParticipations, 10);
  const pricePart = Number.parseFloat(form.pricePerParticipation);
  const totalValid = Number.isFinite(totalParts) && totalParts >= 1;
  const priceValid = Number.isFinite(pricePart) && pricePart > 0;
  const derivedValuation =
    totalValid && priceValid ? totalParts * pricePart : null;

  // `update` con identidad estable — sin esto, cada keystroke creaba un
  // nuevo `update` y cada arrow `(v) => update(...)` también, rompiendo el
  // memo de las primitivas Floating.
  const update = useCallback(
    <K extends keyof FormState>(k: K, v: FormState[K]) => {
      setForm((p) => ({ ...p, [k]: v }));
    },
    []
  );

  // Factory de handlers `onChange` por campo, memoizada. Cada `field`
  // produce un handler estable mientras el componente esté montado.
  // Esto, combinado con `React.memo` en las primitivas, evita que cada
  // keystroke re-renderice los ~25 campos del form.
  const handlerCache = useMemo(() => new Map<keyof FormState, (v: unknown) => void>(), []);
  const handler = useCallback(
    <K extends keyof FormState>(field: K): ((v: FormState[K]) => void) => {
      const cached = handlerCache.get(field);
      if (cached) return cached as (v: FormState[K]) => void;
      const fn = (v: FormState[K]) => update(field, v);
      handlerCache.set(field, fn as (v: unknown) => void);
      return fn;
    },
    [handlerCache, update]
  );

  // Labels resueltos del dict — recomputa solo si el dict cambia
  // (prácticamente nunca durante el ciclo del form).
  const STAGES = useMemo(
    () => STAGE_DEFS.map((s) => ({ value: s.id, label: dict[s.key] as string })),
    [dict]
  );
  const KINDS = useMemo(
    () => KIND_DEFS.map((k) => ({ value: k.id, label: dict[k.key] as string })),
    [dict]
  );
  // Sectores predefinidos + placeholder + "Otro" (texto libre) al final.
  const SECTORS = useMemo(
    () => [
      { value: "", label: dict.sectorPlaceholder },
      ...dict.sectorOptions.map((s) => ({ value: s, label: s })),
      { value: "__OTHER__", label: dict.sectorOther },
    ],
    [dict.sectorOptions, dict.sectorPlaceholder, dict.sectorOther]
  );
  const CURRENCY_OPTS = useMemo(
    () => [
      { value: "USD", label: dict.currencyUsd },
      { value: "MXN", label: dict.currencyMxn },
    ],
    [dict.currencyUsd, dict.currencyMxn]
  );

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: form.valuationCurrency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtInt = (n: number) => n.toLocaleString(locale);

  return (
    <form action={run} className="mt-10 space-y-10">
      {/* Identidad */}
      <section className="space-y-5">
        <p className="eyebrow">{dict.sectionIdentity}</p>

        <FloatingInput
          id="name"
          label={dict.nameLabel}
          value={form.name}
          onChange={handler("name")}
          required
        />

        <div>
          <FloatingInput
            id="oneLiner"
            label={dict.oneLinerLabel}
            value={form.oneLiner}
            onChange={handler("oneLiner")}
            maxLength={160}
            required
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            {dict.oneLinerHelperFmt.replace("{n}", String(form.oneLiner.length))}
          </p>
        </div>

        <FloatingTextarea
          id="description"
          label={dict.descriptionLabel}
          value={form.description}
          onChange={handler("description")}
          rows={5}
          required
        />
      </section>

      {/* Legal */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionLegal}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <FloatingInput
              id="legalName"
              label={dict.legalNameLabel}
              value={form.legalName}
              onChange={handler("legalName")}
            />
            <p className="eyebrow !text-navy/40 mt-1.5">{dict.legalNameHelper}</p>
          </div>
          <FloatingInput
            id="jurisdiction"
            label={dict.jurisdictionLabel}
            value={form.jurisdiction}
            onChange={handler("jurisdiction")}
            required
          />
        </div>
      </section>

      {/* Categorización */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionCategorization}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
          <div>
            <FloatingSelect
              id="kind"
              label={dict.kindLabel}
              value={form.kind}
              onChange={handler("kind") as (v: string) => void}
              options={KINDS}
            />
            <input type="hidden" name="kind" value={form.kind} />
          </div>
          <FloatingInput
            id="location"
            label={dict.locationLabel}
            value={form.location}
            onChange={handler("location")}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
          <div>
            <FloatingSelect
              id="sector"
              label={dict.sectorLabel}
              value={form.sector}
              onChange={handler("sector") as (v: string) => void}
              options={SECTORS}
            />
            {/* El valor que persiste: el sector elegido, o el texto libre si "Otro". */}
            <input
              type="hidden"
              name="sector"
              value={form.sector === "__OTHER__" ? form.sectorOther : form.sector}
            />
          </div>
          <div>
            <FloatingSelect
              id="stage"
              label={dict.stageLabel}
              value={form.stage}
              onChange={handler("stage") as (v: string) => void}
              options={STAGES}
            />
            <input type="hidden" name="stage" value={form.stage} />
          </div>
        </div>
        {form.sector === "__OTHER__" && (
          <FloatingInput
            id="sectorOther"
            label={dict.sectorOtherLabel}
            value={form.sectorOther}
            onChange={handler("sectorOther")}
            required
          />
        )}
        <FloatingInput
          id="websiteUrl"
          type="url"
          inputMode="url"
          label={dict.websiteLabel}
          value={form.websiteUrl}
          onChange={handler("websiteUrl")}
        />
      </section>

      {/* ¿Qué hace? */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionWhat}</p>
        <FloatingTextarea
          id="problemStatement"
          label={dict.problemLabel}
          value={form.problemStatement}
          onChange={handler("problemStatement")}
          rows={3}
          required
        />
        <FloatingTextarea
          id="solutionStatement"
          label={dict.solutionLabel}
          value={form.solutionStatement}
          onChange={handler("solutionStatement")}
          rows={3}
          required
        />
        <FloatingTextarea
          id="businessModel"
          label={dict.businessModelLabel}
          value={form.businessModel}
          onChange={handler("businessModel")}
          rows={2}
          required
        />
      </section>

      {/* Estructura y respaldo */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionStructure}</p>
        <FloatingTextarea
          id="assetBackingNote"
          label={dict.assetBackingLabel}
          value={form.assetBackingNote}
          onChange={handler("assetBackingNote")}
          rows={3}
          maxLength={2000}
        />
        <FloatingTextarea
          id="equityStructureNote"
          label={dict.equityStructureLabel}
          value={form.equityStructureNote}
          onChange={handler("equityStructureNote")}
          rows={3}
          maxLength={2000}
        />
      </section>

      {/* Políticas */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionPolicies}</p>
        <p className="text-navy/75 leading-relaxed">{dict.policiesIntro}</p>
        <FloatingTextarea
          id="policyShares"
          label={dict.policySharesLabel}
          value={form.policyShares}
          onChange={handler("policyShares")}
          rows={3}
          maxLength={2000}
        />
        <FloatingTextarea
          id="policyDividends"
          label={dict.policyDividendsLabel}
          value={form.policyDividends}
          onChange={handler("policyDividends")}
          rows={3}
          maxLength={2000}
        />
        <FloatingInput
          id="dividendsFrequency"
          label={dict.dividendsFreqLabel}
          value={form.dividendsFrequency}
          onChange={handler("dividendsFrequency")}
          maxLength={120}
        />
      </section>

      {/* Video */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionVideo}</p>
        <p className="text-navy/75 leading-relaxed">{dict.videoIntro}</p>
        <div>
          <FloatingInput
            id="videoUrl"
            type="url"
            inputMode="url"
            label={dict.videoUrlLabel}
            value={form.videoUrl}
            onChange={handler("videoUrl")}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">{dict.videoHelper}</p>
        </div>
      </section>

      {/* Emisión de participaciones */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionValuation}</p>
        <p className="text-navy/75 leading-relaxed">{dict.valuationIntro}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <FloatingInput
            id="totalParticipations"
            type="number"
            step="1"
            label={dict.totalParticipationsLabel}
            value={form.totalParticipations}
            onChange={handler("totalParticipations")}
            required
          />
          <FloatingInput
            id="pricePerParticipation"
            type="number"
            step="any"
            label={dict.pricePerParticipationLabel}
            value={form.pricePerParticipation}
            onChange={handler("pricePerParticipation")}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
          <div>
            <FloatingSelect
              id="valuationCurrency"
              label={dict.currencyLabel}
              value={form.valuationCurrency}
              onChange={handler("valuationCurrency") as (v: string) => void}
              options={CURRENCY_OPTS}
            />
            <input
              type="hidden"
              name="valuationCurrency"
              value={form.valuationCurrency}
            />
          </div>
          <FloatingInput
            id="targetRaiseAmount"
            type="number"
            step="any"
            label={dict.targetRaiseLabel}
            value={form.targetRaiseAmount}
            onChange={handler("targetRaiseAmount")}
          />
        </div>

        {derivedValuation !== null && (
          <div className="hairline p-4 bg-paper font-mono text-sm">
            <p className="eyebrow !text-navy/40">{dict.totalSharesLabel}</p>
            <p className="mt-1 text-navy">{fmtInt(totalParts)}</p>
            <p className="mt-3 text-navy">
              {dict.derivedValuationFmt.replace(
                "{value}",
                fmtMoney(derivedValuation)
              )}
            </p>
          </div>
        )}

        <p className="eyebrow !text-navy/55 leading-relaxed">
          {dict.emissionLegend}
        </p>
      </section>

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <div className="hairline-t pt-6 space-y-3">
        <p className="text-navy/75 leading-relaxed text-sm">{dict.finalNote}</p>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.submittingBtn : dict.submitBtn}
        </button>
      </div>
    </form>
  );
}

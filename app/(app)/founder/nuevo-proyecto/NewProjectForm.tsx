"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { createProjectAction } from "./actions";
import { derivePriceAndShares } from "@/lib/utils/shares";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type NewDict = Dict["founderNuevoProyecto"];
type Kind = "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER";
type Stage = "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE";

export function NewProjectForm({
  dict,
  locale,
}: {
  dict: NewDict;
  locale: string;
}) {
  const STAGES: Array<{ id: Stage; label: string }> = [
    { id: "IDEA", label: dict.stageIdea },
    { id: "PRE_SEED", label: dict.stagePreSeed },
    { id: "SEED", label: dict.stageSeed },
    { id: "EARLY_REVENUE", label: dict.stageEarlyRevenue },
    { id: "GROWTH", label: dict.stageGrowth },
    { id: "SCALE", label: dict.stageScale },
  ];
  const KINDS: Array<{ id: Kind; label: string }> = [
    { id: "REAL_ESTATE", label: dict.kindRealEstate },
    { id: "MERCHANDISE", label: dict.kindMerchandise },
    { id: "STARTUP", label: dict.kindOther },
  ];

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    jurisdiction: "",
    kind: "STARTUP" as Kind,
    sector: "",
    stage: "IDEA" as Stage,
    location: "",
    targetRaiseAmount: "",
    oneLiner: "",
    description: "",
    problemStatement: "",
    solutionStatement: "",
    businessModel: "",
    preMoneyValuation: "",
    valuationCurrency: "USD" as "USD" | "MXN",
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

  const valuation = Number.parseFloat(form.preMoneyValuation);
  const valuationValid = Number.isFinite(valuation) && valuation > 0;
  const derived = valuationValid ? derivePriceAndShares(valuation) : null;

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

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
          onChange={(v) => update("name", v)}
          required
        />

        <div>
          <FloatingInput
            id="oneLiner"
            label={dict.oneLinerLabel}
            value={form.oneLiner}
            onChange={(v) => update("oneLiner", v)}
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
          onChange={(v) => update("description", v)}
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
              onChange={(v) => update("legalName", v)}
            />
            <p className="eyebrow !text-navy/40 mt-1.5">{dict.legalNameHelper}</p>
          </div>
          <FloatingInput
            id="jurisdiction"
            label={dict.jurisdictionLabel}
            value={form.jurisdiction}
            onChange={(v) => update("jurisdiction", v)}
            required
          />
        </div>
      </section>

      {/* Categorización */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionCategorization}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <FloatingSelect
              id="kind"
              label={dict.kindLabel}
              value={form.kind}
              onChange={(v) => update("kind", v as Kind)}
              options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
            />
            <input type="hidden" name="kind" value={form.kind} />
          </div>
          <FloatingInput
            id="location"
            label={dict.locationLabel}
            value={form.location}
            onChange={(v) => update("location", v)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <FloatingInput
            id="sector"
            label={dict.sectorLabel}
            value={form.sector}
            onChange={(v) => update("sector", v)}
            required
          />
          <div>
            <FloatingSelect
              id="stage"
              label={dict.stageLabel}
              value={form.stage}
              onChange={(v) => update("stage", v as Stage)}
              options={STAGES.map((s) => ({ value: s.id, label: s.label }))}
            />
            <input type="hidden" name="stage" value={form.stage} />
          </div>
        </div>
        <FloatingInput
          id="websiteUrl"
          type="url"
          inputMode="url"
          label={dict.websiteLabel}
          value={form.websiteUrl}
          onChange={(v) => update("websiteUrl", v)}
        />
      </section>

      {/* ¿Qué hace? */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionWhat}</p>
        <FloatingTextarea
          id="problemStatement"
          label={dict.problemLabel}
          value={form.problemStatement}
          onChange={(v) => update("problemStatement", v)}
          rows={3}
          required
        />
        <FloatingTextarea
          id="solutionStatement"
          label={dict.solutionLabel}
          value={form.solutionStatement}
          onChange={(v) => update("solutionStatement", v)}
          rows={3}
          required
        />
        <FloatingTextarea
          id="businessModel"
          label={dict.businessModelLabel}
          value={form.businessModel}
          onChange={(v) => update("businessModel", v)}
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
          onChange={(v) => update("assetBackingNote", v)}
          rows={3}
          maxLength={2000}
        />
        <FloatingTextarea
          id="equityStructureNote"
          label={dict.equityStructureLabel}
          value={form.equityStructureNote}
          onChange={(v) => update("equityStructureNote", v)}
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
          onChange={(v) => update("policyShares", v)}
          rows={3}
          maxLength={2000}
        />
        <FloatingTextarea
          id="policyDividends"
          label={dict.policyDividendsLabel}
          value={form.policyDividends}
          onChange={(v) => update("policyDividends", v)}
          rows={3}
          maxLength={2000}
        />
        <FloatingInput
          id="dividendsFrequency"
          label={dict.dividendsFreqLabel}
          value={form.dividendsFrequency}
          onChange={(v) => update("dividendsFrequency", v)}
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
            onChange={(v) => update("videoUrl", v)}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">{dict.videoHelper}</p>
        </div>
      </section>

      {/* Valoración */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">{dict.sectionValuation}</p>
        <p className="text-navy/75 leading-relaxed">{dict.valuationIntro}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <FloatingInput
            id="preMoneyValuation"
            type="number"
            step="any"
            label={dict.valuationLabel}
            value={form.preMoneyValuation}
            onChange={(v) => update("preMoneyValuation", v)}
            required
          />
          <div>
            <FloatingSelect
              id="valuationCurrency"
              label={dict.currencyLabel}
              value={form.valuationCurrency}
              onChange={(v) => update("valuationCurrency", v as "USD" | "MXN")}
              options={[
                { value: "USD", label: dict.currencyUsd },
                { value: "MXN", label: dict.currencyMxn },
              ]}
            />
            <input
              type="hidden"
              name="valuationCurrency"
              value={form.valuationCurrency}
            />
          </div>
        </div>
        <FloatingInput
          id="targetRaiseAmount"
          type="number"
          step="any"
          label={dict.targetRaiseLabel}
          value={form.targetRaiseAmount}
          onChange={(v) => update("targetRaiseAmount", v)}
        />

        {derived && (
          <div className="hairline p-4 bg-paper grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-sm">
            <div>
              <p className="eyebrow !text-navy/40">{dict.pricePerShareLabel}</p>
              <p className="mt-1 text-navy">{fmtMoney(derived.pricePerShare)}</p>
            </div>
            <div>
              <p className="eyebrow !text-navy/40">{dict.totalSharesLabel}</p>
              <p className="mt-1 text-navy">{fmtInt(derived.totalShares)}</p>
            </div>
          </div>
        )}
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

"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { updateProjectInfoAction } from "./actions";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import {
  FloatingDate,
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type EditDict = Dict["founderEditar"];

type Initial = {
  name: string;
  shortPitch: string;
  description: string;
  kind: "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER";
  sector: string;
  stage: "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE";
  location: string;
  targetRaiseAmount: string;
  oneLiner: string;
  problemStatement: string;
  solutionStatement: string;
  businessModel: string;
  preMoneyValuation: string;
  valuationCurrency: string;
  websiteUrl: string;
  videoUrl: string;
  pitchDeckUrl: string;
  dataRoomUrl: string;
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
  availableShares: number;
  /** "YYYY-MM-DD" para el <input type="date">, o "" si no hay fecha. */
  resaleAllowedFrom: string;
};

// Hoisted fuera del render: solo ids + dict-keys. Los labels se resuelven
// con `useMemo` dentro del componente. Antes se reconstruían arrays nuevos
// en cada keystroke (form con 25+ inputs).
const STAGE_DEFS: Array<{ id: Initial["stage"]; key: keyof EditDict }> = [
  { id: "IDEA", key: "stageIdea" },
  { id: "PRE_SEED", key: "stagePreSeed" },
  { id: "SEED", key: "stageSeed" },
  { id: "EARLY_REVENUE", key: "stageEarlyRevenue" },
  { id: "GROWTH", key: "stageGrowth" },
  { id: "SCALE", key: "stageScale" },
];

const KIND_DEFS: Array<{ id: Initial["kind"]; key: keyof EditDict }> = [
  { id: "REAL_ESTATE", key: "kindRealEstate" },
  { id: "MERCHANDISE", key: "kindMerchandise" },
  { id: "STARTUP", key: "kindOther" },
];

export function EditProjectForm({
  projectSlug,
  initial,
  hasStartupProfile,
  maxAvailable,
  currentTotalShares,
  openLeadsCount,
  dict,
  locale,
}: {
  projectSlug: string;
  initial: Initial;
  hasStartupProfile: boolean;
  maxAvailable: number;
  currentTotalShares: number;
  openLeadsCount: number;
  dict: EditDict;
  locale: string;
}) {
  const [form, setForm] = useState<Initial>(initial);
  const boundAction = useCallback(
    (formData: FormData) => updateProjectInfoAction(projectSlug, formData),
    [projectSlug]
  );
  const { run, isPending, error } = useSafeAction(boundAction);

  // Labels resueltos del dict — recomputa solo si el dict cambia.
  const STAGES = useMemo(
    () => STAGE_DEFS.map((s) => ({ value: s.id, label: dict[s.key] })),
    [dict]
  );
  const KINDS = useMemo(
    () => KIND_DEFS.map((k) => ({ value: k.id, label: dict[k.key] })),
    [dict]
  );
  const CURRENCY_OPTS = useMemo(
    () => [
      { value: "USD", label: dict.currencyUsd },
      { value: "MXN", label: dict.currencyMxn },
    ],
    [dict.currencyUsd, dict.currencyMxn]
  );

  function update<K extends keyof Initial>(key: K, value: Initial[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

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
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            {dict.oneLinerHelperFmt.replace("{n}", String(form.oneLiner.length))}
          </p>
        </div>

        <FloatingTextarea
          id="shortPitch"
          label={dict.shortPitchLabel}
          value={form.shortPitch}
          onChange={(v) => update("shortPitch", v)}
          rows={2}
          maxLength={280}
        />

        <FloatingTextarea
          id="description"
          label={dict.descriptionLabel}
          value={form.description}
          onChange={(v) => update("description", v)}
          rows={6}
        />
      </section>

      {hasStartupProfile && (
        <>
          {/* Categorización */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">{dict.sectionCategorization}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
              <div>
                <FloatingSelect
                  id="kind"
                  label={dict.kindLabel}
                  value={form.kind}
                  onChange={(v) => update("kind", v as Initial["kind"])}
                  options={KINDS}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
              <FloatingInput
                id="sector"
                label={dict.sectorLabel}
                value={form.sector}
                onChange={(v) => update("sector", v)}
              />
              <div>
                <FloatingSelect
                  id="stage"
                  label={dict.stageLabel}
                  value={form.stage}
                  onChange={(v) => update("stage", v as Initial["stage"])}
                  options={STAGES}
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

          {/* ¿Qué hace? */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">{dict.sectionWhat}</p>
            <FloatingTextarea
              id="problemStatement"
              label={dict.problemLabel}
              value={form.problemStatement}
              onChange={(v) => update("problemStatement", v)}
              rows={3}
            />
            <FloatingTextarea
              id="solutionStatement"
              label={dict.solutionLabel}
              value={form.solutionStatement}
              onChange={(v) => update("solutionStatement", v)}
              rows={3}
            />
            <FloatingTextarea
              id="businessModel"
              label={dict.businessModelLabel}
              value={form.businessModel}
              onChange={(v) => update("businessModel", v)}
              rows={2}
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

          {/* Acciones a la venta */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">{dict.sectionSharesForSale}</p>
            <p className="text-navy/75 leading-relaxed">{dict.sharesForSaleIntro}</p>
            <div>
              <FloatingInput
                id="availableShares"
                type="number"
                label={dict.availableLabelFmt.replace(
                  "{n}",
                  maxAvailable.toLocaleString(locale)
                )}
                value={String(form.availableShares)}
                onChange={(v) =>
                  update("availableShares", Number.parseInt(v || "0", 10) || 0)
                }
              />
              <p className="eyebrow !text-navy/40 mt-1.5">
                {dict.todayAvailableFmt.replace(
                  "{n}",
                  initial.availableShares.toLocaleString(locale)
                )}
              </p>
              <p className="text-sm text-navy/55 leading-relaxed mt-2">
                {dict.emissionConsultLegend}
              </p>
              {form.availableShares === 0 && openLeadsCount > 0 && (
                <div className="hairline mt-3 p-3 bg-paper">
                  <p className="eyebrow !text-gold">
                    {(openLeadsCount === 1
                      ? dict.openLeadsWarnSingle
                      : dict.openLeadsWarnPlural
                    ).replace("{n}", String(openLeadsCount))}
                  </p>
                  <p className="mt-2 text-sm text-navy/85 leading-relaxed">
                    {dict.openLeadsBody}{" "}
                    <a
                      href={`/founder/${projectSlug}/leads`}
                      className="!text-gold hover:!text-navy underline"
                    >
                      {dict.openLeadsLink}
                    </a>{" "}
                    {dict.openLeadsTail}
                  </p>
                </div>
              )}
            </div>

            {/* Fecha de inicio de reventa — gate opcional. Vacío = reventa
                habilitada desde siempre. El campo `name` lo toma el FloatingDate
                de su id, así que el value viaja en el FormData del submit. */}
            <div>
              <FloatingDate
                id="resaleAllowedFrom"
                label={dict.resaleAllowedFromLabel}
                value={form.resaleAllowedFrom}
                onChange={(v) => update("resaleAllowedFrom", v)}
              />
              <p className="eyebrow !text-navy/40 mt-1.5">
                {dict.resaleAllowedFromHelper}
              </p>
            </div>
          </section>

          {/* Valoración */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">{dict.sectionValuation}</p>
            {/* items-end: el FloatingInput (label flotante) y el FloatingSelect
                (label estático) tienen alturas internas distintas; alinear al
                fondo deja las líneas/valores de Monto y Moneda a la misma altura. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
              <FloatingInput
                id="preMoneyValuation"
                type="number"
                step="any"
                label={dict.valuationLabel}
                value={form.preMoneyValuation}
                onChange={(v) => update("preMoneyValuation", v)}
              />
              <div>
                <FloatingSelect
                  id="valuationCurrency"
                  label={dict.currencyLabel}
                  value={form.valuationCurrency}
                  onChange={(v) => update("valuationCurrency", v)}
                  options={CURRENCY_OPTS}
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

            <DerivedShares
              valuationRaw={form.preMoneyValuation}
              currency={form.valuationCurrency}
              currentTotalShares={currentTotalShares}
              dict={dict}
              locale={locale}
            />
          </section>
        </>
      )}

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 hairline-t pt-6">
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? dict.savingBtn : dict.saveBtn}
        </button>
      </div>
    </form>
  );
}

function DerivedShares({
  valuationRaw,
  currency,
  currentTotalShares,
  dict,
  locale,
}: {
  valuationRaw: string;
  currency: string;
  currentTotalShares: number;
  dict: EditDict;
  locale: string;
}) {
  const val = Number.parseFloat(valuationRaw);
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtInt = (n: number) => n.toLocaleString(locale);

  // El total de participaciones de un proyecto YA EMITIDO queda fijo (cambiarlo
  // rompería el cap table). Si el founder ajusta la valoración, recalculamos el
  // precio efectivo sobre el total existente — sin algoritmo de derivación.
  const hasValuation = Number.isFinite(val) && val > 0;
  const effectivePrice =
    hasValuation && currentTotalShares > 0 ? val / currentTotalShares : null;

  return (
    <div className="hairline p-4 bg-paper space-y-3 font-mono text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="eyebrow !text-navy/40">{dict.pricePerShareLabel}</p>
          <p className="mt-1 text-navy">
            {effectivePrice !== null ? fmtMoney(effectivePrice) : "—"}
          </p>
        </div>
        <div>
          <p className="eyebrow !text-navy/40">{dict.totalSharesLabel}</p>
          <p className="mt-1 text-navy">{fmtInt(currentTotalShares)}</p>
        </div>
      </div>

      <p className="eyebrow !text-navy/55 leading-relaxed">
        {dict.emissionLegend}
      </p>
    </div>
  );
}

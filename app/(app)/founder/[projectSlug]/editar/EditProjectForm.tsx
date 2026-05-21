"use client";

import { useState, useTransition } from "react";
import { updateProjectInfoAction } from "./actions";
import { derivePriceAndShares } from "@/lib/utils/shares";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";
import { FileUpload } from "@/components/ui/FileUpload";

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
};

const STAGES: Array<{ id: Initial["stage"]; label: string }> = [
  { id: "IDEA", label: "Idea" },
  { id: "PRE_SEED", label: "Pre-seed" },
  { id: "SEED", label: "Seed" },
  { id: "EARLY_REVENUE", label: "Early revenue" },
  { id: "GROWTH", label: "Growth" },
  { id: "SCALE", label: "Scale" },
];

const KINDS: Array<{ id: Initial["kind"]; label: string }> = [
  { id: "REAL_ESTATE", label: "Inmobiliario" },
  { id: "MERCHANDISE", label: "Mercancía" },
  { id: "STARTUP", label: "Otro" },
];

const DOC_ACCEPT = ".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg";
const DOC_HELP = "PDF, Word, Excel o imagen (máx. 25 MB).";

export function EditProjectForm({
  projectSlug,
  initial,
  hasStartupProfile,
  maxAvailable,
  currentTotalShares,
  openLeadsCount,
}: {
  projectSlug: string;
  initial: Initial;
  hasStartupProfile: boolean;
  maxAvailable: number;
  currentTotalShares: number;
  openLeadsCount: number;
}) {
  const [form, setForm] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof Initial>(key: K, value: Initial[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await updateProjectInfoAction(projectSlug, formData);
      if (r && r.ok === false) setError(r.error);
    });
  }

  return (
    <form action={onSubmit} className="mt-10 space-y-10">
      {/* Identidad */}
      <section className="space-y-5">
        <p className="eyebrow">Identidad</p>
        <FloatingInput
          id="name"
          label="Nombre"
          value={form.name}
          onChange={(v) => update("name", v)}
          required
        />

        <div>
          <FloatingInput
            id="oneLiner"
            label="One-liner"
            value={form.oneLiner}
            onChange={(v) => update("oneLiner", v)}
            maxLength={160}
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            {form.oneLiner.length} / 160 — en una frase, qué hace tu proyecto.
          </p>
        </div>

        <FloatingTextarea
          id="shortPitch"
          label="Pitch corto"
          value={form.shortPitch}
          onChange={(v) => update("shortPitch", v)}
          rows={2}
          maxLength={280}
        />

        <FloatingTextarea
          id="description"
          label="Descripción larga"
          value={form.description}
          onChange={(v) => update("description", v)}
          rows={6}
        />
      </section>

      {hasStartupProfile && (
        <>
          {/* Categorización */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Categorización</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <FloatingSelect
                  id="kind"
                  label="Tipo"
                  value={form.kind}
                  onChange={(v) => update("kind", v as Initial["kind"])}
                  options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
                />
                <input type="hidden" name="kind" value={form.kind} />
              </div>
              <FloatingInput
                id="location"
                label="Ubicación"
                value={form.location}
                onChange={(v) => update("location", v)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <FloatingInput
                id="sector"
                label="Sector"
                value={form.sector}
                onChange={(v) => update("sector", v)}
              />
              <div>
                <FloatingSelect
                  id="stage"
                  label="Stage"
                  value={form.stage}
                  onChange={(v) => update("stage", v as Initial["stage"])}
                  options={STAGES.map((s) => ({ value: s.id, label: s.label }))}
                />
                <input type="hidden" name="stage" value={form.stage} />
              </div>
            </div>

            <FloatingInput
              id="websiteUrl"
              type="url"
              inputMode="url"
              label="Sitio web (opcional)"
              value={form.websiteUrl}
              onChange={(v) => update("websiteUrl", v)}
            />
          </section>

          {/* Documentos */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Documentos</p>
            <p className="text-navy/75 leading-relaxed">
              Subí los documentos clave de tu proyecto.
            </p>
            <div>
              <FloatingInput
                id="videoUrl"
                type="url"
                inputMode="url"
                label="URL del video (YouTube / Vimeo)"
                value={form.videoUrl}
                onChange={(v) => update("videoUrl", v)}
              />
              <p className="eyebrow !text-navy/40 mt-1.5">
                Si pegás un link de YouTube o Vimeo se muestra como video embebido en la ficha.
              </p>
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.pitchDeckUrl || undefined}
                onUploaded={(url) => update("pitchDeckUrl", url)}
                label="Pitch deck"
                helperText={DOC_HELP}
              />
              <input type="hidden" name="pitchDeckUrl" value={form.pitchDeckUrl} />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.dataRoomUrl || undefined}
                onUploaded={(url) => update("dataRoomUrl", url)}
                label="Data room"
                helperText={DOC_HELP}
              />
              <input type="hidden" name="dataRoomUrl" value={form.dataRoomUrl} />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.projectionsUrl || undefined}
                onUploaded={(url) => update("projectionsUrl", url)}
                label="Proyecciones financieras"
                helperText={DOC_HELP}
              />
              <input type="hidden" name="projectionsUrl" value={form.projectionsUrl} />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.planNegociosUrl || undefined}
                onUploaded={(url) => update("planNegociosUrl", url)}
                label="Plan de negocios inicial"
                helperText={DOC_HELP}
              />
              <input type="hidden" name="planNegociosUrl" value={form.planNegociosUrl} />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.estrategiasPeriodicasUrl || undefined}
                onUploaded={(url) => update("estrategiasPeriodicasUrl", url)}
                label="Objetivos y estrategias periódicas"
                helperText={DOC_HELP}
              />
              <input
                type="hidden"
                name="estrategiasPeriodicasUrl"
                value={form.estrategiasPeriodicasUrl}
              />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.estadosFinancierosUrl || undefined}
                onUploaded={(url) => update("estadosFinancierosUrl", url)}
                label="Estados financieros trimestrales"
                helperText={DOC_HELP}
              />
              <input
                type="hidden"
                name="estadosFinancierosUrl"
                value={form.estadosFinancierosUrl}
              />
            </div>
            <div>
              <FileUpload
                scope="project-doc"
                accept={DOC_ACCEPT}
                maxSizeMb={25}
                currentUrl={form.estrategiaEmisionUrl || undefined}
                onUploaded={(url) => update("estrategiaEmisionUrl", url)}
                label="Estrategia de emisión de nuevas participaciones"
                helperText={DOC_HELP}
              />
              <input
                type="hidden"
                name="estrategiaEmisionUrl"
                value={form.estrategiaEmisionUrl}
              />
            </div>
          </section>

          {/* ¿Qué hace? */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">¿Qué hace?</p>
            <FloatingTextarea
              id="problemStatement"
              label="Problema"
              value={form.problemStatement}
              onChange={(v) => update("problemStatement", v)}
              rows={3}
            />
            <FloatingTextarea
              id="solutionStatement"
              label="Solución"
              value={form.solutionStatement}
              onChange={(v) => update("solutionStatement", v)}
              rows={3}
            />
            <FloatingTextarea
              id="businessModel"
              label="Modelo de negocio"
              value={form.businessModel}
              onChange={(v) => update("businessModel", v)}
              rows={2}
            />
          </section>

          {/* Estructura y respaldo */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Estructura y respaldo</p>
            <FloatingTextarea
              id="assetBackingNote"
              label="Activo respaldado (opcional)"
              value={form.assetBackingNote}
              onChange={(v) => update("assetBackingNote", v)}
              rows={3}
              maxLength={2000}
            />
            <FloatingTextarea
              id="equityStructureNote"
              label="Estructura accionaria (opcional)"
              value={form.equityStructureNote}
              onChange={(v) => update("equityStructureNote", v)}
              rows={3}
              maxLength={2000}
            />
          </section>

          {/* Políticas */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Políticas</p>
            <p className="text-navy/75 leading-relaxed">
              Texto informativo que verán los miembros con acceso a la información del proyecto.
              Todos los campos son opcionales.
            </p>
            <FloatingTextarea
              id="policyShares"
              label="Política de acciones (opcional)"
              value={form.policyShares}
              onChange={(v) => update("policyShares", v)}
              rows={3}
              maxLength={2000}
            />
            <FloatingTextarea
              id="policyDividends"
              label="Política de dividendos (opcional)"
              value={form.policyDividends}
              onChange={(v) => update("policyDividends", v)}
              rows={3}
              maxLength={2000}
            />
            <FloatingInput
              id="dividendsFrequency"
              label="Frecuencia de dividendos (opcional)"
              value={form.dividendsFrequency}
              onChange={(v) => update("dividendsFrequency", v)}
              maxLength={120}
            />
          </section>

          {/* Acciones a la venta */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Acciones a la venta</p>
            <p className="text-navy/75 leading-relaxed">
              Cuántas acciones de tu compañía querés poner disponibles para que los miembros
              participen. Podés ajustarlo en cualquier momento.
            </p>
            <div>
              <FloatingInput
                id="availableShares"
                type="number"
                label={`Disponibles (máximo ${maxAvailable.toLocaleString("es-MX")})`}
                value={String(form.availableShares)}
                onChange={(v) =>
                  update("availableShares", Number.parseInt(v || "0", 10) || 0)
                }
              />
              <p className="eyebrow !text-navy/40 mt-1.5">
                Hoy: {initial.availableShares.toLocaleString("es-MX")} disponibles.
              </p>
              {form.availableShares === 0 && openLeadsCount > 0 && (
                <div className="hairline mt-3 p-3 bg-paper">
                  <p className="eyebrow !text-gold">
                    ⚠ Tenés {openLeadsCount}{" "}
                    {openLeadsCount === 1 ? "lead abierto" : "leads abiertos"}
                  </p>
                  <p className="mt-2 text-sm text-navy/85 leading-relaxed">
                    Si dejás disponibles en cero, esos pedidos quedan imposibles de cumplir. Revisalos
                    en{" "}
                    <a
                      href={`/founder/${projectSlug}/leads`}
                      className="!text-gold hover:!text-navy underline"
                    >
                      Interés de compra
                    </a>{" "}
                    antes de bajar el pool.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Valoración */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Valoración</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <FloatingInput
                id="preMoneyValuation"
                type="number"
                step="any"
                label="Monto"
                value={form.preMoneyValuation}
                onChange={(v) => update("preMoneyValuation", v)}
              />
              <div>
                <FloatingSelect
                  id="valuationCurrency"
                  label="Moneda"
                  value={form.valuationCurrency}
                  onChange={(v) => update("valuationCurrency", v)}
                  options={[
                    { value: "USD", label: "USD · Dólares" },
                    { value: "MXN", label: "MXN · Pesos" },
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
              label="Monto a levantar (opcional)"
              value={form.targetRaiseAmount}
              onChange={(v) => update("targetRaiseAmount", v)}
            />

            {/* Derivado a partir de la valoración */}
            <DerivedShares
              valuationRaw={form.preMoneyValuation}
              currency={form.valuationCurrency}
              currentTotalShares={currentTotalShares}
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
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function DerivedShares({
  valuationRaw,
  currency,
  currentTotalShares,
}: {
  valuationRaw: string;
  currency: string;
  currentTotalShares: number;
}) {
  const val = Number.parseFloat(valuationRaw);
  if (!Number.isFinite(val) || val <= 0) {
    return (
      <p className="eyebrow !text-navy/40">
        Cargá la valoración para ver el precio por acción derivado.
      </p>
    );
  }
  const { pricePerShare, totalShares: derivedShares } = derivePriceAndShares(val);
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtInt = (n: number) => n.toLocaleString("es-MX");

  // El cap table ya está creado con `currentTotalShares` — la sugerencia derivada
  // solo aplica a proyectos nuevos. Si difiere, avisamos al founder.
  const mismatch = derivedShares !== currentTotalShares;
  // Precio efectivo según las acciones que están en DB hoy
  const effectivePrice = currentTotalShares > 0 ? val / currentTotalShares : pricePerShare;

  return (
    <div className="hairline p-4 bg-paper space-y-3 font-mono text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="eyebrow !text-navy/40">Precio por acción (efectivo)</p>
          <p className="mt-1 text-navy">{fmtMoney(effectivePrice)}</p>
        </div>
        <div>
          <p className="eyebrow !text-navy/40">Acciones totales</p>
          <p className="mt-1 text-navy">{fmtInt(currentTotalShares)}</p>
        </div>
      </div>

      {!mismatch && (
        <p className="eyebrow">
          La valoración divide limpio: el precio por acción es múltiplo de 10.
        </p>
      )}

      {mismatch && (
        <div className="hairline-t pt-3 space-y-2">
          <p className="eyebrow !text-gold">⚠ Aviso</p>
          <p className="text-navy/85 text-xs leading-relaxed">
            Con esta valoración, lo "limpio" sería <span className="font-mono">{fmtMoney(pricePerShare)}/acción</span>{" "}
            × <span className="font-mono">{fmtInt(derivedShares)} acciones</span>. Pero tu proyecto
            ya tiene <span className="font-mono">{fmtInt(currentTotalShares)}</span> acciones
            emitidas, así que cambiar el total ahora rompería el cap table.
          </p>
          <p className="text-navy/85 text-xs leading-relaxed">
            Podés actualizar la valoración: el precio por acción efectivo se recalcula sobre las
            acciones existentes. Si querés reemitir el cap table, contactá al equipo de AJDUT.
          </p>
        </div>
      )}
    </div>
  );
}

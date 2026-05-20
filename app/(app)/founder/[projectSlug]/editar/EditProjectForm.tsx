"use client";

import { useState, useTransition } from "react";
import { updateProjectInfoAction } from "./actions";
import { derivePriceAndShares } from "@/lib/utils/shares";

type Initial = {
  name: string;
  shortPitch: string;
  description: string;
  kind: "STARTUP" | "REAL_ESTATE" | "MERCHANDISE";
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
        <Field label="Nombre" htmlFor="name">
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input"
            required
          />
        </Field>

        <Field label="One-liner (máx 160 caracteres)" htmlFor="oneLiner">
          <input
            id="oneLiner"
            name="oneLiner"
            value={form.oneLiner}
            onChange={(e) => update("oneLiner", e.target.value)}
            maxLength={160}
            className="input"
            placeholder="En una frase, qué hace tu proyecto"
          />
          <span className="eyebrow mt-2 block">{form.oneLiner.length} / 160</span>
        </Field>

        <Field label="Pitch corto (máx 280 caracteres)" htmlFor="shortPitch">
          <textarea
            id="shortPitch"
            name="shortPitch"
            value={form.shortPitch}
            onChange={(e) => update("shortPitch", e.target.value)}
            maxLength={280}
            rows={2}
            className="input"
          />
          <span className="eyebrow mt-2 block">{form.shortPitch.length} / 280</span>
        </Field>

        <Field label="Descripción larga" htmlFor="description">
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={6}
            className="input"
            placeholder="Contexto, mercado, por qué ahora, lo que quieras contar."
          />
        </Field>
      </section>

      {hasStartupProfile && (
        <>
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Categorización</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo" htmlFor="kind">
                <select
                  id="kind"
                  name="kind"
                  value={form.kind}
                  onChange={(e) => update("kind", e.target.value as Initial["kind"])}
                  className="input"
                >
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ubicación" htmlFor="location">
                <input
                  id="location"
                  name="location"
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  className="input"
                  placeholder="Ciudad de México · Buenos Aires · etc."
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Sector" htmlFor="sector">
                <input
                  id="sector"
                  name="sector"
                  value={form.sector}
                  onChange={(e) => update("sector", e.target.value)}
                  className="input"
                  placeholder="Fintech · SaaS B2B"
                />
              </Field>
              <Field label="Stage" htmlFor="stage">
                <select
                  id="stage"
                  name="stage"
                  value={form.stage}
                  onChange={(e) => update("stage", e.target.value as Initial["stage"])}
                  className="input"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Sitio web (opcional)" htmlFor="websiteUrl">
              <input
                id="websiteUrl"
                name="websiteUrl"
                value={form.websiteUrl}
                onChange={(e) => update("websiteUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://pushka.io"
              />
            </Field>
          </section>

          {/* Documentos */}
          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Documentos</p>
            <p className="text-navy/75 leading-relaxed">
              Compartí los documentos clave de tu proyecto. Pegá las URLs de Google Drive,
              Dropbox, Notion u otro servicio donde los tengas hospedados. AJDUT solo guarda los
              links — no hostea los archivos.
            </p>
            <Field label="URL del video (YouTube / Vimeo)" htmlFor="videoUrl">
              <input
                id="videoUrl"
                name="videoUrl"
                value={form.videoUrl}
                onChange={(e) => update("videoUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://youtu.be/..."
              />
              <p className="mt-2 eyebrow">
                Si pegás un link de YouTube o Vimeo se muestra como video embebido en la ficha.
              </p>
            </Field>
            <Field label="Pitch deck (URL)" htmlFor="pitchDeckUrl">
              <input
                id="pitchDeckUrl"
                name="pitchDeckUrl"
                value={form.pitchDeckUrl}
                onChange={(e) => update("pitchDeckUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Data room (URL)" htmlFor="dataRoomUrl">
              <input
                id="dataRoomUrl"
                name="dataRoomUrl"
                value={form.dataRoomUrl}
                onChange={(e) => update("dataRoomUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://www.notion.so/..."
              />
              <p className="mt-2 eyebrow">
                Conviene que el documento esté protegido (acceso solo con link o cuenta).
              </p>
            </Field>
            <Field label="Proyecciones financieras (URL)" htmlFor="projectionsUrl">
              <input
                id="projectionsUrl"
                name="projectionsUrl"
                value={form.projectionsUrl}
                onChange={(e) => update("projectionsUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Plan de negocios inicial (URL)" htmlFor="planNegociosUrl">
              <input
                id="planNegociosUrl"
                name="planNegociosUrl"
                value={form.planNegociosUrl}
                onChange={(e) => update("planNegociosUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Objetivos y estrategias periódicas (URL)" htmlFor="estrategiasPeriodicasUrl">
              <input
                id="estrategiasPeriodicasUrl"
                name="estrategiasPeriodicasUrl"
                value={form.estrategiasPeriodicasUrl}
                onChange={(e) => update("estrategiasPeriodicasUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://www.notion.so/..."
              />
            </Field>
            <Field label="Estados financieros trimestrales (URL)" htmlFor="estadosFinancierosUrl">
              <input
                id="estadosFinancierosUrl"
                name="estadosFinancierosUrl"
                value={form.estadosFinancierosUrl}
                onChange={(e) => update("estadosFinancierosUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Estrategia de emisión de nuevas participaciones (URL)" htmlFor="estrategiaEmisionUrl">
              <input
                id="estrategiaEmisionUrl"
                name="estrategiaEmisionUrl"
                value={form.estrategiaEmisionUrl}
                onChange={(e) => update("estrategiaEmisionUrl", e.target.value)}
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
              />
            </Field>
          </section>

          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">¿Qué hace?</p>
            <Field label="Problema" htmlFor="problemStatement">
              <textarea
                id="problemStatement"
                name="problemStatement"
                value={form.problemStatement}
                onChange={(e) => update("problemStatement", e.target.value)}
                rows={3}
                className="input"
                placeholder="Qué problema concreto resuelve tu proyecto."
              />
            </Field>
            <Field label="Solución" htmlFor="solutionStatement">
              <textarea
                id="solutionStatement"
                name="solutionStatement"
                value={form.solutionStatement}
                onChange={(e) => update("solutionStatement", e.target.value)}
                rows={3}
                className="input"
                placeholder="Cómo lo resuelve."
              />
            </Field>
            <Field label="Modelo de negocio" htmlFor="businessModel">
              <textarea
                id="businessModel"
                name="businessModel"
                value={form.businessModel}
                onChange={(e) => update("businessModel", e.target.value)}
                rows={2}
                className="input"
                placeholder="Cómo monetiza el proyecto."
              />
            </Field>
          </section>

          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Estructura y respaldo</p>
            <Field label="Activo respaldado (opcional)" htmlFor="assetBackingNote">
              <textarea
                id="assetBackingNote"
                name="assetBackingNote"
                value={form.assetBackingNote}
                onChange={(e) => update("assetBackingNote", e.target.value)}
                rows={3}
                maxLength={2000}
                className="input"
                placeholder="Describí qué activo concreto respalda al proyecto (inmueble, mercancía, contrato, propiedad intelectual, etc.)."
              />
            </Field>
            <Field label="Estructura accionaria (opcional)" htmlFor="equityStructureNote">
              <textarea
                id="equityStructureNote"
                name="equityStructureNote"
                value={form.equityStructureNote}
                onChange={(e) => update("equityStructureNote", e.target.value)}
                rows={3}
                maxLength={2000}
                className="input"
                placeholder="Cómo está repartida la propiedad: clases de acciones, founders, participaciones previas, opciones, etc."
              />
            </Field>
          </section>

          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Acciones a la venta</p>
            <p className="text-navy/75 leading-relaxed">
              Cuántas acciones de tu compañía querés poner disponibles para que los miembros
              participen. Podés ajustarlo en cualquier momento.
            </p>
            <Field label={`Disponibles (máximo ${maxAvailable.toLocaleString("es-MX")})`} htmlFor="availableShares">
              <input
                id="availableShares"
                name="availableShares"
                type="number"
                min="0"
                max={maxAvailable}
                step="1"
                value={form.availableShares}
                onChange={(e) =>
                  update("availableShares", Number.parseInt(e.target.value || "0", 10) || 0)
                }
                className="input font-mono"
              />
              <p className="mt-2 eyebrow">
                Hoy: {initial.availableShares.toLocaleString("es-MX")} disponibles.
              </p>
              {form.availableShares === 0 && openLeadsCount > 0 && (
                <div className="hairline mt-3 p-3 bg-paper">
                  <p className="eyebrow !text-gold">⚠ Tenés {openLeadsCount} {openLeadsCount === 1 ? "lead abierto" : "leads abiertos"}</p>
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
            </Field>
          </section>

          <section className="space-y-5 hairline-t pt-8">
            <p className="eyebrow">Valoración</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Monto" htmlFor="preMoneyValuation">
                <input
                  id="preMoneyValuation"
                  name="preMoneyValuation"
                  value={form.preMoneyValuation}
                  onChange={(e) => update("preMoneyValuation", e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  placeholder="12500000"
                />
              </Field>
              <Field label="Moneda" htmlFor="valuationCurrency">
                <select
                  id="valuationCurrency"
                  name="valuationCurrency"
                  value={form.valuationCurrency}
                  onChange={(e) => update("valuationCurrency", e.target.value)}
                  className="input"
                >
                  <option value="USD">USD · Dólares</option>
                  <option value="MXN">MXN · Pesos</option>
                </select>
              </Field>
            </div>

            <Field label="Monto a levantar (opcional)" htmlFor="targetRaiseAmount">
              <input
                id="targetRaiseAmount"
                name="targetRaiseAmount"
                value={form.targetRaiseAmount}
                onChange={(e) => update("targetRaiseAmount", e.target.value)}
                type="number"
                step="0.01"
                min="0"
                className="input font-mono"
                placeholder="250000"
              />
            </Field>

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

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 0.5px solid rgba(26, 26, 46, 0.4);
          background: #f5f3ee;
          padding: 0.5rem 0.75rem;
          font-family: var(--font-inter);
          color: #1a1a2e;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #1a1a2e;
        }
      `}</style>
    </form>
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
      <label htmlFor={htmlFor} className="eyebrow block mb-2">
        {label}
      </label>
      {children}
    </div>
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

"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "./actions";
import { derivePriceAndShares } from "@/lib/utils/shares";

const STAGES = [
  { id: "IDEA", label: "Idea" },
  { id: "PRE_SEED", label: "Pre-seed" },
  { id: "SEED", label: "Seed" },
  { id: "EARLY_REVENUE", label: "Early revenue" },
  { id: "GROWTH", label: "Growth" },
  { id: "SCALE", label: "Scale" },
] as const;

const KINDS = [
  { id: "REAL_ESTATE", label: "Inmobiliario" },
  { id: "MERCHANDISE", label: "Mercancía" },
  { id: "STARTUP", label: "Otro" },
] as const;

export function NewProjectForm() {
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    jurisdiction: "",
    kind: "STARTUP" as (typeof KINDS)[number]["id"],
    sector: "",
    stage: "IDEA" as (typeof STAGES)[number]["id"],
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
    assetBackingNote: "",
    equityStructureNote: "",
    projectionsUrl: "",
    planNegociosUrl: "",
    estrategiasPeriodicasUrl: "",
    estadosFinancierosUrl: "",
    estrategiaEmisionUrl: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const valuation = Number.parseFloat(form.preMoneyValuation);
  const valuationValid = Number.isFinite(valuation) && valuation > 0;
  const derived = valuationValid ? derivePriceAndShares(valuation) : null;

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createProjectAction(formData);
      if (r && r.ok === false) setError(r.error);
    });
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: form.valuationCurrency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtInt = (n: number) => n.toLocaleString("es-MX");

  return (
    <form action={onSubmit} className="mt-10 space-y-10">
      {/* Identidad */}
      <section className="space-y-5">
        <p className="eyebrow">Identidad</p>

        <Field label="Nombre del proyecto" htmlFor="name">
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            placeholder="Ej. Pushka SAS"
            className="input"
          />
        </Field>

        <Field label="One-liner (máx 160 caracteres)" htmlFor="oneLiner">
          <input
            id="oneLiner"
            name="oneLiner"
            maxLength={160}
            value={form.oneLiner}
            onChange={(e) => update("oneLiner", e.target.value)}
            required
            placeholder="En una frase, qué hace tu empresa"
            className="input"
          />
          <span className="eyebrow mt-2 block">{form.oneLiner.length} / 160</span>
        </Field>

        <Field label="Descripción larga" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={5}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            required
            placeholder="Contexto, mercado, por qué ahora, etc."
            className="input"
          />
        </Field>
      </section>

      {/* Legal */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Datos legales</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razón social" htmlFor="legalName">
            <input
              id="legalName"
              name="legalName"
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              placeholder="Pushka Servicios SAS"
              className="input"
            />
            <span className="eyebrow mt-2 block">Si está en blanco, usamos el nombre del proyecto.</span>
          </Field>
          <Field label="Jurisdicción" htmlFor="jurisdiction">
            <input
              id="jurisdiction"
              name="jurisdiction"
              value={form.jurisdiction}
              onChange={(e) => update("jurisdiction", e.target.value)}
              required
              placeholder="MX-CDMX, UY-Montevideo, etc."
              className="input"
            />
          </Field>
        </div>
      </section>

      {/* Categorización */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Categorización</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo" htmlFor="kind">
            <select
              id="kind"
              name="kind"
              value={form.kind}
              onChange={(e) => update("kind", e.target.value as typeof form.kind)}
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
              placeholder="Ciudad de México · Buenos Aires · etc."
              className="input"
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
              required
              placeholder="Fintech · SaaS B2B"
              className="input"
            />
          </Field>
          <Field label="Stage" htmlFor="stage">
            <select
              id="stage"
              name="stage"
              value={form.stage}
              onChange={(e) => update("stage", e.target.value as typeof form.stage)}
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
            type="url"
            value={form.websiteUrl}
            onChange={(e) => update("websiteUrl", e.target.value)}
            placeholder="https://miempresa.com"
            className="input"
          />
        </Field>
      </section>

      {/* ¿Qué hace? */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">¿Qué hace tu empresa?</p>
        <Field label="Problema que resuelve" htmlFor="problemStatement">
          <textarea
            id="problemStatement"
            name="problemStatement"
            rows={3}
            value={form.problemStatement}
            onChange={(e) => update("problemStatement", e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="Solución" htmlFor="solutionStatement">
          <textarea
            id="solutionStatement"
            name="solutionStatement"
            rows={3}
            value={form.solutionStatement}
            onChange={(e) => update("solutionStatement", e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="Modelo de negocio" htmlFor="businessModel">
          <textarea
            id="businessModel"
            name="businessModel"
            rows={2}
            value={form.businessModel}
            onChange={(e) => update("businessModel", e.target.value)}
            required
            className="input"
          />
        </Field>
      </section>

      {/* Estructura y respaldo */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Estructura y respaldo</p>
        <Field label="Activo respaldado (opcional)" htmlFor="assetBackingNote">
          <textarea
            id="assetBackingNote"
            name="assetBackingNote"
            rows={3}
            maxLength={2000}
            value={form.assetBackingNote}
            onChange={(e) => update("assetBackingNote", e.target.value)}
            placeholder="Describí qué activo concreto respalda al proyecto (inmueble, mercancía, contrato, propiedad intelectual, etc.)."
            className="input"
          />
        </Field>
        <Field label="Estructura accionaria (opcional)" htmlFor="equityStructureNote">
          <textarea
            id="equityStructureNote"
            name="equityStructureNote"
            rows={3}
            maxLength={2000}
            value={form.equityStructureNote}
            onChange={(e) => update("equityStructureNote", e.target.value)}
            placeholder="Cómo está repartida la propiedad: clases de acciones, founders, participaciones previas, opciones, etc."
            className="input"
          />
        </Field>
      </section>

      {/* Documentos del proyecto */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Documentos del proyecto</p>
        <p className="text-navy/75 leading-relaxed">
          Pegá las URLs a documentos hospedados en Google Drive, Dropbox, Notion u otro servicio.
          Todos son opcionales — los podés sumar después desde la pantalla de edición.
        </p>
        <Field label="Proyecciones financieras (URL)" htmlFor="projectionsUrl">
          <input
            id="projectionsUrl"
            name="projectionsUrl"
            type="url"
            value={form.projectionsUrl}
            onChange={(e) => update("projectionsUrl", e.target.value)}
            placeholder="https://drive.google.com/..."
            className="input"
          />
        </Field>
        <Field label="Plan de negocios inicial (URL)" htmlFor="planNegociosUrl">
          <input
            id="planNegociosUrl"
            name="planNegociosUrl"
            type="url"
            value={form.planNegociosUrl}
            onChange={(e) => update("planNegociosUrl", e.target.value)}
            placeholder="https://drive.google.com/..."
            className="input"
          />
        </Field>
        <Field label="Objetivos y estrategias periódicas (URL)" htmlFor="estrategiasPeriodicasUrl">
          <input
            id="estrategiasPeriodicasUrl"
            name="estrategiasPeriodicasUrl"
            type="url"
            value={form.estrategiasPeriodicasUrl}
            onChange={(e) => update("estrategiasPeriodicasUrl", e.target.value)}
            placeholder="https://www.notion.so/..."
            className="input"
          />
        </Field>
        <Field label="Estados financieros trimestrales (URL)" htmlFor="estadosFinancierosUrl">
          <input
            id="estadosFinancierosUrl"
            name="estadosFinancierosUrl"
            type="url"
            value={form.estadosFinancierosUrl}
            onChange={(e) => update("estadosFinancierosUrl", e.target.value)}
            placeholder="https://drive.google.com/..."
            className="input"
          />
        </Field>
        <Field label="Estrategia de emisión de nuevas participaciones (URL)" htmlFor="estrategiaEmisionUrl">
          <input
            id="estrategiaEmisionUrl"
            name="estrategiaEmisionUrl"
            type="url"
            value={form.estrategiaEmisionUrl}
            onChange={(e) => update("estrategiaEmisionUrl", e.target.value)}
            placeholder="https://drive.google.com/..."
            className="input"
          />
        </Field>
      </section>

      {/* Valoración */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Valoración</p>
        <p className="text-navy/75 leading-relaxed">
          A partir de la valoración calculamos el precio por acción (múltiplo de 10) y el total de
          acciones de tu empresa. AJDUT mantiene el 10% institucional; el resto queda como pool
          disponible para los miembros.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Monto" htmlFor="preMoneyValuation">
            <input
              id="preMoneyValuation"
              name="preMoneyValuation"
              type="number"
              min="0"
              step="1000"
              value={form.preMoneyValuation}
              onChange={(e) => update("preMoneyValuation", e.target.value)}
              required
              placeholder="1000000"
              className="input font-mono"
            />
          </Field>
          <Field label="Moneda" htmlFor="valuationCurrency">
            <select
              id="valuationCurrency"
              name="valuationCurrency"
              value={form.valuationCurrency}
              onChange={(e) => update("valuationCurrency", e.target.value as "USD" | "MXN")}
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
            type="number"
            min="0"
            step="1000"
            value={form.targetRaiseAmount}
            onChange={(e) => update("targetRaiseAmount", e.target.value)}
            placeholder="250000"
            className="input font-mono"
          />
        </Field>

        {derived && (
          <div className="hairline p-4 bg-paper grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-sm">
            <div>
              <p className="eyebrow !text-navy/40">Precio por acción</p>
              <p className="mt-1 text-navy">{fmtMoney(derived.pricePerShare)}</p>
            </div>
            <div>
              <p className="eyebrow !text-navy/40">Acciones totales</p>
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
        <p className="text-navy/75 leading-relaxed text-sm">
          Al crear el proyecto queda en estado <strong>pendiente de aprobación</strong>. El equipo de
          AJDUT revisa los datos antes de activarlo y notificarte por email.
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Creando proyecto…" : "Crear proyecto y enviar para revisión"}
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

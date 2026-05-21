"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "./actions";
import { derivePriceAndShares } from "@/lib/utils/shares";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";
import { FileUpload } from "@/components/ui/FileUpload";

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

const DOC_ACCEPT = ".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg";
const DOC_HELP =
  "PDF, Word, Excel o imagen (máx. 25 MB). También podés pegar un link público.";

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

        <FloatingInput
          id="name"
          label="Nombre del proyecto"
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
            required
          />
          <p className="eyebrow !text-navy/40 mt-1.5">
            {form.oneLiner.length} / 160 — en una frase, qué hace tu empresa.
          </p>
        </div>

        <FloatingTextarea
          id="description"
          label="Descripción larga"
          value={form.description}
          onChange={(v) => update("description", v)}
          rows={5}
          required
        />
      </section>

      {/* Legal */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Datos legales</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <FloatingInput
              id="legalName"
              label="Razón social"
              value={form.legalName}
              onChange={(v) => update("legalName", v)}
            />
            <p className="eyebrow !text-navy/40 mt-1.5">
              Si está en blanco, usamos el nombre del proyecto.
            </p>
          </div>
          <FloatingInput
            id="jurisdiction"
            label="Jurisdicción"
            value={form.jurisdiction}
            onChange={(v) => update("jurisdiction", v)}
            required
          />
        </div>
      </section>

      {/* Categorización */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Categorización</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <FloatingSelect
              id="kind"
              label="Tipo"
              value={form.kind}
              onChange={(v) => update("kind", v as typeof form.kind)}
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
            required
          />
          <div>
            <FloatingSelect
              id="stage"
              label="Stage"
              value={form.stage}
              onChange={(v) => update("stage", v as typeof form.stage)}
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

      {/* ¿Qué hace? */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">¿Qué hace tu empresa?</p>
        <FloatingTextarea
          id="problemStatement"
          label="Problema que resuelve"
          value={form.problemStatement}
          onChange={(v) => update("problemStatement", v)}
          rows={3}
          required
        />
        <FloatingTextarea
          id="solutionStatement"
          label="Solución"
          value={form.solutionStatement}
          onChange={(v) => update("solutionStatement", v)}
          rows={3}
          required
        />
        <FloatingTextarea
          id="businessModel"
          label="Modelo de negocio"
          value={form.businessModel}
          onChange={(v) => update("businessModel", v)}
          rows={2}
          required
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

      {/* Documentos del proyecto */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Documentos del proyecto</p>
        <p className="text-navy/75 leading-relaxed">
          Subí los documentos clave del proyecto o pegá un link público (Google Drive,
          Dropbox, Notion). Todos son opcionales — los podés sumar después desde la
          pantalla de edición.
        </p>
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
      </section>

      {/* Valoración */}
      <section className="space-y-5 hairline-t pt-8">
        <p className="eyebrow">Valoración</p>
        <p className="text-navy/75 leading-relaxed">
          A partir de la valoración calculamos el precio por acción (múltiplo de 10) y el total de
          acciones de tu empresa. AJDUT mantiene el 10% institucional; el resto queda como pool
          disponible para los miembros.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <FloatingInput
            id="preMoneyValuation"
            type="number"
            step="any"
            label="Monto"
            value={form.preMoneyValuation}
            onChange={(v) => update("preMoneyValuation", v)}
            required
          />
          <div>
            <FloatingSelect
              id="valuationCurrency"
              label="Moneda"
              value={form.valuationCurrency}
              onChange={(v) => update("valuationCurrency", v as "USD" | "MXN")}
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
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { addMetricAction, removeMetricAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  FloatingInput,
  FloatingSelect,
  FloatingDate,
} from "@/components/ui/Floating";

type Kind =
  | "MRR"
  | "ARR"
  | "GMV"
  | "ACTIVE_USERS"
  | "PAYING_CUSTOMERS"
  | "CHURN_RATE"
  | "BURN_RATE"
  | "RUNWAY_MONTHS"
  | "CAC"
  | "LTV"
  | "GROSS_MARGIN"
  | "HEADCOUNT"
  | "CUSTOM";

type Metric = {
  id: string;
  kind: Kind;
  customLabel: string;
  value: number;
  unit: string;
  asOf: string;
  visibility: "PRIVATE" | "PUBLIC_TO_HOLDERS";
};

const KIND_LABEL: Record<Kind, string> = {
  MRR: "MRR",
  ARR: "ARR",
  GMV: "GMV",
  ACTIVE_USERS: "Usuarios activos",
  PAYING_CUSTOMERS: "Clientes pagos",
  CHURN_RATE: "Churn rate",
  BURN_RATE: "Burn rate",
  RUNWAY_MONTHS: "Runway (meses)",
  CAC: "CAC",
  LTV: "LTV",
  GROSS_MARGIN: "Gross margin",
  HEADCOUNT: "Headcount",
  CUSTOM: "Personalizada",
};

const KIND_DEFAULT_UNIT: Record<Kind, string> = {
  MRR: "USD",
  ARR: "USD",
  GMV: "USD",
  ACTIVE_USERS: "count",
  PAYING_CUSTOMERS: "count",
  CHURN_RATE: "%",
  BURN_RATE: "USD",
  RUNWAY_MONTHS: "months",
  CAC: "USD",
  LTV: "USD",
  GROSS_MARGIN: "%",
  HEADCOUNT: "count",
  CUSTOM: "",
};

const today = () => new Date().toISOString().slice(0, 10);

export function MetricsEditor({
  projectSlug,
  initial,
}: {
  projectSlug: string;
  initial: Metric[];
}) {
  const [showNew, setShowNew] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state para defaults dinámicos (unit depende de kind)
  const [kind, setKind] = useState<Kind>("MRR");
  const [unit, setUnit] = useState<string>(KIND_DEFAULT_UNIT.MRR);
  const [customLabel, setCustomLabel] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [visibility, setVisibility] = useState("PUBLIC_TO_HOLDERS");

  function onKindChange(next: Kind) {
    setKind(next);
    setUnit(KIND_DEFAULT_UNIT[next]);
  }

  function resetForm() {
    setKind("MRR");
    setUnit(KIND_DEFAULT_UNIT.MRR);
    setCustomLabel("");
    setMetricValue("");
    setAsOf(today());
    setVisibility("PUBLIC_TO_HOLDERS");
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addMetricAction(projectSlug, formData);
      if (r.ok) {
        setShowNew(false);
        resetForm();
      } else {
        setError(r.error);
      }
    });
  }

  function onRemove(metricId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeMetricAction(projectSlug, metricId);
      if (!r.ok) setError(r.error);
    });
  }

  function labelFor(m: Metric) {
    if (m.kind === "CUSTOM" && m.customLabel) return m.customLabel;
    return KIND_LABEL[m.kind];
  }

  function formatValue(m: Metric) {
    const fmt = new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: 2,
    }).format(m.value);
    return `${fmt} ${m.unit}`;
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex items-center justify-between">
        <p className="eyebrow">
          {initial.length} medición{initial.length === 1 ? "" : "es"} registrada{initial.length === 1 ? "" : "s"}
        </p>
        {!showNew && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="eyebrow hover:!text-gold"
          >
            + Agregar medición
          </button>
        )}
      </div>

      {showNew && (
        <form action={onSubmit} className="hairline p-4 bg-paper space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <FloatingSelect
                id="kind"
                label="Tipo"
                value={kind}
                onChange={(v) => onKindChange(v as Kind)}
                options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({
                  value: k,
                  label: KIND_LABEL[k],
                }))}
              />
              <input type="hidden" name="kind" value={kind} />
            </div>
            <FloatingInput
              id="unit"
              label="Unidad"
              value={unit}
              onChange={setUnit}
              required
            />
          </div>

          {kind === "CUSTOM" && (
            <FloatingInput
              id="customLabel"
              label="Etiqueta personalizada"
              value={customLabel}
              onChange={setCustomLabel}
              required
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
            <FloatingInput
              id="value"
              type="number"
              step="any"
              label="Valor"
              value={metricValue}
              onChange={setMetricValue}
              required
            />
            <FloatingDate
              id="asOf"
              label="Fecha"
              value={asOf}
              onChange={setAsOf}
              required
            />
            <div>
              <FloatingSelect
                id="visibility"
                label="Visibilidad"
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: "PUBLIC_TO_HOLDERS", label: "Visible para miembros" },
                  { value: "PRIVATE", label: "Privada (solo vos y admin)" },
                ]}
              />
              <input type="hidden" name="visibility" value={visibility} />
            </div>
          </div>

          <div className="flex justify-end gap-4 hairline-t pt-4">
            <button
              type="button"
              onClick={() => {
                setShowNew(false);
                resetForm();
              }}
              disabled={isPending}
              className="eyebrow hover:!text-gold"
            >
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
              {isPending ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </form>
      )}

      <ul className="hairline-t">
        {initial.map((m) => (
          <li key={m.id} className="hairline-b py-4 grid grid-cols-12 items-center gap-3">
            <div className="col-span-12 sm:col-span-4">
              <p className="font-sans text-navy">{labelFor(m)}</p>
              <p className="mt-1 eyebrow">
                {m.visibility === "PUBLIC_TO_HOLDERS" ? "● Pública a miembros" : "○ Privada"}
              </p>
            </div>
            <div className="col-span-6 sm:col-span-4 font-mono text-navy">{formatValue(m)}</div>
            <div className="col-span-6 sm:col-span-2 eyebrow">{m.asOf}</div>
            <div className="col-span-12 sm:col-span-2 text-right">
              <InlineConfirm
                label="Eliminar"
                question="¿Eliminar esta medición?"
                onConfirm={() => onRemove(m.id)}
                disabled={isPending}
              />
            </div>
          </li>
        ))}
      </ul>

      {initial.length === 0 && !showNew && (
        <p className="text-navy/60">Sin métricas cargadas todavía.</p>
      )}
    </div>
  );
}

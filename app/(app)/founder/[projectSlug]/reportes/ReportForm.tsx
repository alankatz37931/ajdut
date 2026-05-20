"use client";

import { useRef, useState, useTransition } from "react";
import { publishReportAction } from "./actions";

type Props = {
  projectSlug: string;
  defaultYear: number;
};

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
  { value: "ANNUAL", label: "Anual" },
  { value: "EXTRAORDINARY", label: "Extraordinario" },
];

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "QUARTERLY_FINANCIAL", label: "Trimestral" },
  { value: "INVESTOR_UPDATE", label: "Update" },
  { value: "ANNUAL_AUDIT", label: "Auditoría anual" },
  { value: "EXTRAORDINARY", label: "Extraordinario" },
];

export function ReportForm({ projectSlug, defaultYear }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await publishReportAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-2 space-y-6">
      <p className="font-mono text-sm tracking-wider">
        <span className="text-gold">01</span>{" "}
        <span className="text-navy">· Publicar reporte</span>
      </p>

      <div>
        <label htmlFor="title" className="eyebrow block mb-1.5">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          maxLength={160}
          required
          disabled={isPending}
          placeholder="Resultados Q1 2026"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="summary" className="eyebrow block mb-1.5">
          Resumen
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={5}
          maxLength={1000}
          required
          disabled={isPending}
          placeholder="Resumen ejecutivo de avances, métricas y desafíos del período…"
          className="w-full resize-y border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy leading-relaxed focus:outline-none focus:border-navy disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="fiscalYear" className="eyebrow block mb-1.5">
            Año fiscal
          </label>
          <input
            id="fiscalYear"
            name="fiscalYear"
            type="number"
            min={1900}
            max={2999}
            step={1}
            defaultValue={defaultYear}
            required
            disabled={isPending}
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-mono text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="period" className="eyebrow block mb-1.5">
            Período
          </label>
          <select
            id="period"
            name="period"
            defaultValue="Q1"
            required
            disabled={isPending}
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="kind" className="eyebrow block mb-1.5">
            Tipo
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue="QUARTERLY_FINANCIAL"
            required
            disabled={isPending}
            className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="url" className="eyebrow block mb-1.5">
          URL del archivo
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          disabled={isPending}
          placeholder="https://drive.google.com/file/d/…"
          className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-mono text-sm text-navy focus:outline-none focus:border-navy disabled:opacity-50"
        />
        <p className="mt-1.5 eyebrow !text-navy/40">
          Pegá el link público al PDF (Google Drive, Dropbox, etc.).
        </p>
      </div>

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="eyebrow !text-gold" role="status">
          Reporte publicado. Los miembros reciben aviso por email.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? "Publicando…" : "Publicar reporte →"}
        </button>
        <span className="eyebrow !text-navy/40">
          Se envía aviso por email a todos los miembros del proyecto.
        </span>
      </div>
    </form>
  );
}

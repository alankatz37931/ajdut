"use client";

import { useRef, useState, useTransition } from "react";
import { FileUpload } from "@/components/ui/FileUpload";
import { publishReportAction } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from "@/components/ui/Floating";

type Props = {
  projectSlug: string;
  defaultYear: number;
  /** Título de sección — vive en la columna izquierda compacta. */
  heading: string;
  /** Descripción corta — debajo del título, columna izquierda. */
  description: string;
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

export function ReportForm({
  projectSlug,
  defaultYear,
  heading,
  description,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [fiscalYear, setFiscalYear] = useState(String(defaultYear));
  const [period, setPeriod] = useState("Q1");
  const [kind, setKind] = useState("QUARTERLY_FINANCIAL");
  const [url, setUrl] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!url.trim()) {
      setError("Subí el archivo del reporte.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await publishReportAction(projectSlug, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(true);
      setTitle("");
      setSummary("");
      setFiscalYear(String(defaultYear));
      setPeriod("Q1");
      setKind("QUARTERLY_FINANCIAL");
      setUrl("");
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-14 gap-y-12">
        {/* ── Columna izquierda · identificación ─────────────────────── */}
        <div className="lg:col-span-5">
          <h1 className="font-sans text-h1 text-navy">{heading}</h1>
          <p className="mt-3 text-navy/70 leading-relaxed">{description}</p>

          <div className="mt-9 space-y-5">
            <FloatingInput
              id="fiscalYear"
              type="number"
              label="Año fiscal"
              value={fiscalYear}
              onChange={setFiscalYear}
              required
            />
            <div>
              <FloatingSelect
                id="period"
                label="Período"
                value={period}
                onChange={setPeriod}
                options={PERIOD_OPTIONS}
              />
              <input type="hidden" name="period" value={period} />
            </div>
            <div>
              <FloatingSelect
                id="kind"
                label="Tipo"
                value={kind}
                onChange={setKind}
                options={KIND_OPTIONS}
              />
              <input type="hidden" name="kind" value={kind} />
            </div>
          </div>
        </div>

        {/* ── Columna derecha · contenido ────────────────────────────── */}
        <div className="lg:col-span-7 space-y-6">
          <FileUpload
            scope="report-attachment"
            accept=".pdf,.xlsx,.xls,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            maxSizeMb={25}
            currentUrl={url || undefined}
            onUploaded={(publicUrl) => setUrl(publicUrl)}
            label="Archivo del reporte"
            helperText="PDF, Excel o Word · máximo 25 MB."
            subtle
          />
          <input type="hidden" name="url" value={url} />

          <FloatingInput
            id="title"
            label="Título"
            value={title}
            onChange={setTitle}
            maxLength={160}
            required
          />

          <FloatingTextarea
            id="summary"
            label="Resumen"
            value={summary}
            onChange={setSummary}
            rows={4}
            maxLength={1000}
            required
            discreetCounter
          />
        </div>
      </div>

      {/* ── Pie · acción a todo el ancho ─────────────────────────────── */}
      <div className="mt-12 pt-8 hairline-t">
        {error && (
          <p className="eyebrow !text-navy mb-4" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="eyebrow !text-gold mb-4" role="status">
            Reporte publicado. Los miembros reciben aviso por email.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Publicando…" : "Publicar reporte →"}
        </button>
        <p className="mt-3 text-center text-[0.75rem] text-navy/45">
          Se envía un aviso por email a todos los miembros del proyecto.
        </p>
      </div>
    </form>
  );
}

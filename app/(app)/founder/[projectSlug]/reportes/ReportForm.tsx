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
    <form ref={formRef} onSubmit={onSubmit} className="mt-2 space-y-6">
      <p className="font-mono text-sm tracking-wider">
        <span className="text-gold">01</span>{" "}
        <span className="text-navy">· Publicar reporte</span>
      </p>

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
        rows={5}
        maxLength={1000}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
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

      <FileUpload
        scope="report-attachment"
        accept=".pdf,.xlsx,.xls,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        maxSizeMb={25}
        currentUrl={url || undefined}
        onUploaded={(publicUrl) => setUrl(publicUrl)}
        label="Subir archivo"
        helperText="PDF, Excel o Word. Máximo 25MB. Si tu storage no está configurado, podés pegar el link directo abajo."
      />

      <div>
        <FloatingInput
          id="url"
          type="url"
          inputMode="url"
          label="URL del archivo"
          value={url}
          onChange={setUrl}
          required
        />
        <p className="eyebrow !text-navy/40 mt-1.5">
          Se autocompleta tras subir un archivo, o pegá un link público (Google
          Drive, Dropbox, etc.).
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

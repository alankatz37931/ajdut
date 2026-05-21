"use client";

import { useState, useTransition } from "react";
import { createPollAction } from "./actions";
import { FloatingInput, GoldUnderline } from "@/components/ui/Floating";

type Props = {
  projectSlug: string;
};

const MAX_OPTIONS = 20;
const MAX_QUESTION = 500;
const MAX_OPTION_LABEL = 200;

export function PollComposer({ projectSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setMultiple(false);
    setClosesAt("");
    setError(null);
  }

  function setOpt(idx: number, val: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  }
  function addOpt() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, ""]));
  }
  function removeOpt(idx: number) {
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)
    );
  }

  function submit(formData: FormData) {
    setError(null);
    const q = question.trim();
    if (!q) {
      setError("La pregunta no puede estar vacía.");
      return;
    }
    const cleaned = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (cleaned.length < 2) {
      setError("Agregá al menos 2 opciones con contenido.");
      return;
    }
    // Limpiamos el FormData y lo armamos a mano para evitar mandar opciones vacías.
    const fd = new FormData();
    fd.set("question", q);
    if (multiple) fd.set("multiple", "on");
    if (closesAt) fd.set("closesAt", closesAt);
    for (const o of cleaned) fd.append("option", o);

    // Ignoramos `formData` (input nativos) y usamos `fd`.
    void formData;

    startTransition(async () => {
      const r = await createPollAction(projectSlug, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-outline"
      >
        Crear encuesta +
      </button>
    );
  }

  return (
    <form action={submit} className="hairline p-4 bg-paper-light">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Nueva encuesta</p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-2">
        <FloatingInput
          id="poll-question"
          label="Pregunta"
          value={question}
          onChange={setQuestion}
          maxLength={MAX_QUESTION}
        />
      </div>

      <div className="mt-5">
        <p className="eyebrow mb-2">Opciones</p>
        <ul className="space-y-3">
          {options.map((opt, idx) => (
            <li key={idx} className="flex items-center gap-3">
              <span className="font-mono text-xs text-navy/40 w-5 shrink-0">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  maxLength={MAX_OPTION_LABEL}
                  value={opt}
                  onChange={(e) => setOpt(idx, e.target.value)}
                  placeholder={`Opción ${idx + 1}`}
                  className="peer w-full bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-sans text-sm text-navy outline-none placeholder:text-navy/30"
                />
                <GoldUnderline />
              </div>
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOpt(idx)}
                  disabled={isPending}
                  className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
                  aria-label={`Quitar opción ${idx + 1}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOpt}
            disabled={isPending}
            className="mt-3 eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Agregar opción +
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="accent-navy"
          />
          Permitir múltiples respuestas
        </label>

        <div>
          <label htmlFor="poll-closes" className="eyebrow block mb-1.5">
            Cierra el <span className="!text-navy/40">(opcional)</span>
          </label>
          <input
            id="poll-closes"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="bg-transparent border-0 border-b-[0.5px] border-navy/30 px-0 py-1.5 font-mono text-sm text-navy outline-none focus:border-navy"
          />
        </div>
      </div>

      {error && (
        <p className="eyebrow !text-navy mt-3" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Creando…" : "Crear encuesta"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import {
  addHeirAction,
  removeHeirAction,
  setValidationFrequencyAction,
  updateHeirAction,
  type HeirActionResult,
} from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

export type HeirRow = {
  id: string;
  fullName: string;
  email: string | null;
  relationship: string | null;
  sharePercent: number;
};

export type ValidationStateView = {
  frequencyMonths: number;
  lastConfirmedAt: string | null; // ISO
  missedCount: number;
  heirsEscalated: boolean;
  pendingCheck: { id: string; sentAt: string } | null;
};

type Props = {
  initialHeirs: HeirRow[];
  initialValidation: ValidationStateView;
};

const FREQUENCY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Desactivada" },
  { value: 1, label: "Mensual" },
  { value: 3, label: "Cada 3 meses" },
  { value: 6, label: "Cada 6 meses" },
  { value: 12, label: "Anual" },
];

const emptyHeir: HeirRow = {
  id: "",
  fullName: "",
  email: "",
  relationship: "",
  sharePercent: 0,
};

export function HeirsAndValidation({ initialHeirs, initialValidation }: Props) {
  const [heirs, setHeirs] = useState<HeirRow[]>(initialHeirs);
  const [validation, setValidation] = useState<ValidationStateView>(
    initialValidation
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalShare = heirs.reduce((s, h) => s + h.sharePercent, 0);
  const totalLabel = `${totalShare.toFixed(2)}% asignado`;
  const remainingLabel = `${Math.max(0, 100 - totalShare).toFixed(2)}% restante`;
  const overAllocated = totalShare > 100;

  function flashOk() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function applyResult(r: HeirActionResult, onOk: () => void) {
    if (r.ok) {
      setError(null);
      onOk();
      flashOk();
    } else {
      setError(r.error);
    }
  }

  function onAdd(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addHeirAction(fd);
      applyResult(r, () => {
        // Optimista: agregamos al estado lo que mandó el form.
        const newRow: HeirRow = {
          id: `tmp-${Date.now()}`,
          fullName: String(fd.get("fullName") ?? ""),
          email: (String(fd.get("email") ?? "") || null),
          relationship: (String(fd.get("relationship") ?? "") || null),
          sharePercent:
            Number.parseFloat(String(fd.get("sharePercent") ?? "0").replace(",", ".")) || 0,
        };
        setHeirs((prev) => [...prev, newRow]);
        setShowNew(false);
      });
    });
  }

  function onUpdate(heirId: string, fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await updateHeirAction(heirId, fd);
      applyResult(r, () => {
        setHeirs((prev) =>
          prev.map((h) =>
            h.id === heirId
              ? {
                  ...h,
                  fullName: String(fd.get("fullName") ?? ""),
                  email: String(fd.get("email") ?? "") || null,
                  relationship: String(fd.get("relationship") ?? "") || null,
                  sharePercent:
                    Number.parseFloat(
                      String(fd.get("sharePercent") ?? "0").replace(",", ".")
                    ) || 0,
                }
              : h
          )
        );
        setEditingId(null);
      });
    });
  }

  function onRemove(heirId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeHeirAction(heirId);
      applyResult(r, () => {
        setHeirs((prev) => prev.filter((h) => h.id !== heirId));
      });
    });
  }

  function onFrequencyChange(months: number) {
    setError(null);
    const prev = validation.frequencyMonths;
    setValidation((v) => ({ ...v, frequencyMonths: months }));
    startTransition(async () => {
      const r = await setValidationFrequencyAction(months);
      if (!r.ok) {
        setError(r.error);
        setValidation((v) => ({ ...v, frequencyMonths: prev }));
      } else {
        flashOk();
      }
    });
  }

  const lastConfirmedLabel = validation.lastConfirmedAt
    ? `Última confirmación: ${fmtDate(validation.lastConfirmedAt)} — ${humanAgo(
        validation.lastConfirmedAt
      )}`
    : "Todavía no confirmaste ninguna verificación.";

  return (
    <div className="mt-12 space-y-12">
      <header>
        <p className="eyebrow">— Sucesión</p>
        <h2 className="font-sans mt-3 text-h2 text-navy">
          Herederos y validación de vida
        </h2>
      </header>

      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="eyebrow !text-gold" aria-live="polite">
          ✓ Guardado
        </p>
      )}

      {/* ─── Subsección: Herederos ─────────────────────────────────── */}
      <section>
        <h3 className="font-sans text-xl text-navy">Herederos</h3>
        <p className="mt-2 text-navy/70 leading-relaxed">
          Definí quiénes recibirán tu participación. Solo el equipo de AJDUT verá
          estos datos, y se contactará a estas personas si dejás de responder
          nuestras verificaciones por más de 3 ciclos consecutivos.
        </p>

        <div className="mt-5 hairline p-4 bg-paper flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">
            <span className="font-mono text-navy">{totalLabel}</span>
            <span className="!text-navy/40"> · </span>
            <span
              className={
                overAllocated
                  ? "font-mono !text-navy"
                  : "font-mono !text-navy/60"
              }
            >
              {remainingLabel}
            </span>
          </p>
          {!showNew && !editingId && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="eyebrow hover:!text-gold"
              disabled={isPending}
            >
              + Agregar heredero
            </button>
          )}
        </div>

        {overAllocated && (
          <p className="mt-3 eyebrow !text-navy hairline p-3 bg-paper">
            La suma de % supera 100. Ajustá los valores antes de guardar nuevos
            cambios.
          </p>
        )}

        {showNew && (
          <div className="mt-4 hairline p-4 bg-paper">
            <HeirForm
              heir={emptyHeir}
              isNew
              onSubmit={onAdd}
              onCancel={() => setShowNew(false)}
              isPending={isPending}
            />
          </div>
        )}

        <ul className="mt-4 space-y-3">
          {heirs.map((h) => (
            <li key={h.id} className="hairline p-4 bg-paper">
              {editingId === h.id ? (
                <HeirForm
                  heir={h}
                  onSubmit={(fd) => onUpdate(h.id, fd)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                />
              ) : (
                <div className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="font-sans text-navy">{h.fullName}</p>
                    {h.email && (
                      <p className="mt-1 eyebrow truncate normal-case tracking-normal !text-navy/60">
                        {h.email}
                      </p>
                    )}
                    {h.relationship && (
                      <p className="mt-1 eyebrow">{h.relationship}</p>
                    )}
                  </div>
                  <div className="col-span-6 sm:col-span-4 font-mono text-navy">
                    {h.sharePercent.toFixed(2)}%
                  </div>
                  <div className="col-span-6 sm:col-span-3 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(h.id)}
                      className="eyebrow hover:!text-gold"
                      disabled={isPending}
                    >
                      Editar
                    </button>
                    <InlineConfirm
                      label="Eliminar"
                      question="¿Eliminar este heredero?"
                      onConfirm={() => onRemove(h.id)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {heirs.length === 0 && !showNew && (
          <p className="mt-4 text-navy/60">
            Todavía no cargaste herederos.
          </p>
        )}
      </section>

      {/* ─── Subsección: Validación de vida ────────────────────────── */}
      <section>
        <h3 className="font-sans text-xl text-navy">Validación de vida</h3>
        <p className="mt-2 text-navy/70 leading-relaxed">
          Cada cierto tiempo te enviaremos un email para confirmar que seguís
          activo. Si no respondés 3 veces seguidas, nuestro equipo se pondrá en
          contacto con tus herederos.
        </p>

        <div className="mt-5">
          <label className="eyebrow block mb-2" htmlFor="frequencyMonths">
            Frecuencia
          </label>
          <select
            id="frequencyMonths"
            value={validation.frequencyMonths}
            onChange={(e) => onFrequencyChange(Number.parseInt(e.target.value, 10))}
            disabled={isPending}
            className="hairline bg-paper px-3 py-2 font-sans text-navy"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 hairline p-4 bg-paper space-y-2">
          <p className="eyebrow">
            <span className="!text-navy/60">{lastConfirmedLabel}</span>
          </p>
          {validation.pendingCheck && (
            <p className="eyebrow !text-gold">
              Pendiente de responder desde el{" "}
              {fmtDate(validation.pendingCheck.sentAt)}
            </p>
          )}
        </div>

        {validation.missedCount > 0 && (
          <div className="mt-4 hairline p-4 bg-paper">
            <p className="eyebrow !text-gold">
              ⚠ {validation.missedCount}{" "}
              {validation.missedCount === 1
                ? "verificación sin responder"
                : "verificaciones sin responder"}
              .
            </p>
            <p className="mt-2 text-sm text-navy/75">
              {validation.heirsEscalated
                ? "Nuestro equipo ya fue alertado y va a contactar a tus herederos."
                : validation.missedCount >= 2
                ? "Una más y se contactará a tus herederos."
                : "Si seguís sin responder, se contactará a tus herederos después de la tercera consecutiva."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function HeirForm({
  heir,
  isNew = false,
  onSubmit,
  onCancel,
  isPending,
}: {
  heir: HeirRow;
  isNew?: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            defaultValue={heir.fullName}
            required
            className="input"
          />
        </Field>
        <Field label="Email (opcional)" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={heir.email ?? ""}
            className="input"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Relación (opcional)" htmlFor="relationship">
          <input
            id="relationship"
            name="relationship"
            defaultValue={heir.relationship ?? ""}
            placeholder="hermana · cónyuge · hijo · etc."
            className="input"
          />
        </Field>
        <Field label="Porcentaje asignado" htmlFor="sharePercent">
          <input
            id="sharePercent"
            name="sharePercent"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            required
            defaultValue={heir.sharePercent || ""}
            className="input font-mono"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 hairline-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Guardando…" : isNew ? "Agregar" : "Guardar"}
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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function humanAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "hace unas horas";
  if (days < 30) return `hace ${days} día${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? "" : "es"}`;
  const years = Math.floor(months / 12);
  return `hace ${years} año${years === 1 ? "" : "s"}`;
}

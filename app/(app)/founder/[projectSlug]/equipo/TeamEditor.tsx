"use client";

import { useState, useTransition } from "react";
import { upsertFounderAction, removeFounderAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

type Founder = {
  id: string;
  fullName: string;
  role: string;
  linkedinUrl: string;
  equityPercent: number;
  joinedAt: string; // YYYY-MM-DD
  isActive: boolean;
};

const empty: Founder = {
  id: "",
  fullName: "",
  role: "",
  linkedinUrl: "",
  equityPercent: 0,
  joinedAt: "",
  isActive: true,
};

export function TeamEditor({
  projectSlug,
  initialFounders,
}: {
  projectSlug: string;
  initialFounders: Founder[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(initialFounders.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await upsertFounderAction(projectSlug, formData);
      if (r.ok) {
        setEditingId(null);
        setShowNew(false);
      } else {
        setError(r.error);
      }
    });
  }

  function onRemove(founderId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeFounderAction(projectSlug, founderId);
      if (!r.ok) setError(r.error);
    });
  }

  const totalEquity = initialFounders.reduce((s, f) => s + f.equityPercent, 0);

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex items-center justify-between">
        <p className="eyebrow">
          Equity asignado total: <span className="font-mono text-navy">{totalEquity.toFixed(2)}%</span>
        </p>
        {!showNew && !editingId && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="eyebrow hover:!text-gold"
          >
            + Agregar miembro
          </button>
        )}
      </div>

      {showNew && (
        <FounderForm
          founder={empty}
          onSubmit={onSubmit}
          onCancel={() => setShowNew(false)}
          isPending={isPending}
        />
      )}

      <ul className="space-y-3">
        {initialFounders.map((f) => (
          <li key={f.id} className="hairline p-4 bg-paper">
            {editingId === f.id ? (
              <FounderForm
                founder={f}
                onSubmit={onSubmit}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-12 sm:col-span-5 min-w-0">
                  <p className="font-sans text-navy">{f.fullName}</p>
                  <p className="mt-1 eyebrow">{f.role}</p>
                  {f.linkedinUrl && (
                    <a
                      href={f.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 eyebrow !text-gold inline-block"
                    >
                      LinkedIn →
                    </a>
                  )}
                </div>
                <div className="col-span-4 sm:col-span-2 font-mono text-navy">
                  {f.equityPercent.toFixed(2)}%
                </div>
                <div className="col-span-4 sm:col-span-2 eyebrow">
                  {f.isActive ? "● Activo" : "○ Inactivo"}
                </div>
                <div className="col-span-4 sm:col-span-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(f.id)}
                    className="eyebrow hover:!text-gold"
                  >
                    Editar
                  </button>
                  <InlineConfirm
                    label="Eliminar"
                    question="¿Eliminar este miembro?"
                    onConfirm={() => onRemove(f.id)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {initialFounders.length === 0 && !showNew && (
        <p className="text-navy/60">Todavía no agregaste a nadie al equipo.</p>
      )}
    </div>
  );
}

function FounderForm({
  founder,
  onSubmit,
  onCancel,
  isPending,
}: {
  founder: Founder;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="founderId" value={founder.id} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            defaultValue={founder.fullName}
            required
            className="input"
          />
        </Field>
        <Field label="Rol" htmlFor="role">
          <input
            id="role"
            name="role"
            defaultValue={founder.role}
            required
            placeholder="CEO · CTO · Product · etc."
            className="input"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Equity %" htmlFor="equityPercent">
          <input
            id="equityPercent"
            name="equityPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={founder.equityPercent}
            className="input font-mono"
          />
        </Field>
        <Field label="Se unió (opcional)" htmlFor="joinedAt">
          <input
            id="joinedAt"
            name="joinedAt"
            type="date"
            defaultValue={founder.joinedAt}
            className="input font-mono"
          />
        </Field>
      </div>
      <Field label="LinkedIn (opcional)" htmlFor="linkedinUrl">
        <input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          defaultValue={founder.linkedinUrl}
          placeholder="https://linkedin.com/in/..."
          className="input"
        />
      </Field>
      <Field label="Estado" htmlFor="isActive">
        <select id="isActive" name="isActive" defaultValue={String(founder.isActive)} className="input">
          <option value="true">Activo</option>
          <option value="false">Inactivo (histórico)</option>
        </select>
      </Field>
      <div className="flex justify-end gap-3 hairline-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? "Guardando…" : "Guardar"}
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

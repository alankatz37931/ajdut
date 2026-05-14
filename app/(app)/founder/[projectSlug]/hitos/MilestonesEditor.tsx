"use client";

import { useState, useTransition } from "react";
import { upsertMilestoneAction, removeMilestoneAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";

type Status = "PLANNED" | "IN_PROGRESS" | "ACHIEVED" | "DELAYED" | "CANCELLED";

type Milestone = {
  id: string;
  title: string;
  description: string;
  status: Status;
  targetDate: string;
  achievedAt: string;
};

const STATUS_LABEL: Record<Status, string> = {
  PLANNED: "Planeado",
  IN_PROGRESS: "En curso",
  ACHIEVED: "Cumplido",
  DELAYED: "Atrasado",
  CANCELLED: "Cancelado",
};

const STATUS_SYMBOL: Record<Status, string> = {
  PLANNED: "○",
  IN_PROGRESS: "◐",
  ACHIEVED: "●",
  DELAYED: "◇",
  CANCELLED: "✕",
};

const empty: Milestone = {
  id: "",
  title: "",
  description: "",
  status: "PLANNED",
  targetDate: "",
  achievedAt: "",
};

export function MilestonesEditor({
  projectSlug,
  initial,
}: {
  projectSlug: string;
  initial: Milestone[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await upsertMilestoneAction(projectSlug, formData);
      if (r.ok) {
        setEditingId(null);
        setShowNew(false);
      } else {
        setError(r.error);
      }
    });
  }

  function onRemove(milestoneId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeMilestoneAction(projectSlug, milestoneId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex items-center justify-between">
        <p className="eyebrow">{initial.length} hito{initial.length === 1 ? "" : "s"} registrado{initial.length === 1 ? "" : "s"}</p>
        {!showNew && !editingId && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="eyebrow hover:!text-gold"
          >
            + Agregar hito
          </button>
        )}
      </div>

      {showNew && (
        <MilestoneForm
          milestone={empty}
          onSubmit={onSubmit}
          onCancel={() => setShowNew(false)}
          isPending={isPending}
        />
      )}

      <ul className="space-y-3">
        {initial.map((m) => (
          <li key={m.id} className="hairline p-4 bg-paper">
            {editingId === m.id ? (
              <MilestoneForm
                milestone={m}
                onSubmit={onSubmit}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-navy">{m.title}</p>
                    <p className="mt-2 text-navy/75 leading-relaxed">{m.description}</p>
                  </div>
                  <span className="eyebrow inline-flex items-center gap-1.5 shrink-0">
                    <span aria-hidden className="text-base leading-none">
                      {STATUS_SYMBOL[m.status]}
                    </span>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 hairline-t pt-3 text-sm">
                  <div>
                    <p className="eyebrow">Objetivo</p>
                    <p className="mt-1 font-mono text-navy">{m.targetDate || "—"}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Cumplido</p>
                    <p className="mt-1 font-mono text-navy">{m.achievedAt || "—"}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(m.id)}
                    className="eyebrow hover:!text-gold"
                  >
                    Editar
                  </button>
                  <InlineConfirm
                    label="Eliminar"
                    question="¿Eliminar este hito?"
                    onConfirm={() => onRemove(m.id)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {initial.length === 0 && !showNew && (
        <p className="text-navy/60">Sin hitos registrados todavía.</p>
      )}
    </div>
  );
}

function MilestoneForm({
  milestone,
  onSubmit,
  onCancel,
  isPending,
}: {
  milestone: Milestone;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="milestoneId" value={milestone.id} />
      <Field label="Título" htmlFor="title">
        <input
          id="title"
          name="title"
          defaultValue={milestone.title}
          required
          placeholder="Lanzamiento beta · MVP funcional · 100 usuarios pagos…"
          className="input"
        />
      </Field>
      <Field label="Descripción" htmlFor="description">
        <textarea
          id="description"
          name="description"
          defaultValue={milestone.description}
          rows={3}
          required
          className="input"
          placeholder="Qué implica este hito y cómo se mide."
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Estado" htmlFor="status">
          <select id="status" name="status" defaultValue={milestone.status} className="input">
            <option value="PLANNED">Planeado</option>
            <option value="IN_PROGRESS">En curso</option>
            <option value="ACHIEVED">Cumplido</option>
            <option value="DELAYED">Atrasado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </Field>
        <Field label="Fecha objetivo" htmlFor="targetDate">
          <input
            id="targetDate"
            name="targetDate"
            type="date"
            defaultValue={milestone.targetDate}
            className="input font-mono"
          />
        </Field>
        <Field label="Cumplido el" htmlFor="achievedAt">
          <input
            id="achievedAt"
            name="achievedAt"
            type="date"
            defaultValue={milestone.achievedAt}
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

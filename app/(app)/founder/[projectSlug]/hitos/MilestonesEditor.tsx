"use client";

import { useState, useTransition } from "react";
import { upsertMilestoneAction, removeMilestoneAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
  FloatingDate,
} from "@/components/ui/Floating";

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
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description);
  const [status, setStatus] = useState<Status>(milestone.status);
  const [targetDate, setTargetDate] = useState(milestone.targetDate);
  const [achievedAt, setAchievedAt] = useState(milestone.achievedAt);

  return (
    <form action={onSubmit} className="space-y-5">
      <input type="hidden" name="milestoneId" value={milestone.id} />
      <FloatingInput
        id="title"
        label="Título"
        value={title}
        onChange={setTitle}
        required
      />
      <FloatingTextarea
        id="description"
        label="Descripción"
        value={description}
        onChange={setDescription}
        rows={3}
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
        <div>
          <FloatingSelect
            id="status"
            label="Estado"
            value={status}
            onChange={(v) => setStatus(v as Status)}
            options={(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            }))}
          />
          <input type="hidden" name="status" value={status} />
        </div>
        <FloatingDate
          id="targetDate"
          label="Fecha objetivo"
          value={targetDate}
          onChange={setTargetDate}
        />
        <FloatingDate
          id="achievedAt"
          label="Cumplido el"
          value={achievedAt}
          onChange={setAchievedAt}
        />
      </div>
      <div className="flex justify-end gap-4 hairline-t pt-4">
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
    </form>
  );
}

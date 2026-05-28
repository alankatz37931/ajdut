"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { upsertMilestoneAction, removeMilestoneAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
  FloatingDate,
} from "@/components/ui/Floating";
import { SYMBOL } from "@/lib/utils/status-symbols";

type Status = "PLANNED" | "IN_PROGRESS" | "ACHIEVED" | "DELAYED" | "CANCELLED";
type HitosDict = Dict["founderHitos"];

type Milestone = {
  id: string;
  title: string;
  description: string;
  status: Status;
  targetDate: string;
  achievedAt: string;
};

// Paleta canónica en `@/lib/utils/status-symbols`.
const STATUS_SYMBOL: Record<Status, string> = {
  PLANNED: SYMBOL.open,
  IN_PROGRESS: SYMBOL.prog,
  ACHIEVED: SYMBOL.done,
  DELAYED: SYMBOL.delay,
  CANCELLED: SYMBOL.reject,
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
  dict,
}: {
  projectSlug: string;
  initial: Milestone[];
  dict: HitosDict;
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

  const countLabel = (initial.length === 1
    ? dict.countSingle
    : dict.countPlural
  ).replace("{n}", String(initial.length));

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">{countLabel}</p>
        {!showNew && !editingId && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="eyebrow hover:!text-gold shrink-0"
          >
            {dict.addBtn}
          </button>
        )}
      </div>

      {showNew && (
        <MilestoneForm
          milestone={empty}
          onSubmit={onSubmit}
          onCancel={() => setShowNew(false)}
          isPending={isPending}
          dict={dict}
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
                dict={dict}
              />
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-navy break-words">{m.title}</p>
                    <p className="mt-2 text-navy/75 leading-relaxed break-words">{m.description}</p>
                  </div>
                  <span className="eyebrow inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                    <span aria-hidden className="text-base leading-none">
                      {STATUS_SYMBOL[m.status]}
                    </span>
                    {dict.status[m.status] ?? m.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 hairline-t pt-3 text-sm">
                  <div>
                    <p className="eyebrow">{dict.fieldTarget}</p>
                    <p className="mt-1 font-mono text-navy">{m.targetDate || "—"}</p>
                  </div>
                  <div>
                    <p className="eyebrow">{dict.fieldAchieved}</p>
                    <p className="mt-1 font-mono text-navy">{m.achievedAt || "—"}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(m.id)}
                    className="eyebrow hover:!text-gold"
                  >
                    {dict.editBtn}
                  </button>
                  <InlineConfirm
                    label={dict.removeBtn}
                    question={dict.removeConfirm}
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
        <p className="text-navy/60">{dict.empty}</p>
      )}
    </div>
  );
}

function MilestoneForm({
  milestone,
  onSubmit,
  onCancel,
  isPending,
  dict,
}: {
  milestone: Milestone;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
  dict: HitosDict;
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
        label={dict.form.titleLabel}
        value={title}
        onChange={setTitle}
        required
      />
      <FloatingTextarea
        id="description"
        label={dict.form.descriptionLabel}
        value={description}
        onChange={setDescription}
        rows={3}
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
        <div>
          <FloatingSelect
            id="status"
            label={dict.form.statusLabel}
            value={status}
            onChange={(v) => setStatus(v as Status)}
            options={(["PLANNED", "IN_PROGRESS", "ACHIEVED", "DELAYED", "CANCELLED"] as Status[]).map(
              (s) => ({
                value: s,
                label: dict.status[s] ?? s,
              })
            )}
          />
          <input type="hidden" name="status" value={status} />
        </div>
        <FloatingDate
          id="targetDate"
          label={dict.form.targetDateLabel}
          value={targetDate}
          onChange={setTargetDate}
        />
        <FloatingDate
          id="achievedAt"
          label={dict.form.achievedAtLabel}
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
          {dict.form.cancelBtn}
        </button>
        <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
          {isPending ? dict.form.savingBtn : dict.form.saveBtn}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  createClassAction,
  renameClassAction,
  deleteClassAction,
  assignHolderClassAction,
  upsertExternalHoldingAction,
  removeExternalHoldingAction,
} from "./actions";

type ClassRow = { id: string; name: string };
type HolderRow = { userId: string; name: string; shares: number; classId: string };
type ExternalRow = {
  id: string;
  label: string;
  classId: string;
  peopleCount: number;
  shareCount: number;
};

type ExternalInput = {
  id?: string;
  label: string;
  classId: string;
  peopleCount: number;
  shareCount: number;
};

/** Estilo compartido para los <select> inline de clase. */
const SELECT_CLS =
  "hairline bg-paper px-2.5 py-1.5 font-sans text-sm text-navy outline-none focus:border-navy disabled:opacity-50";
const LINE_INPUT =
  "bg-transparent border-0 border-b-[0.5px] border-navy/25 px-0 py-1.5 font-sans text-sm text-navy outline-none focus:border-navy/60";

export function CompositionEditor({
  projectSlug,
  totalShares,
  initialClasses,
  initialHolders,
  initialExternal,
}: {
  projectSlug: string;
  totalShares: number;
  initialClasses: ClassRow[];
  initialHolders: HolderRow[];
  initialExternal: ExternalRow[];
}) {
  const [classes, setClasses] = useState<ClassRow[]>(initialClasses);
  const [holders, setHolders] = useState<HolderRow[]>(initialHolders);
  const [external, setExternal] = useState<ExternalRow[]>(initialExternal);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [newClass, setNewClass] = useState("");
  const [showNewExternal, setShowNewExternal] = useState(false);
  const [editingExternalId, setEditingExternalId] = useState<string | null>(null);

  function run<R extends { ok: boolean; error?: string }>(
    fn: () => Promise<R>,
    onOk: (r: Extract<R, { ok: true }>) => void
  ) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onOk(r as Extract<R, { ok: true }>);
      else setError(r.error ?? "Ocurrió un error.");
    });
  }

  function addClass() {
    const name = newClass.trim();
    if (name.length < 2) return;
    run(
      () => createClassAction(projectSlug, name),
      (r) => {
        setClasses((c) => [...c, r.class]);
        setNewClass("");
      }
    );
  }

  function renameClass(id: string, name: string) {
    run(
      () => renameClassAction(projectSlug, id, name),
      () => setClasses((c) => c.map((x) => (x.id === id ? { ...x, name } : x)))
    );
  }

  function deleteClass(id: string) {
    run(
      () => deleteClassAction(projectSlug, id),
      () => {
        setClasses((c) => c.filter((x) => x.id !== id));
        setHolders((h) =>
          h.map((x) => (x.classId === id ? { ...x, classId: "" } : x))
        );
        setExternal((e) =>
          e.map((x) => (x.classId === id ? { ...x, classId: "" } : x))
        );
      }
    );
  }

  function assignHolder(userId: string, classId: string) {
    run(
      () => assignHolderClassAction(projectSlug, userId, classId),
      () =>
        setHolders((h) =>
          h.map((x) => (x.userId === userId ? { ...x, classId } : x))
        )
    );
  }

  function upsertExternal(input: ExternalInput, onDone: () => void) {
    run(
      () => upsertExternalHoldingAction(projectSlug, input),
      (r) => {
        setExternal((e) => {
          const exists = e.some((x) => x.id === r.holding.id);
          return exists
            ? e.map((x) => (x.id === r.holding.id ? r.holding : x))
            : [...e, r.holding];
        });
        onDone();
      }
    );
  }

  function removeExternal(id: string) {
    run(
      () => removeExternalHoldingAction(projectSlug, id),
      () => setExternal((e) => e.filter((x) => x.id !== id))
    );
  }

  return (
    <div className="mt-8 space-y-12">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      {/* ─── Clases ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">— Clases de accionistas</p>
          <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
            Las categorías en las que agrupás a tus accionistas. Los miembros
            las ven en la ficha con la cantidad de personas y el % de cada una.
          </p>
        </div>

        {classes.length > 0 && (
          <ul className="hairline-t">
            {classes.map((c) => (
              <ClassLine
                key={c.id}
                cls={c}
                isPending={isPending}
                onRename={(name) => renameClass(c.id, name)}
                onDelete={() => deleteClass(c.id)}
              />
            ))}
          </ul>
        )}

        <div className="flex items-end gap-3">
          <input
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            maxLength={60}
            placeholder="Nueva clase — ej. Directivo"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addClass();
              }
            }}
            className={`flex-1 min-w-0 ${LINE_INPUT} text-base`}
          />
          <button
            type="button"
            onClick={addClass}
            disabled={isPending || newClass.trim().length < 2}
            className="btn-outline disabled:opacity-50 shrink-0"
          >
            Agregar clase
          </button>
        </div>
      </section>

      {/* ─── Accionistas de AJDUT ────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">— Accionistas de AJDUT</p>
          <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
            Personas que recibieron acciones a través de la plataforma. Asigná
            una clase a cada una.
          </p>
        </div>

        {holders.length === 0 ? (
          <p className="text-sm text-navy/55">
            Todavía no hay accionistas asignados a través de AJDUT.
          </p>
        ) : (
          <ul className="hairline-t">
            {holders.map((h) => (
              <HolderLine
                key={h.userId}
                holder={h}
                classes={classes}
                totalShares={totalShares}
                isPending={isPending}
                onAssign={(classId) => assignHolder(h.userId, classId)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ─── Accionistas pre-existentes ──────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">— Accionistas pre-existentes</p>
            <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
              Gente que ya tenía acciones antes de AJDUT (fundadores, inversores
              previos). Declarás cuántas personas, cuántas acciones y su clase.
            </p>
          </div>
          {!showNewExternal && editingExternalId === null && (
            <button
              type="button"
              onClick={() => setShowNewExternal(true)}
              disabled={isPending}
              className="eyebrow hover:!text-gold shrink-0"
            >
              + Agregar
            </button>
          )}
        </div>

        {showNewExternal && (
          <ExternalForm
            initial={null}
            classes={classes}
            isPending={isPending}
            onSubmit={(input) =>
              upsertExternal(input, () => setShowNewExternal(false))
            }
            onCancel={() => setShowNewExternal(false)}
          />
        )}

        {external.length > 0 && (
          <ul className="hairline-t">
            {external.map((x) =>
              editingExternalId === x.id ? (
                <li key={x.id} className="hairline-b last:border-b-0 py-3">
                  <ExternalForm
                    initial={x}
                    classes={classes}
                    isPending={isPending}
                    onSubmit={(input) =>
                      upsertExternal(input, () => setEditingExternalId(null))
                    }
                    onCancel={() => setEditingExternalId(null)}
                  />
                </li>
              ) : (
                <ExternalLine
                  key={x.id}
                  row={x}
                  classes={classes}
                  totalShares={totalShares}
                  isPending={isPending}
                  onEdit={() => setEditingExternalId(x.id)}
                  onDelete={() => removeExternal(x.id)}
                />
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClassLine({
  cls,
  isPending,
  onRename,
  onDelete,
}: {
  cls: ClassRow;
  isPending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(cls.name);
  const dirty = draft.trim() !== cls.name && draft.trim().length >= 2;
  return (
    <li className="hairline-b last:border-b-0 flex items-center gap-3 py-2.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={60}
        className={`flex-1 min-w-0 ${LINE_INPUT}`}
      />
      {dirty && (
        <button
          type="button"
          onClick={() => onRename(draft.trim())}
          disabled={isPending}
          className="eyebrow hover:!text-gold shrink-0"
        >
          Guardar
        </button>
      )}
      <InlineConfirm
        label="Eliminar"
        question="¿Eliminar esta clase?"
        onConfirm={onDelete}
        disabled={isPending}
      />
    </li>
  );
}

function HolderLine({
  holder,
  classes,
  totalShares,
  isPending,
  onAssign,
}: {
  holder: HolderRow;
  classes: ClassRow[];
  totalShares: number;
  isPending: boolean;
  onAssign: (classId: string) => void;
}) {
  const pct = totalShares > 0 ? (holder.shares / totalShares) * 100 : 0;
  return (
    <li className="hairline-b last:border-b-0 flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-navy">{holder.name}</p>
        <p className="eyebrow !text-navy/40 mt-0.5">
          {holder.shares.toLocaleString("es-MX")} acciones · {pct.toFixed(1)}%
        </p>
      </div>
      <select
        value={holder.classId}
        onChange={(e) => onAssign(e.target.value)}
        disabled={isPending}
        className={SELECT_CLS}
      >
        <option value="">— Sin clase —</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </li>
  );
}

function ExternalLine({
  row,
  classes,
  totalShares,
  isPending,
  onEdit,
  onDelete,
}: {
  row: ExternalRow;
  classes: ClassRow[];
  totalShares: number;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cls = classes.find((c) => c.id === row.classId);
  const pct = totalShares > 0 ? (row.shareCount / totalShares) * 100 : 0;
  return (
    <li className="hairline-b last:border-b-0 flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-navy">{row.label || cls?.name || "Tenencia"}</p>
        <p className="eyebrow !text-navy/40 mt-0.5">
          {row.peopleCount} persona{row.peopleCount === 1 ? "" : "s"} ·{" "}
          {cls?.name ?? "sin clase"}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="font-mono text-sm text-navy">
          {row.shareCount.toLocaleString("es-MX")}
          <span className="text-navy/40"> · {pct.toFixed(1)}%</span>
        </span>
        <button
          type="button"
          onClick={onEdit}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          Editar
        </button>
        <InlineConfirm
          label="Eliminar"
          question="¿Eliminar esta tenencia?"
          onConfirm={onDelete}
          disabled={isPending}
        />
      </div>
    </li>
  );
}

function ExternalForm({
  initial,
  classes,
  isPending,
  onSubmit,
  onCancel,
}: {
  initial: ExternalRow | null;
  classes: ClassRow[];
  isPending: boolean;
  onSubmit: (input: ExternalInput) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [people, setPeople] = useState(initial ? String(initial.peopleCount) : "1");
  const [shares, setShares] = useState(initial ? String(initial.shareCount) : "");

  const peopleN = Number.parseInt(people || "0", 10);
  const sharesN = Number.parseInt(shares || "0", 10);
  const valid = peopleN >= 1 && sharesN >= 1;

  return (
    <div className="hairline bg-paper p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <label className="block">
          <span className="eyebrow !text-navy/50">Etiqueta (opcional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="ej. Fundadores"
            className={`mt-1 w-full ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">Clase</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={`mt-1 w-full ${SELECT_CLS}`}
          >
            <option value="">— Sin clase —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">Cantidad de personas</span>
          <input
            value={people}
            onChange={(e) => setPeople(e.target.value)}
            inputMode="numeric"
            className={`mt-1 w-full font-mono ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">Cantidad de acciones</span>
          <input
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            inputMode="numeric"
            className={`mt-1 w-full font-mono ${LINE_INPUT}`}
          />
        </label>
      </div>
      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              id: initial?.id,
              label,
              classId,
              peopleCount: peopleN,
              shareCount: sharesN,
            })
          }
          disabled={isPending || !valid}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Guardando…" : initial ? "Guardar" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

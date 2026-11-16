"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  assignHolderClassAction,
  upsertExternalHoldingAction,
  removeExternalHoldingAction,
  createCustomClassAction,
} from "./actions";
import { LINE_INPUT, SELECT_CLS } from "./field-styles";

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

type CompDict = Dict["founderComposicion"];

/** Valor centinela del <select> para "Otro… (crear clase)". */
const NEW_CLASS = "__new__";

/**
 * Crea la clase custom y devuelve `{id, name}` o `null` si falló (el error
 * queda en el estado del editor). La comparte el selector de holders y el
 * formulario de tenencias externas.
 */
type CreateClassFn = (name: string) => Promise<ClassRow | null>;

export function CompositionEditor({
  projectSlug,
  totalShares,
  initialClasses,
  initialHolders,
  initialExternal,
  dict,
  locale,
}: {
  projectSlug: string;
  totalShares: number;
  initialClasses: ClassRow[];
  initialHolders: HolderRow[];
  initialExternal: ExternalRow[];
  dict: CompDict;
  locale: string;
}) {
  // Las 5 canónicas vienen por prop; las custom se agregan al crearlas con
  // "Otro…" (y persisten en DB). No se renombran ni borran desde acá.
  const [classes, setClasses] = useState<ClassRow[]>(initialClasses);
  const [holders, setHolders] = useState<HolderRow[]>(initialHolders);
  const [external, setExternal] = useState<ExternalRow[]>(initialExternal);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      else setError(r.error ?? dict.genericError);
    });
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

  // Crea la clase custom y la suma a la lista local (si no estaba ya, p. ej.
  // porque el server la reutilizó por nombre). Devuelve la clase o null.
  const createClass: CreateClassFn = async (name) => {
    setError(null);
    const r = await createCustomClassAction(projectSlug, name);
    if (!r.ok) {
      setError(r.error ?? dict.genericError);
      return null;
    }
    setClasses((cs) =>
      cs.some((c) => c.id === r.class.id) ? cs : [...cs, r.class]
    );
    return r.class;
  };

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

      {/* ─── Accionistas de AJDUT ────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">{dict.holders.eyebrow}</p>
          <p className="mt-2 text-sm text-navy/70 leading-relaxed">
            {dict.holders.helper}
          </p>
        </div>

        {holders.length === 0 ? (
          <p className="text-sm text-navy/55">{dict.holders.empty}</p>
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
                createClass={createClass}
                sharesAndPctFmt={dict.holders.sharesAndPctFmt}
                noClassLabel={dict.holders.noClass}
                newClassDict={dict.newClass}
                locale={locale}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ─── Accionistas pre-existentes ──────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{dict.external.eyebrow}</p>
            <p className="mt-2 text-sm text-navy/70 leading-relaxed">
              {dict.external.helper}
            </p>
          </div>
          {!showNewExternal && editingExternalId === null && (
            <button
              type="button"
              onClick={() => setShowNewExternal(true)}
              disabled={isPending}
              className="eyebrow hover:!text-gold shrink-0"
            >
              {dict.external.addBtn}
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
            createClass={createClass}
            dict={dict.external.form}
            newClassDict={dict.newClass}
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
                    createClass={createClass}
                    dict={dict.external.form}
                    newClassDict={dict.newClass}
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
                  dict={dict.external}
                  locale={locale}
                />
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Input inline para crear una clase custom. Aparece al elegir "Otro…" en un
 * <select> de clase. `onCreated` recibe la clase creada; `onCancel` vuelve al
 * selector. El error de creación lo muestra el editor (arriba).
 */
function NewClassInput({
  dict,
  disabled,
  createClass,
  onCreated,
  onCancel,
}: {
  dict: CompDict["newClass"];
  disabled: boolean;
  createClass: CreateClassFn;
  onCreated: (cls: ClassRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const valid = name.trim().length >= 2 && name.trim().length <= 40;

  async function submit() {
    if (!valid || creating) return;
    setCreating(true);
    const cls = await createClass(name);
    setCreating(false);
    if (cls) onCreated(cls);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        maxLength={40}
        placeholder={dict.placeholder}
        autoFocus
        disabled={disabled || creating}
        className={`${LINE_INPUT} w-44`}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={disabled || creating || !valid}
        className="eyebrow hover:!text-gold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {creating ? dict.creatingBtn : dict.createBtn}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={creating}
        className="eyebrow !text-navy/40 hover:!text-navy"
      >
        {dict.cancelBtn}
      </button>
    </div>
  );
}

function HolderLine({
  holder,
  classes,
  totalShares,
  isPending,
  onAssign,
  createClass,
  sharesAndPctFmt,
  noClassLabel,
  newClassDict,
  locale,
}: {
  holder: HolderRow;
  classes: ClassRow[];
  totalShares: number;
  isPending: boolean;
  onAssign: (classId: string) => void;
  createClass: CreateClassFn;
  sharesAndPctFmt: string;
  noClassLabel: string;
  newClassDict: CompDict["newClass"];
  locale: string;
}) {
  const [addingClass, setAddingClass] = useState(false);
  const pct = totalShares > 0 ? (holder.shares / totalShares) * 100 : 0;
  const sharesText = sharesAndPctFmt
    .replace("{n}", holder.shares.toLocaleString(locale))
    .replace(
      "{pct}",
      pct.toLocaleString(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    );
  return (
    <li className="hairline-b last:border-b-0 flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-navy break-words">{holder.name}</p>
        <p className="eyebrow !text-navy/40 mt-0.5">{sharesText}</p>
      </div>
      {addingClass ? (
        <NewClassInput
          dict={newClassDict}
          disabled={isPending}
          createClass={createClass}
          onCreated={(cls) => {
            setAddingClass(false);
            onAssign(cls.id);
          }}
          onCancel={() => setAddingClass(false)}
        />
      ) : (
        <select
          value={holder.classId}
          onChange={(e) => {
            if (e.target.value === NEW_CLASS) setAddingClass(true);
            else onAssign(e.target.value);
          }}
          disabled={isPending}
          className={`${SELECT_CLS} shrink-0`}
        >
          <option value="">{noClassLabel}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CLASS}>{newClassDict.option}</option>
        </select>
      )}
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
  dict,
  locale,
}: {
  row: ExternalRow;
  classes: ClassRow[];
  totalShares: number;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  dict: CompDict["external"];
  locale: string;
}) {
  const cls = classes.find((c) => c.id === row.classId);
  const pct = totalShares > 0 ? (row.shareCount / totalShares) * 100 : 0;
  const peopleText = cls
    ? (row.peopleCount === 1
        ? dict.peopleSingleFmt
        : dict.peoplePluralFmt
      )
        .replace("{n}", String(row.peopleCount))
        .replace("{cls}", cls.name)
    : (row.peopleCount === 1
        ? dict.noClassPeopleSingleFmt
        : dict.noClassPeoplePluralFmt
      ).replace("{n}", String(row.peopleCount));
  return (
    <li className="hairline-b last:border-b-0 flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-navy break-words">{row.label || cls?.name || dict.defaultLabel}</p>
        <p className="eyebrow !text-navy/40 mt-0.5">{peopleText}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <span className="font-mono text-sm text-navy">
          {row.shareCount.toLocaleString(locale)}
          <span className="text-navy/40">
            {" "}
            ·{" "}
            {pct.toLocaleString(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
            %
          </span>
        </span>
        <button
          type="button"
          onClick={onEdit}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          {dict.editBtn}
        </button>
        <InlineConfirm
          label={dict.removeBtn}
          question={dict.removeConfirm}
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
  createClass,
  dict,
  newClassDict,
}: {
  initial: ExternalRow | null;
  classes: ClassRow[];
  isPending: boolean;
  onSubmit: (input: ExternalInput) => void;
  onCancel: () => void;
  createClass: CreateClassFn;
  dict: CompDict["external"]["form"];
  newClassDict: CompDict["newClass"];
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [addingClass, setAddingClass] = useState(false);
  const [people, setPeople] = useState(initial ? String(initial.peopleCount) : "1");
  const [shares, setShares] = useState(initial ? String(initial.shareCount) : "");

  const peopleN = Number.parseInt(people || "0", 10);
  const sharesN = Number.parseInt(shares || "0", 10);
  const valid = peopleN >= 1 && sharesN >= 1 && !addingClass;

  return (
    <div className="hairline bg-paper p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.labelLabel}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder={dict.labelPlaceholder}
            className={`mt-1 w-full ${LINE_INPUT}`}
          />
        </label>
        <div className="block">
          <span className="eyebrow !text-navy/50">{dict.classLabel}</span>
          {addingClass ? (
            <div className="mt-1">
              <NewClassInput
                dict={newClassDict}
                disabled={isPending}
                createClass={createClass}
                onCreated={(cls) => {
                  setClassId(cls.id);
                  setAddingClass(false);
                }}
                onCancel={() => setAddingClass(false)}
              />
            </div>
          ) : (
            <select
              value={classId}
              onChange={(e) => {
                if (e.target.value === NEW_CLASS) setAddingClass(true);
                else setClassId(e.target.value);
              }}
              className={`mt-1 w-full ${SELECT_CLS}`}
            >
              <option value="">{dict.noClass}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CLASS}>{newClassDict.option}</option>
            </select>
          )}
        </div>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.peopleLabel}</span>
          <input
            value={people}
            onChange={(e) => setPeople(e.target.value)}
            inputMode="numeric"
            className={`mt-1 w-full font-mono ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.sharesLabel}</span>
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
          {dict.cancelBtn}
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
          {isPending ? dict.savingBtn : initial ? dict.saveBtn : dict.addBtn}
        </button>
      </div>
    </div>
  );
}

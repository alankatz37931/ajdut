"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
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

type CompDict = Dict["founderComposicion"];

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
  // Las clases son FIJAS (las 4 canónicas vienen por prop). No se crean,
  // renombran ni borran acá — el owner solo reasigna participantes entre ellas.
  const classes = initialClasses;
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

      {/* ─── Clases (fijas) ──────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">{dict.classes.eyebrow}</p>
          <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
            {dict.classes.helper}
          </p>
        </div>

        <ul className="hairline-t">
          {classes.map((c) => (
            <li
              key={c.id}
              className="hairline-b last:border-b-0 py-2.5 text-sm text-navy"
            >
              {c.name}
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Accionistas de AJDUT ────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="eyebrow">{dict.holders.eyebrow}</p>
          <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
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
                sharesAndPctFmt={dict.holders.sharesAndPctFmt}
                noClassLabel={dict.holders.noClass}
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
            <p className="mt-2 text-sm text-navy/70 leading-relaxed max-w-xl">
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
            dict={dict.external.form}
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
                    dict={dict.external.form}
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

function HolderLine({
  holder,
  classes,
  totalShares,
  isPending,
  onAssign,
  sharesAndPctFmt,
  noClassLabel,
  locale,
}: {
  holder: HolderRow;
  classes: ClassRow[];
  totalShares: number;
  isPending: boolean;
  onAssign: (classId: string) => void;
  sharesAndPctFmt: string;
  noClassLabel: string;
  locale: string;
}) {
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
      <select
        value={holder.classId}
        onChange={(e) => onAssign(e.target.value)}
        disabled={isPending}
        className={`${SELECT_CLS} shrink-0`}
      >
        <option value="">{noClassLabel}</option>
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
  dict,
}: {
  initial: ExternalRow | null;
  classes: ClassRow[];
  isPending: boolean;
  onSubmit: (input: ExternalInput) => void;
  onCancel: () => void;
  dict: CompDict["external"]["form"];
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
          <span className="eyebrow !text-navy/50">{dict.labelLabel}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder={dict.labelPlaceholder}
            className={`mt-1 w-full ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.classLabel}</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={`mt-1 w-full ${SELECT_CLS}`}
          >
            <option value="">{dict.noClass}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
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

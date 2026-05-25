"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import {
  addHeirAction,
  removeHeirAction,
  setValidationFrequencyAction,
  updateHeirAction,
  type HeirActionResult,
} from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { FloatingInput, FloatingSelect } from "@/components/ui/Floating";
import { ToggleRow } from "@/components/ui/ToggleRow";

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

type HeirsDict = Dict["heirs"];

type Props = {
  initialHeirs: HeirRow[];
  initialValidation: ValidationStateView;
  dict: HeirsDict;
  locale: string;
  /** Notifica al wrapper para flash del indicador "✓ Guardado". */
  onSaved?: () => void;
  /** Reporta errores al wrapper para que los muestre abajo del todo. */
  onError?: (msg: string | null) => void;
};

const emptyHeir: HeirRow = {
  id: "",
  fullName: "",
  email: "",
  relationship: "",
  sharePercent: 0,
};

export function HeirsAndValidation({
  initialHeirs,
  initialValidation,
  dict,
  locale,
  onSaved,
  onError,
}: Props) {
  const [heirs, setHeirs] = useState<HeirRow[]>(initialHeirs);
  const [validation, setValidation] = useState<ValidationStateView>(
    initialValidation
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [openHeirs, setOpenHeirs] = useState(false);
  const [openValidation, setOpenValidation] = useState(false);

  function setError(msg: string | null) {
    onError?.(msg);
  }
  function flashOk() {
    onSaved?.();
  }

  const FREQUENCY_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: dict.validation.freqOptions["0"] },
    { value: 1, label: dict.validation.freqOptions["1"] },
    { value: 3, label: dict.validation.freqOptions["3"] },
    { value: 6, label: dict.validation.freqOptions["6"] },
    { value: 12, label: dict.validation.freqOptions["12"] },
  ];

  const totalShare = heirs.reduce((s, h) => s + h.sharePercent, 0);
  const totalLabel = `${totalShare.toFixed(2)}${dict.allocatedSuffix}`;
  const remainingLabel = `${Math.max(0, 100 - totalShare).toFixed(2)}${dict.remainingSuffix}`;
  const overAllocated = totalShare > 100;

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
        const newRow: HeirRow = {
          id: `tmp-${Date.now()}`,
          fullName: String(fd.get("fullName") ?? ""),
          email: String(fd.get("email") ?? "") || null,
          relationship: String(fd.get("relationship") ?? "") || null,
          sharePercent:
            Number.parseFloat(
              String(fd.get("sharePercent") ?? "0").replace(",", ".")
            ) || 0,
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
    ? `${dict.validation.lastConfirmedPrefix} ${fmtDate(validation.lastConfirmedAt, locale)} — ${humanAgo(validation.lastConfirmedAt, dict.validation.ago)}`
    : dict.validation.emptyLastConfirmed;

  // Resúmenes mostrados a la derecha de cada toggle (cerrado).
  const heirsSummary =
    heirs.length === 0
      ? dict.summaryNone
      : (heirs.length === 1
          ? dict.summaryHeirsSingle
          : dict.summaryHeirsPlural
        )
          .replace("{n}", String(heirs.length))
          .replace("{pct}", totalShare.toFixed(0));

  const validationSummary =
    dict.validation.freqOptions[
      String(validation.frequencyMonths) as keyof HeirsDict["validation"]["freqOptions"]
    ] ?? dict.summaryNone;

  return (
    <div>
      <div>
        <ToggleRow
          label={dict.section1Title}
          summary={heirsSummary}
          open={openHeirs}
          onToggle={() => setOpenHeirs((v) => !v)}
          ariaLabel={dict.toggleAria.replace("{section}", dict.section1Title)}
        >
          <p className="text-sm text-navy/65 leading-relaxed">{dict.section1Desc}</p>

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
                {dict.addHeirBtn}
              </button>
            )}
          </div>

          {overAllocated && (
            <p className="mt-3 eyebrow !text-navy hairline p-3 bg-paper">
              {dict.overAllocatedWarning}
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
                dict={dict.form}
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
                    dict={dict.form}
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
                        {dict.editBtn}
                      </button>
                      <InlineConfirm
                        label={dict.removeBtn}
                        question={dict.removeConfirm}
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
            <p className="mt-4 text-navy/60">{dict.emptyHeirs}</p>
          )}
        </ToggleRow>

        <ToggleRow
          label={dict.validation.title}
          summary={validationSummary}
          open={openValidation}
          onToggle={() => setOpenValidation((v) => !v)}
          ariaLabel={dict.toggleAria.replace("{section}", dict.validation.title)}
        >
          <p className="text-sm text-navy/65 leading-relaxed">
            {dict.validation.desc}
          </p>

          <div className="mt-5 max-w-xs">
            <FloatingSelect
              id="frequencyMonths"
              label={dict.validation.frequencyLabel}
              value={String(validation.frequencyMonths)}
              onChange={(v) => onFrequencyChange(Number.parseInt(v, 10))}
              options={FREQUENCY_OPTIONS.map((o) => ({
                value: String(o.value),
                label: o.label,
              }))}
              disabled={isPending}
            />
          </div>

          <div className="mt-6 hairline p-4 bg-paper space-y-2">
            <p className="eyebrow">
              <span className="!text-navy/60">{lastConfirmedLabel}</span>
            </p>
            {validation.pendingCheck && (
              <p className="eyebrow !text-gold">
                {dict.validation.pendingSincePrefix}{" "}
                {fmtDate(validation.pendingCheck.sentAt, locale)}
              </p>
            )}
          </div>

          {validation.missedCount > 0 && (
            <div className="mt-4 hairline p-4 bg-paper">
              <p className="eyebrow !text-gold">
                ⚠ {validation.missedCount}{" "}
                {validation.missedCount === 1
                  ? dict.validation.missedSingle
                  : dict.validation.missedPlural}
                .
              </p>
              <p className="mt-2 text-sm text-navy/75">
                {validation.heirsEscalated
                  ? dict.validation.escalated
                  : validation.missedCount >= 2
                  ? dict.validation.almostEscalated
                  : dict.validation.keepResponding}
              </p>
            </div>
          )}
        </ToggleRow>
      </div>

    </div>
  );
}

function HeirForm({
  heir,
  isNew = false,
  onSubmit,
  onCancel,
  isPending,
  dict,
}: {
  heir: HeirRow;
  isNew?: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
  dict: HeirsDict["form"];
}) {
  const [fullName, setFullName] = useState(heir.fullName);
  const [email, setEmail] = useState(heir.email ?? "");
  const [relationship, setRelationship] = useState(heir.relationship ?? "");
  const [sharePercent, setSharePercent] = useState(
    heir.sharePercent ? String(heir.sharePercent) : ""
  );

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <FloatingInput
          id="fullName"
          label={dict.fullName}
          value={fullName}
          onChange={setFullName}
          autoFocus={isNew}
          required
        />
        <FloatingInput
          id="email"
          type="email"
          inputMode="email"
          label={dict.email}
          value={email}
          onChange={setEmail}
        />
        <FloatingInput
          id="relationship"
          label={dict.relationship}
          value={relationship}
          onChange={setRelationship}
        />
        <FloatingInput
          id="sharePercent"
          inputMode="decimal"
          label={dict.sharePercent}
          value={sharePercent}
          onChange={setSharePercent}
          required
        />
      </div>
      <div className="flex justify-end gap-4 hairline-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="eyebrow hover:!text-gold"
        >
          {dict.cancelBtn}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.savingBtn : isNew ? dict.addBtn : dict.saveBtn}
        </button>
      </div>
    </form>
  );
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function humanAgo(iso: string, ago: HeirsDict["validation"]["ago"]): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return ago.hours;
  if (days < 30) {
    return days === 1
      ? ago.daySingle
      : ago.daysPlural.replace("{n}", String(days));
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return months === 1
      ? ago.monthSingle
      : ago.monthsPlural.replace("{n}", String(months));
  }
  const years = Math.floor(months / 12);
  return years === 1
    ? ago.yearSingle
    : ago.yearsPlural.replace("{n}", String(years));
}

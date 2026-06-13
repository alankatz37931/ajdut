"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { upsertFounderAction, removeFounderAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { LINE_INPUT, SELECT_CLS } from "./field-styles";

type EquipoDict = Dict["founderEquipo"];

type ShareholderClass = { id: string; name: string };

type Founder = {
  id: string;
  fullName: string;
  role: string;
  bio: string;
  references: string;
  linkedinUrl: string;
  equityPercent: number;
  joinedAt: string;
  isActive: boolean;
  shareholderClassId: string;
  vestingMonths: number;
  vestingInitialPercent: number;
  vestingFinalPercent: number;
};

const empty: Founder = {
  id: "",
  fullName: "",
  role: "",
  bio: "",
  references: "",
  linkedinUrl: "",
  equityPercent: 0,
  joinedAt: "",
  isActive: true,
  shareholderClassId: "",
  vestingMonths: 0,
  vestingInitialPercent: 0,
  vestingFinalPercent: 0,
};

export function TeamEditor({
  projectSlug,
  initialFounders,
  shareholderClasses,
  dict,
  locale,
}: {
  projectSlug: string;
  initialFounders: Founder[];
  shareholderClasses: ShareholderClass[];
  dict: EquipoDict;
  locale: string;
}) {
  const classNameById = new Map(shareholderClasses.map((c) => [c.id, c.name]));
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
  const fmtPct2 = (n: number) =>
    n.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="mt-8 space-y-12">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      {/* ─── Miembros del equipo ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{dict.membersEyebrow}</p>
            <p className="mt-2 text-sm text-navy/70 leading-relaxed">
              {dict.equityTotalFmt.split(/(\{pct\})/).map((part, i) =>
                part === "{pct}" ? (
                  <span key={i} className="font-mono text-navy">
                    {fmtPct2(totalEquity)}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          </div>
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
          <FounderForm
            founder={empty}
            onSubmit={onSubmit}
            onCancel={() => setShowNew(false)}
            isPending={isPending}
            dict={dict}
            shareholderClasses={shareholderClasses}
          />
        )}

        {initialFounders.length > 0 && (
          <ul className="hairline-t">
            {initialFounders.map((f) => (
              <li key={f.id} className="hairline-b last:border-b-0 py-3">
                {editingId === f.id ? (
                  <FounderForm
                    founder={f}
                    onSubmit={onSubmit}
                    onCancel={() => setEditingId(null)}
                    isPending={isPending}
                    dict={dict}
                    shareholderClasses={shareholderClasses}
                  />
                ) : (
                  <div className="grid grid-cols-12 items-center gap-x-3 gap-y-2">
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="font-sans text-navy break-words">{f.fullName}</p>
                    <p className="mt-1 eyebrow">{f.role}</p>
                    <p className="mt-1 eyebrow !text-navy/60">
                      {f.shareholderClassId
                        ? classNameById.get(f.shareholderClassId) ?? dict.classNone
                        : dict.classNone}
                    </p>
                    {f.linkedinUrl && (
                      <a
                        href={f.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 eyebrow !text-gold inline-block break-all"
                      >
                        {dict.linkedin}
                      </a>
                    )}
                  </div>
                  <div className="col-span-6 sm:col-span-2 font-mono text-navy">
                    {fmtPct2(f.equityPercent)}%
                    {f.vestingMonths > 0 && (
                      <span className="mt-1 block eyebrow !text-gold font-sans normal-case">
                        {dict.vestingBadgeFmt.replace(
                          "{n}",
                          String(f.vestingMonths)
                        )}
                      </span>
                    )}
                  </div>
                  <div className="col-span-6 sm:col-span-2 eyebrow">
                    {f.isActive ? dict.active : dict.inactive}
                  </div>
                  <div className="col-span-12 sm:col-span-3 flex justify-end gap-3 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingId(f.id)}
                      className="eyebrow hover:!text-gold"
                    >
                      {dict.editBtn}
                    </button>
                    <InlineConfirm
                      label={dict.removeBtn}
                      question={dict.removeConfirm}
                      onConfirm={() => onRemove(f.id)}
                      disabled={isPending}
                    />
                  </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {initialFounders.length === 0 && !showNew && (
          <p className="text-sm text-navy/55">{dict.empty}</p>
        )}
      </section>
    </div>
  );
}

function FounderForm({
  founder,
  onSubmit,
  onCancel,
  isPending,
  dict,
  shareholderClasses,
}: {
  founder: Founder;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
  dict: EquipoDict;
  shareholderClasses: ShareholderClass[];
}) {
  const [fullName, setFullName] = useState(founder.fullName);
  const [role, setRole] = useState(founder.role);
  const [equityPercent, setEquityPercent] = useState(
    founder.equityPercent ? String(founder.equityPercent) : ""
  );
  const [joinedAt, setJoinedAt] = useState(founder.joinedAt);
  const [linkedinUrl, setLinkedinUrl] = useState(founder.linkedinUrl);
  const [bio, setBio] = useState(founder.bio);
  const [references, setReferences] = useState(founder.references);
  const [isActive, setIsActive] = useState(String(founder.isActive));
  const [shareholderClassId, setShareholderClassId] = useState(
    founder.shareholderClassId
  );
  const [vestingMode, setVestingMode] = useState(
    founder.vestingMonths > 0 ? "gradual" : "all"
  );
  const [vestingMonths, setVestingMonths] = useState(
    founder.vestingMonths > 0 ? String(founder.vestingMonths) : ""
  );
  const [vestingInitialPercent, setVestingInitialPercent] = useState(
    founder.vestingMonths > 0 ? String(founder.vestingInitialPercent) : ""
  );
  const [vestingFinalPercent, setVestingFinalPercent] = useState(
    founder.vestingMonths > 0 ? String(founder.vestingFinalPercent) : ""
  );

  const totalPct = Number.parseFloat(equityPercent) || 0;
  const initialPct = Number.parseFloat(vestingInitialPercent) || 0;
  const finalPct = Number.parseFloat(vestingFinalPercent) || 0;
  const monthsN = Number.parseInt(vestingMonths, 10) || 0;
  const monthlyTotal = totalPct - initialPct - finalPct;
  const monthlyNegative = monthlyTotal < 0;
  const fmtPctPreview = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const classOptions = [
    { value: "", label: dict.classNone },
    ...shareholderClasses.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form action={onSubmit} className="hairline bg-paper p-4 space-y-4">
      <input type="hidden" name="founderId" value={founder.id} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.form.fullNameLabel}</span>
          <input
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={`mt-1 w-full ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.form.roleLabel}</span>
          <input
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className={`mt-1 w-full ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.form.equityLabel}</span>
          <input
            name="equityPercent"
            type="number"
            step="any"
            value={equityPercent}
            onChange={(e) => setEquityPercent(e.target.value)}
            className={`mt-1 w-full font-mono ${LINE_INPUT}`}
          />
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.form.joinedAtLabel}</span>
          <input
            name="joinedAt"
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
            className={`mt-1 w-full font-mono ${LINE_INPUT}`}
          />
        </label>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.vestingModeLabel}</span>
          <select
            value={vestingMode}
            onChange={(e) => setVestingMode(e.target.value)}
            className={`mt-1 w-full ${SELECT_CLS}`}
          >
            <option value="all">{dict.vestingModeAllAtOnce}</option>
            <option value="gradual">{dict.vestingModeGradual}</option>
          </select>
        </label>
        {vestingMode === "gradual" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
              <label className="block">
                <span className="eyebrow !text-navy/50">
                  {dict.vestingMonthsLabel}
                </span>
                <input
                  name="vestingMonths"
                  type="number"
                  step="1"
                  value={vestingMonths}
                  onChange={(e) => setVestingMonths(e.target.value)}
                  className={`mt-1 w-full font-mono ${LINE_INPUT}`}
                />
              </label>
              <label className="block">
                <span className="eyebrow !text-navy/50">
                  {dict.vestingInitialLabel}
                </span>
                <input
                  name="vestingInitialPercent"
                  type="number"
                  step="any"
                  value={vestingInitialPercent}
                  onChange={(e) => setVestingInitialPercent(e.target.value)}
                  className={`mt-1 w-full font-mono ${LINE_INPUT}`}
                />
              </label>
              <label className="block">
                <span className="eyebrow !text-navy/50">
                  {dict.vestingFinalLabel}
                </span>
                <input
                  name="vestingFinalPercent"
                  type="number"
                  step="any"
                  value={vestingFinalPercent}
                  onChange={(e) => setVestingFinalPercent(e.target.value)}
                  className={`mt-1 w-full font-mono ${LINE_INPUT}`}
                />
              </label>
            </div>
            <p className="eyebrow !text-navy/60">{dict.vestingMonthsHelper}</p>
            {monthlyNegative ? (
              <p className="eyebrow !text-navy">{dict.vestingSumError}</p>
            ) : (
              <p className="eyebrow !text-gold normal-case font-sans">
                {dict.vestingMonthlyPreviewFmt
                  .replace("{pct}", fmtPctPreview(monthlyTotal))
                  .replace("{n}", String(monthsN || 0))}
              </p>
            )}
          </>
        ) : (
          // "Todas juntas": aseguramos que el FormData mande los campos vacíos.
          <>
            <input type="hidden" name="vestingMonths" value="" />
            <input type="hidden" name="vestingInitialPercent" value="" />
            <input type="hidden" name="vestingFinalPercent" value="" />
          </>
        )}
      </div>

      <label className="block">
        <span className="eyebrow !text-navy/50">{dict.form.linkedinLabel}</span>
        <input
          name="linkedinUrl"
          type="url"
          inputMode="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          className={`mt-1 w-full ${LINE_INPUT}`}
        />
      </label>
      <label className="block">
        <span className="eyebrow !text-navy/50">{dict.form.bioLabel}</span>
        <textarea
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className={`mt-1 block w-full leading-relaxed resize-none ${LINE_INPUT}`}
        />
      </label>
      <label className="block">
        <span className="eyebrow !text-navy/50">{dict.form.referencesLabel}</span>
        <textarea
          name="references"
          value={references}
          onChange={(e) => setReferences(e.target.value)}
          rows={3}
          className={`mt-1 block w-full leading-relaxed resize-none ${LINE_INPUT}`}
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.form.statusLabel}</span>
          <select
            name="isActive"
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            className={`mt-1 w-full ${SELECT_CLS}`}
          >
            <option value="true">{dict.form.statusActive}</option>
            <option value="false">{dict.form.statusInactive}</option>
          </select>
        </label>
        <label className="block">
          <span className="eyebrow !text-navy/50">{dict.classLabel}</span>
          <select
            name="shareholderClassId"
            value={shareholderClassId}
            onChange={(e) => setShareholderClassId(e.target.value)}
            className={`mt-1 w-full ${SELECT_CLS}`}
          >
            {classOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-4">
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

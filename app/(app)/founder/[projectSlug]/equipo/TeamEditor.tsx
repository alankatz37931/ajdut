"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { upsertFounderAction, removeFounderAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
  FloatingDate,
} from "@/components/ui/Floating";

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
    <div className="mt-8 space-y-6">
      {error && (
        <p className="eyebrow !text-navy hairline p-3 bg-paper" role="alert">
          {error}
        </p>
      )}

      <div className="hairline p-4 bg-paper flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
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

      <ul className="space-y-3">
        {initialFounders.map((f) => (
          <li key={f.id} className="hairline p-4 bg-paper">
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
              <div className="grid grid-cols-12 items-center gap-x-3 gap-y-3">
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

      {initialFounders.length === 0 && !showNew && (
        <p className="text-navy/60">{dict.empty}</p>
      )}
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

  const hasClasses = shareholderClasses.length > 0;
  const classOptions = [
    { value: "", label: dict.classNone },
    ...shareholderClasses.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form action={onSubmit} className="space-y-5">
      <input type="hidden" name="founderId" value={founder.id} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <FloatingInput
          id="fullName"
          label={dict.form.fullNameLabel}
          value={fullName}
          onChange={setFullName}
          required
        />
        <FloatingInput
          id="role"
          label={dict.form.roleLabel}
          value={role}
          onChange={setRole}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:items-end">
        <FloatingInput
          id="equityPercent"
          type="number"
          step="any"
          label={dict.form.equityLabel}
          value={equityPercent}
          onChange={setEquityPercent}
        />
        <FloatingDate
          id="joinedAt"
          label={dict.form.joinedAtLabel}
          value={joinedAt}
          onChange={setJoinedAt}
        />
      </div>

      <div>
        <FloatingSelect
          id="vestingMode"
          label={dict.vestingModeLabel}
          value={vestingMode}
          onChange={setVestingMode}
          options={[
            { value: "all", label: dict.vestingModeAllAtOnce },
            { value: "gradual", label: dict.vestingModeGradual },
          ]}
        />
        {vestingMode === "gradual" ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
              <FloatingInput
                id="vestingMonths"
                type="number"
                step="1"
                label={dict.vestingMonthsLabel}
                value={vestingMonths}
                onChange={setVestingMonths}
              />
              <FloatingInput
                id="vestingInitialPercent"
                type="number"
                step="any"
                label={dict.vestingInitialLabel}
                value={vestingInitialPercent}
                onChange={setVestingInitialPercent}
              />
              <FloatingInput
                id="vestingFinalPercent"
                type="number"
                step="any"
                label={dict.vestingFinalLabel}
                value={vestingFinalPercent}
                onChange={setVestingFinalPercent}
              />
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
          </div>
        ) : (
          // "Todas juntas": aseguramos que el FormData mande los campos vacíos.
          <>
            <input type="hidden" name="vestingMonths" value="" />
            <input type="hidden" name="vestingInitialPercent" value="" />
            <input type="hidden" name="vestingFinalPercent" value="" />
          </>
        )}
      </div>

      <FloatingInput
        id="linkedinUrl"
        type="url"
        inputMode="url"
        label={dict.form.linkedinLabel}
        value={linkedinUrl}
        onChange={setLinkedinUrl}
      />
      <FloatingTextarea
        id="bio"
        label={dict.form.bioLabel}
        value={bio}
        onChange={setBio}
        rows={3}
      />
      <FloatingTextarea
        id="references"
        label={dict.form.referencesLabel}
        value={references}
        onChange={setReferences}
        rows={3}
      />
      <div>
        <FloatingSelect
          id="isActive"
          label={dict.form.statusLabel}
          value={isActive}
          onChange={setIsActive}
          options={[
            { value: "true", label: dict.form.statusActive },
            { value: "false", label: dict.form.statusInactive },
          ]}
        />
        <input type="hidden" name="isActive" value={isActive} />
      </div>
      <div>
        <FloatingSelect
          id="shareholderClassId"
          label={dict.classLabel}
          value={shareholderClassId}
          onChange={setShareholderClassId}
          options={classOptions}
          disabled={!hasClasses}
        />
        <input
          type="hidden"
          name="shareholderClassId"
          value={shareholderClassId}
        />
        {!hasClasses && (
          <p className="mt-1.5 eyebrow !text-navy/60">
            {dict.classHintNoClasses}
          </p>
        )}
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

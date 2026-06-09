"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { createVestingScheduleAction } from "./actions";
import {
  FloatingInput,
  FloatingSelect,
  FloatingDate,
  FloatingTextarea,
} from "@/components/ui/Floating";
import { useSafeAction } from "@/components/hooks/useSafeAction";

type VestingDict = Dict["founderVesting"];

type Member = { id: string; label: string };

type Props = {
  projectSlug: string;
  availableShares: number;
  members: Member[];
  dict: VestingDict;
  locale: string;
};

type SuccessState = {
  releaseCount: number;
  totalShares: number;
  exceedsAvailableWarning: boolean;
};

type CustomRow = { shareCount: string; date: string };

export function VestingForm({
  projectSlug,
  availableShares,
  members,
  dict,
  locale,
}: Props) {
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // Destinatario
  const [targetMode, setTargetMode] = useState<"email" | "user">(
    members.length > 0 ? "user" : "email"
  );
  const [targetUserId, setTargetUserId] = useState<string>(
    members[0]?.id ?? ""
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // Cronograma
  const [mode, setMode] = useState<"monthly" | "custom">("monthly");
  const [totalShares, setTotalShares] = useState("");
  const [installments, setInstallments] = useState("");
  const [startAt, setStartAt] = useState("");
  const [reason, setReason] = useState("");
  const [customRows, setCustomRows] = useState<CustomRow[]>([
    { shareCount: "", date: "" },
  ]);

  const boundAction = useCallback(
    (fd: FormData) => createVestingScheduleAction(projectSlug, fd),
    [projectSlug]
  );
  const { run, isPending, error, reset } = useSafeAction<
    FormData,
    { ok: true; data: SuccessState }
  >(boundAction, {
    onSuccess: ({ data }) => {
      setSuccess(data);
      setEmail("");
      setName("");
      setTotalShares("");
      setInstallments("");
      setStartAt("");
      setReason("");
      setCustomRows([{ shareCount: "", date: "" }]);
    },
  });

  // Preview del monto por tramo en modo mensual.
  const perInstallment = useMemo(() => {
    const total = Number.parseInt(totalShares, 10);
    const n = Number.parseInt(installments, 10);
    if (!Number.isFinite(total) || !Number.isFinite(n) || n < 1) return null;
    return Math.floor(total / n);
  }, [totalShares, installments]);

  // Suma de tramos custom para feedback.
  const customSum = useMemo(
    () =>
      customRows.reduce((s, r) => {
        const v = Number.parseInt(r.shareCount, 10);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0),
    [customRows]
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    setSuccess(null);

    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("targetMode", targetMode);
    fd.set("targetUserId", targetUserId);
    fd.set("targetEmail", email);
    fd.set("targetName", name);
    fd.set("totalShares", totalShares);
    fd.set("reason", reason);
    if (mode === "monthly") {
      fd.set("installments", installments);
      fd.set("startAt", startAt);
    } else {
      fd.set(
        "customReleases",
        JSON.stringify(
          customRows.map((r) => ({
            shareCount: Number.parseInt(r.shareCount, 10),
            date: r.date,
          }))
        )
      );
    }
    run(fd);
  }

  function updateRow(idx: number, patch: Partial<CustomRow>) {
    setCustomRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }
  function addRow() {
    setCustomRows((rows) => [...rows, { shareCount: "", date: "" }]);
  }
  function removeRow(idx: number) {
    setCustomRows((rows) =>
      rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows
    );
  }

  return (
    <section className="mt-14">
      <div className="hairline-b pb-3 mb-6">
        <p className="eyebrow !text-navy">{dict.formTitle}</p>
        <p className="mt-2 text-sm text-navy/60 leading-relaxed">
          {dict.formIntro}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ─── Destinatario ─────────────────────────────────────────── */}
        {members.length > 0 && (
          <FloatingSelect
            id="targetMode"
            label={dict.targetModeLabel}
            value={targetMode}
            onChange={(v) => setTargetMode(v as "email" | "user")}
            options={[
              { value: "user", label: dict.targetModeUser },
              { value: "email", label: dict.targetModeEmail },
            ]}
          />
        )}

        {targetMode === "user" && members.length > 0 ? (
          <FloatingSelect
            id="targetUserId"
            label={dict.targetUserLabel}
            value={targetUserId}
            onChange={setTargetUserId}
            options={members.map((m) => ({ value: m.id, label: m.label }))}
          />
        ) : (
          <>
            <FloatingInput
              id="targetEmail"
              type="email"
              inputMode="email"
              label={dict.emailLabel}
              value={email}
              onChange={setEmail}
              required
            />
            <div>
              <FloatingInput
                id="targetName"
                label={dict.nameLabel}
                value={name}
                onChange={setName}
                maxLength={120}
                required
              />
              <p className="eyebrow !text-navy/50 mt-1.5">{dict.nameHelper}</p>
            </div>
          </>
        )}

        {/* ─── Total ────────────────────────────────────────────────── */}
        <div>
          <FloatingInput
            id="totalShares"
            type="number"
            label={dict.totalLabel}
            value={totalShares}
            onChange={setTotalShares}
            required
          />
          <p className="eyebrow !text-navy/50 mt-1.5">
            {dict.totalAvailableFmt
              .split(/(\{n\})/)
              .map((part, i) =>
                part === "{n}" ? (
                  <span key={i} className="font-mono text-navy">
                    {availableShares.toLocaleString(locale)}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
          </p>
        </div>

        {/* ─── Modo del cronograma ──────────────────────────────────── */}
        <FloatingSelect
          id="mode"
          label={dict.modeLabel}
          value={mode}
          onChange={(v) => setMode(v as "monthly" | "custom")}
          options={[
            { value: "monthly", label: dict.modeMonthly },
            { value: "custom", label: dict.modeCustom },
          ]}
        />

        {mode === "monthly" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FloatingInput
                id="installments"
                type="number"
                label={dict.installmentsLabel}
                value={installments}
                onChange={setInstallments}
                required
              />
              <FloatingDate
                id="startAt"
                label={dict.startAtLabel}
                value={startAt}
                onChange={setStartAt}
                required
              />
            </div>
            {perInstallment !== null && perInstallment > 0 && (
              <p className="eyebrow !text-navy/50">
                {dict.perInstallmentFmt.replace(
                  "{n}",
                  perInstallment.toLocaleString(locale)
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="eyebrow !text-navy/60">{dict.customHelper}</p>
            <ul className="space-y-4">
              {customRows.map((row, idx) => (
                <li
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end"
                >
                  <FloatingInput
                    id={`custom-shares-${idx}`}
                    type="number"
                    label={dict.customSharesLabel}
                    value={row.shareCount}
                    onChange={(v) => updateRow(idx, { shareCount: v })}
                  />
                  <FloatingDate
                    id={`custom-date-${idx}`}
                    label={dict.customDateLabel}
                    value={row.date}
                    onChange={(v) => updateRow(idx, { date: v })}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={customRows.length <= 1}
                    className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-30 pb-2"
                  >
                    {dict.removeRowBtn}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={addRow}
                className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
              >
                {dict.addRowBtn}
              </button>
              <span className="eyebrow !text-navy/50">
                {dict.customSumFmt.replace(
                  "{n}",
                  customSum.toLocaleString(locale)
                )}
              </span>
            </div>
          </div>
        )}

        <FloatingTextarea
          id="reason"
          label={dict.reasonLabel}
          value={reason}
          onChange={setReason}
          rows={3}
          maxLength={500}
        />

        {error && (
          <p className="eyebrow !text-navy" role="alert">
            {error}
          </p>
        )}
        {success && (
          <div className="hairline p-3 bg-paper-light" role="status">
            <p className="eyebrow !text-gold">{dict.successEyebrow}</p>
            <p className="mt-2 text-sm text-navy/75">
              {dict.successBodyFmt
                .replace("{count}", success.releaseCount.toLocaleString(locale))
                .replace("{total}", success.totalShares.toLocaleString(locale))}
            </p>
            {success.exceedsAvailableWarning && (
              <p className="mt-2 text-sm text-navy/75">
                {dict.exceedsWarning}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary disabled:opacity-50"
          >
            {isPending ? dict.creatingBtn : dict.createBtn}
          </button>
          <span className="eyebrow !text-navy/40">{dict.disclaimer}</span>
        </div>
      </form>
    </section>
  );
}

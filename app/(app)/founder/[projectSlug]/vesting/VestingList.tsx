"use client";

import { useCallback } from "react";
import type { Dict } from "@/lib/i18n";
import { cancelVestingScheduleAction } from "./actions";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { useSafeAction } from "@/components/hooks/useSafeAction";
import { formatDate } from "@/lib/utils/format";

type VestingDict = Dict["founderVesting"];

type ReleaseView = {
  id: string;
  shareCount: number;
  releaseAt: string;
  status: string;
};

type ScheduleView = {
  id: string;
  status: string;
  targetLabel: string;
  targetEmail: string | null;
  totalShares: number;
  reason: string | null;
  releasedCount: number;
  totalReleases: number;
  deliveredShares: number;
  nextReleaseAt: string | null;
  releases: ReleaseView[];
};

type Props = {
  projectSlug: string;
  schedules: ScheduleView[];
  dict: VestingDict;
  locale: string;
};

export function VestingList({ projectSlug, schedules, dict, locale }: Props) {
  if (schedules.length === 0) {
    return (
      <section className="mt-12">
        <div className="hairline-b pb-3 mb-6">
          <p className="eyebrow !text-navy">{dict.listTitle}</p>
        </div>
        <p className="text-navy/60">{dict.emptyList}</p>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <div className="hairline-b pb-3 mb-6">
        <p className="eyebrow !text-navy">{dict.listTitle}</p>
      </div>
      <ul className="space-y-6">
        {schedules.map((s) => (
          <ScheduleCard
            key={s.id}
            projectSlug={projectSlug}
            schedule={s}
            dict={dict}
            locale={locale}
          />
        ))}
      </ul>
    </section>
  );
}

function ScheduleCard({
  projectSlug,
  schedule,
  dict,
  locale,
}: {
  projectSlug: string;
  schedule: ScheduleView;
  dict: VestingDict;
  locale: string;
}) {
  const cancelFn = useCallback(
    () => cancelVestingScheduleAction(projectSlug, schedule.id),
    [projectSlug, schedule.id]
  );
  const { run, isPending, error } = useSafeAction<void>(cancelFn);

  const isActive = schedule.status === "ACTIVE";
  const statusLabel =
    dict.scheduleStatus[schedule.status as keyof typeof dict.scheduleStatus] ??
    schedule.status;
  const progressPct =
    schedule.totalReleases > 0
      ? Math.round((schedule.releasedCount / schedule.totalReleases) * 100)
      : 0;

  return (
    <li className="hairline bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-sans text-navy text-lg leading-tight break-words">
            {schedule.targetLabel}
          </p>
          {schedule.targetEmail && (
            <p className="mt-0.5 eyebrow !text-navy/50 truncate">
              {schedule.targetEmail}
            </p>
          )}
        </div>
        <span
          className={`eyebrow shrink-0 ${
            isActive ? "!text-gold" : "!text-navy/40"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Progreso */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-sm">
        <div>
          <p className="eyebrow !text-navy/40">{dict.colTotal}</p>
          <p className="mt-1 text-navy">{schedule.totalShares.toLocaleString(locale)}</p>
        </div>
        <div>
          <p className="eyebrow !text-navy/40">{dict.colProgress}</p>
          <p className="mt-1 text-navy">
            {dict.progressFmt
              .replace("{x}", String(schedule.releasedCount))
              .replace("{y}", String(schedule.totalReleases))}
          </p>
        </div>
        <div>
          <p className="eyebrow !text-navy/40">{dict.colNext}</p>
          <p className="mt-1 text-navy">
            {schedule.nextReleaseAt
              ? formatDate(schedule.nextReleaseAt, locale)
              : "—"}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mt-4 h-2 rounded-full bg-line/70 overflow-hidden">
        <div
          className="h-full bg-gold rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
          aria-hidden
        />
      </div>

      {schedule.reason && (
        <p className="mt-4 text-sm text-navy/70 leading-relaxed whitespace-pre-line">
          “{schedule.reason}”
        </p>
      )}

      {/* Tramos */}
      <ul className="mt-4 hairline-t">
        {schedule.releases.map((r) => (
          <li
            key={r.id}
            className="hairline-b last:border-b-0 py-2 flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-mono text-navy/60">
              {formatDate(r.releaseAt, locale)}
            </span>
            <span className="flex items-baseline gap-3 shrink-0 font-mono">
              <span
                className={`eyebrow ${
                  r.status === "RELEASED"
                    ? "!text-gold"
                    : r.status === "SKIPPED"
                      ? "!text-navy"
                      : r.status === "CANCELLED"
                        ? "!text-navy/30"
                        : "!text-navy/50"
                }`}
              >
                {dict.releaseStatus[
                  r.status as keyof typeof dict.releaseStatus
                ] ?? r.status}
              </span>
              <span className="text-navy">{r.shareCount.toLocaleString(locale)}</span>
            </span>
          </li>
        ))}
      </ul>

      {isActive && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <InlineConfirm
            label={dict.cancelBtn}
            question={dict.cancelConfirm}
            onConfirm={() => run()}
            disabled={isPending}
            className="eyebrow hover:!text-navy !text-navy/40 p-0 m-0 border-0 bg-transparent cursor-pointer disabled:opacity-50"
          />
          {error && (
            <span className="eyebrow !text-navy" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

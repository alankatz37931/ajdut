"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { runValidationCronAction } from "./actions";
import type { CronRunStats } from "@/lib/services/heirs";

type CronDict = Dict["adminHerederos"]["cron"];

export function RunCronButton({
  dict,
  locale,
}: {
  dict: CronDict;
  locale: string;
}) {
  const [stats, setStats] = useState<CronRunStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const r = await runValidationCronAction();
      if (r.ok) {
        setStats(r.stats);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="hairline p-4 bg-paper">
      <p className="eyebrow !text-navy/60">{dict.eyebrow}</p>
      <div className="mt-2 flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? dict.runningBtn : dict.runBtn}
        </button>
        <p className="text-sm text-navy/60">{dict.description}</p>
      </div>
      {error && (
        <p className="mt-3 eyebrow !text-navy hairline p-3" role="alert">
          {error}
        </p>
      )}
      {stats && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-sm">
          <Stat label={dict.statUsers} value={stats.usersConsidered} locale={locale} />
          <Stat label={dict.statNew} value={stats.checksCreated} locale={locale} />
          <Stat label={dict.statPending} value={stats.alreadyPending} locale={locale} />
          <Stat label={dict.statMissed} value={stats.checksMissed} locale={locale} />
          <Stat label={dict.statEscalated} value={stats.escalations} locale={locale} />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  locale,
}: {
  label: string;
  value: number;
  locale: string;
}) {
  return (
    <div>
      <p className="eyebrow !text-navy/40">{label}</p>
      <p className="mt-1 text-navy">{value.toLocaleString(locale)}</p>
    </div>
  );
}

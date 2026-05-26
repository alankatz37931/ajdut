"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { runValidationCronAction } from "./actions";
import type { CronRunStats } from "@/lib/services/heirs";

type CronDict = Dict["adminHerederos"]["cron"];

/**
 * Control del cron: vive en su propia fila debajo del header. Eyebrow
 * con descripcion + CTA "RUN CHECKS →" alineados. Tras ejecutar, las
 * stats caen debajo en una grid limpia (sin caja, solo hairline-t).
 */
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
    <section className="hairline-t hairline-b py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-navy/65 leading-relaxed">
          {dict.description}
        </p>
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="eyebrow !text-navy/50 hover:!text-gold disabled:opacity-50 transition-colors p-0 m-0 border-0 bg-transparent cursor-pointer shrink-0"
        >
          {isPending ? dict.runningEyebrow : dict.runEyebrow}
        </button>
      </div>

      {error && (
        <p
          className="mt-4 eyebrow !text-navy hairline p-3 bg-paper-light"
          role="alert"
        >
          {error}
        </p>
      )}

      {stats && (
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-6 hairline-t pt-4">
          <Stat label={dict.statUsers} value={stats.usersConsidered} locale={locale} />
          <Stat label={dict.statNew} value={stats.checksCreated} locale={locale} />
          <Stat label={dict.statPending} value={stats.alreadyPending} locale={locale} />
          <Stat label={dict.statMissed} value={stats.checksMissed} locale={locale} />
          <Stat label={dict.statEscalated} value={stats.escalations} locale={locale} />
        </dl>
      )}
    </section>
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
      <dt className="eyebrow !text-navy/40">{label}</dt>
      <dd className="mt-1 font-mono text-navy">{value.toLocaleString(locale)}</dd>
    </div>
  );
}

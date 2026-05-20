"use client";

import { useState, useTransition } from "react";
import { runValidationCronAction } from "./actions";
import type { CronRunStats } from "@/lib/services/heirs";

export function RunCronButton() {
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
      <p className="eyebrow !text-navy/60">Operación manual</p>
      <div className="mt-2 flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? "Ejecutando…" : "Ejecutar verificaciones ahora"}
        </button>
        <p className="text-sm text-navy/60">
          Vence checks PENDING de más de 15 días y crea los nuevos que toquen.
        </p>
      </div>
      {error && (
        <p className="mt-3 eyebrow !text-navy hairline p-3" role="alert">
          {error}
        </p>
      )}
      {stats && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-sm">
          <Stat label="Users" value={stats.usersConsidered} />
          <Stat label="Nuevos" value={stats.checksCreated} />
          <Stat label="Pendientes" value={stats.alreadyPending} />
          <Stat label="Vencidos" value={stats.checksMissed} />
          <Stat label="Escalados" value={stats.escalations} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="eyebrow !text-navy/40">{label}</p>
      <p className="mt-1 text-navy">{value.toLocaleString("es-MX")}</p>
    </div>
  );
}

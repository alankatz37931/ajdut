"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect } from "react";

const STAGES = [
  { id: "", label: "Todas las etapas" },
  { id: "IDEA", label: "Idea" },
  { id: "PRE_SEED", label: "Pre-seed" },
  { id: "SEED", label: "Seed" },
  { id: "EARLY_REVENUE", label: "Early revenue" },
  { id: "GROWTH", label: "Growth" },
  { id: "SCALE", label: "Scale" },
] as const;

const ADMIN_STATUSES = [
  { id: "", label: "Todos los estados" },
  { id: "ACTIVE", label: "Activos" },
  { id: "PENDING_APPROVAL", label: "Pendientes" },
  { id: "SUSPENDED", label: "Suspendidos" },
  { id: "CLOSED", label: "Cerrados" },
] as const;

export function ProjectFilters({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sector, setSector] = useState(params.get("sector") ?? "");
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");

  // Sincronizar al cambiar URL externamente (botón back, etc.)
  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setSector(params.get("sector") ?? "");
    setStage(params.get("stage") ?? "");
    setStatus(params.get("status") ?? "");
  }, [params]);

  function apply(next: { q?: string; sector?: string; stage?: string; status?: string }) {
    const sp = new URLSearchParams();
    const q = next.q !== undefined ? next.q : query;
    const sec = next.sector !== undefined ? next.sector : sector;
    const stg = next.stage !== undefined ? next.stage : stage;
    const st = next.status !== undefined ? next.status : status;
    if (q.trim()) sp.set("q", q.trim());
    if (sec.trim()) sp.set("sector", sec.trim());
    if (stg) sp.set("stage", stg);
    if (st && isAdmin) sp.set("status", st);
    startTransition(() => {
      const qs = sp.toString();
      router.push(qs ? `/proyectos?${qs}` : "/proyectos");
    });
  }

  function reset() {
    setQuery("");
    setSector("");
    setStage("");
    setStatus("");
    startTransition(() => router.push("/proyectos"));
  }

  const hasAny = query || sector || stage || status;

  const inputCls =
    "w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy text-sm focus:outline-none focus:border-navy";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
    >
      <div>
        <label htmlFor="q" className="eyebrow block mb-2">
          Buscar por nombre
        </label>
        <input
          id="q"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pushka, Mercurio, ..."
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="sector" className="eyebrow block mb-2">
          Sector
        </label>
        <input
          id="sector"
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="Fintech, Health, Gaming, ..."
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="stage" className="eyebrow block mb-2">
          Stage
        </label>
        <select
          id="stage"
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            apply({ stage: e.target.value });
          }}
          className={inputCls}
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {isAdmin ? (
        <div>
          <label htmlFor="status" className="eyebrow block mb-2">
            Estado
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              apply({ status: e.target.value });
            }}
            className={inputCls}
          >
            {ADMIN_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex gap-3 items-end">
          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Filtrando…" : "Buscar"}
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-3">
          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Filtrando…" : "Buscar"}
          </button>
          {hasAny && (
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer self-center"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
      {!isAdmin && hasAny && (
        <button
          type="button"
          onClick={reset}
          disabled={isPending}
          className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer self-end pb-3 sm:col-span-2 lg:col-span-4"
        >
          Limpiar filtros
        </button>
      )}
    </form>
  );
}

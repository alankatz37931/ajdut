"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect } from "react";

type GroupOption = { prefix: string; label: string };

export function AuditFilters({
  groupOptions,
  actionOptions,
  actionLabels,
  actionGroupLabels,
}: {
  groupOptions: GroupOption[];
  actionOptions: string[];
  actionLabels: Record<string, string>;
  actionGroupLabels: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [group, setGroup] = useState(params.get("group") ?? "");
  const [action, setAction] = useState(params.get("action") ?? "");
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    setGroup(params.get("group") ?? "");
    setAction(params.get("action") ?? "");
    setActor(params.get("actor") ?? "");
    setQ(params.get("q") ?? "");
  }, [params]);

  function apply(next: Partial<{ group: string; action: string; actor: string; q: string }>) {
    const sp = new URLSearchParams();
    const g = next.group !== undefined ? next.group : group;
    const a = next.action !== undefined ? next.action : action;
    const ac = next.actor !== undefined ? next.actor : actor;
    const query = next.q !== undefined ? next.q : q;
    if (g) sp.set("group", g);
    if (a) sp.set("action", a);
    if (ac.trim()) sp.set("actor", ac.trim());
    if (query.trim()) sp.set("q", query.trim());
    startTransition(() => {
      const qs = sp.toString();
      router.push(qs ? `/admin/auditoria?${qs}` : "/admin/auditoria");
    });
  }

  function reset() {
    setGroup("");
    setAction("");
    setActor("");
    setQ("");
    startTransition(() => router.push("/admin/auditoria"));
  }

  // Para el dropdown de Categoría, agrupamos por label para evitar duplicados
  // (EMAIL y RATE_LIMIT comparten label "Sistema"; el value es el primer prefijo).
  const groupedByLabel = new Map<string, string[]>();
  for (const g of groupOptions) {
    const list = groupedByLabel.get(g.label) ?? [];
    list.push(g.prefix);
    groupedByLabel.set(g.label, list);
  }

  const hasAny = group || action || actor || q;

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
        <label htmlFor="group" className="eyebrow block mb-2">
          Categoría
        </label>
        <select
          id="group"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setAction("");
            apply({ group: e.target.value, action: "" });
          }}
          className={inputCls}
        >
          <option value="">Todas</option>
          {groupOptions.map((g) => (
            <option key={g.prefix} value={g.prefix}>
              {g.label}
              {(groupedByLabel.get(g.label)?.length ?? 1) > 1 ? ` (${g.prefix})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="action" className="eyebrow block mb-2">
          Acción específica
        </label>
        <select
          id="action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            apply({ action: e.target.value });
          }}
          className={inputCls}
        >
          <option value="">Todas</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {actionLabels[a] ?? a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="actor" className="eyebrow block mb-2">
          Actor (email o nombre)
        </label>
        <input
          id="actor"
          type="text"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="ana@…"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="q" className="eyebrow block mb-2">
          Buscar (entidad / IP / proyecto)
        </label>
        <input
          id="q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="cmaXXXX o IP"
          className={inputCls}
        />
      </div>

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

      <p className="sm:col-span-2 lg:col-span-4 eyebrow !text-navy/40 mt-1">
        Nota: la categoría {actionGroupLabels["EMAIL"]} agrupa eventos de sistema; no todos los
        prefijos están listados acá.
      </p>
    </form>
  );
}

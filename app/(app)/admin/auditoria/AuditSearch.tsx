"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

/**
 * Búsqueda instantánea por actor — mismo patrón que /proyectos:
 * debounce ~250ms + router.replace, sin botón.
 */
export function AuditSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("actor") ?? "");

  useEffect(() => {
    setQuery(params.get("actor") ?? "");
  }, [params]);

  useEffect(() => {
    const current = params.get("actor") ?? "";
    const next = query.trim();
    if (next === current) return;
    const t = setTimeout(() => {
      router.replace(
        next ? `/admin/auditoria?actor=${encodeURIComponent(next)}` : "/admin/auditoria"
      );
    }, 250);
    return () => clearTimeout(t);
  }, [query, params, router]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="actor" className="eyebrow">
          Buscar por actor
        </label>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            Limpiar
          </button>
        )}
      </div>
      <input
        id="actor"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="email o nombre"
        className="w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy text-sm focus:outline-none focus:border-navy"
        autoComplete="off"
      />
    </div>
  );
}

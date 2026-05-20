"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

type FilterDict = {
  searchLabel: string;
  searchClear: string;
  searchPlaceholder: string;
};

export function ProjectFilters({ dict }: { dict: FilterDict }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  // Sincronizar al cambiar la URL externamente (back/forward).
  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  // Búsqueda instantánea: empuja la URL ~250ms después de dejar de tipear.
  // `replace` (no `push`) para no inundar el historial con cada tecla.
  useEffect(() => {
    const current = params.get("q") ?? "";
    const next = query.trim();
    if (next === current) return;
    const t = setTimeout(() => {
      router.replace(
        next ? `/proyectos?q=${encodeURIComponent(next)}` : "/proyectos"
      );
    }, 250);
    return () => clearTimeout(t);
  }, [query, params, router]);

  const inputCls =
    "w-full border-hairline border-navy/40 bg-paper px-3 py-2 font-sans text-navy text-sm focus:outline-none focus:border-navy";

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="q" className="eyebrow">
          {dict.searchLabel}
        </label>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
          >
            {dict.searchClear}
          </button>
        )}
      </div>
      <input
        id="q"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={dict.searchPlaceholder}
        className={inputCls}
        autoComplete="off"
      />
    </div>
  );
}

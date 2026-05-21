"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { FloatingInput } from "@/components/ui/Floating";

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

  return (
    <div className="w-full">
      <FloatingInput
        id="q"
        label={dict.searchLabel}
        value={query}
        onChange={setQuery}
        autoComplete="off"
        inputMode="search"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="mt-2 eyebrow hover:!text-gold p-0 m-0 border-0 bg-transparent cursor-pointer"
        >
          {dict.searchClear}
        </button>
      )}
    </div>
  );
}

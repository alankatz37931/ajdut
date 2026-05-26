"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { FloatingInput } from "@/components/ui/Floating";

/**
 * Búsqueda instantánea por actor — mismo patrón que /proyectos:
 * debounce ~250ms + router.replace, sin botón.
 */
export function AuditSearch({
  label,
  clearLabel,
}: {
  label: string;
  clearLabel: string;
}) {
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
      <FloatingInput
        id="actor"
        label={label}
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
          {clearLabel}
        </button>
      )}
    </div>
  );
}

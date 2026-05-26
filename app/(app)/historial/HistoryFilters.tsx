"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FloatingSelect } from "@/components/ui/Floating";

type Cat = "all" | "dividendo" | "compra" | "venta";
type Periodo = "all" | "30" | "90" | "365";

type Option<T extends string> = { value: T; label: string };

type Props = {
  cat: Cat;
  periodo: Periodo;
  catOptions: Option<Cat>[];
  periodOptions: Option<Periodo>[];
  catLabel: string;
  periodLabel: string;
};

/**
 * Filtros de /historial — dos FloatingSelects side-by-side, mismo lenguaje
 * visual que /admin/avisos (Role + Project). Mantiene el patrón URL-driven
 * del original: cambia el valor → router.replace con los query params nuevos,
 * el server re-renderea con los movimientos filtrados.
 */
export function HistoryFilters({
  cat,
  periodo,
  catOptions,
  periodOptions,
  catLabel,
  periodLabel,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(nextCat: Cat, nextPeriodo: Periodo) {
    const params = new URLSearchParams();
    if (nextCat !== "all") params.set("cat", nextCat);
    if (nextPeriodo !== "all") params.set("periodo", nextPeriodo);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/historial?${qs}` : "/historial");
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
      <FloatingSelect
        id="historyCat"
        label={catLabel}
        value={cat}
        onChange={(v) => navigate(v as Cat, periodo)}
        options={catOptions.map((o) => ({ value: o.value, label: o.label }))}
      />
      <FloatingSelect
        id="historyPeriod"
        label={periodLabel}
        value={periodo}
        onChange={(v) => navigate(cat, v as Periodo)}
        options={periodOptions.map((o) => ({ value: o.value, label: o.label }))}
      />
    </div>
  );
}

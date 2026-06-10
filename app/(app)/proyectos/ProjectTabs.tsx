import Link from "next/link";
import type { Route } from "next";

export type ProjectTab = "buscando" | "armados" | "reventas";

type TabDict = {
  tabBuscando: string;
  tabArmados: string;
  tabReventas: string;
};

const TABS: ProjectTab[] = ["buscando", "armados", "reventas"];

/**
 * Tabs de categoría arriba del discovery de /proyectos. URL-driven (?tab=):
 * el tab activo vive en la query para que sea linkeable y sobreviva refresh.
 * Mismo lenguaje visual que la nav de filtros de /admin/reventas (eyebrow +
 * active !text-navy + gold underline). Al cambiar de tab descartamos `q` y
 * `page` — empezar limpio en la categoría nueva es lo esperable.
 *
 * Tap target ≥ 44px. En mobile los tabs hacen scroll horizontal (overflow-x)
 * en una sola fila; en sm+ quedan en línea con el hairline inferior.
 */
export function ProjectTabs({
  active,
  dict,
}: {
  active: ProjectTab;
  dict: TabDict;
}) {
  const labels: Record<ProjectTab, string> = {
    buscando: dict.tabBuscando,
    armados: dict.tabArmados,
    reventas: dict.tabReventas,
  };

  function hrefFor(tab: ProjectTab): string {
    const next = new URLSearchParams();
    // El default (buscando) no necesita el param en la URL.
    if (tab !== "buscando") next.set("tab", tab);
    const qs = next.toString();
    return qs ? `/proyectos?${qs}` : "/proyectos";
  }

  return (
    <nav
      className="-mx-1 flex items-stretch gap-x-1 overflow-x-auto hairline-b [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Categorías de proyectos"
    >
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={hrefFor(tab) as Route}
            aria-current={isActive ? "page" : undefined}
            className={`eyebrow whitespace-nowrap inline-flex items-center min-h-[44px] px-3 -mb-px border-b-2 transition-colors ${
              isActive
                ? "!text-navy border-gold"
                : "!text-navy/40 border-transparent hover:!text-navy"
            }`}
          >
            {labels[tab]}
          </Link>
        );
      })}
    </nav>
  );
}

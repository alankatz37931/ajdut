import { SkeletonLine } from "@/components/ui/Skeleton";

/**
 * Lista de proyectos del founder. Grid de tarjetas en columnas, con header
 * con un CTA "+ Nuevo proyecto" del lado derecho.
 */
export default function FounderRootLoading() {
  return (
    <div>
      <header
        aria-hidden
        className="pb-8 sm:pb-10 hairline-b flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex-1 space-y-4">
          <SkeletonLine width="w-24" height="h-3" />
          <SkeletonLine width="w-2/3" height="h-10" />
          <SkeletonLine width="w-1/2" height="h-3" />
        </div>
        <SkeletonLine width="w-44" height="h-11" className="shrink-0" />
      </header>

      <ul
        aria-hidden
        className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-px bg-line"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="bg-paper p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <SkeletonLine width="w-32" height="h-3" />
              <SkeletonLine width="w-16" height="h-5" />
            </div>
            <SkeletonLine width="w-2/3" height="h-7" />
            <SkeletonLine width="w-full" height="h-3" />
            <SkeletonLine width="w-3/5" height="h-3" />
            <SkeletonLine width="w-24" height="h-3" />
          </li>
        ))}
      </ul>
    </div>
  );
}

import { SkeletonLine } from "@/components/ui/Skeleton";

/**
 * El discovery real es una lista hairline-separada con filas de 12 cols
 * (sector · proyecto + métricas mono). Replicamos esa estructura para
 * que el skeleton no haga reflow cuando llegan los datos.
 */
export default function ProjectsDiscoveryLoading() {
  return (
    <div>
      <header aria-hidden className="pt-5 pb-5 sm:pt-7 sm:pb-7 space-y-4">
        <SkeletonLine width="w-24" height="h-3" />
        <SkeletonLine width="w-1/2" height="h-10" />
        <SkeletonLine width="w-2/3" height="h-3" />
      </header>

      {/* Buscador (FloatingInput) */}
      <div aria-hidden className="mt-2">
        <SkeletonLine width="w-full" height="h-10" />
      </div>

      <ul aria-hidden className="mt-6 hairline-t">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="hairline-b grid grid-cols-12 gap-x-4 gap-y-2 px-2 py-4">
            <div className="col-span-12 sm:col-span-5 space-y-2">
              <SkeletonLine width="w-24" height="h-3" />
              <SkeletonLine width="w-3/4" height="h-6" />
              <SkeletonLine width="w-full" height="h-3" />
            </div>
            <div className="col-span-4 sm:col-span-2 space-y-2">
              <SkeletonLine width="w-16" height="h-3" />
              <SkeletonLine width="w-20" height="h-4" />
            </div>
            <div className="col-span-4 sm:col-span-2 space-y-2">
              <SkeletonLine width="w-16" height="h-3" />
              <SkeletonLine width="w-20" height="h-4" />
            </div>
            <div className="col-span-4 sm:col-span-2 space-y-2">
              <SkeletonLine width="w-16" height="h-3" />
              <SkeletonLine width="w-20" height="h-4" />
            </div>
            <div className="hidden sm:flex sm:col-span-1 justify-end">
              <SkeletonLine width="w-4" height="h-3" />
            </div>
            {/* Barra de fondeo */}
            <div className="col-span-12 mt-1">
              <SkeletonLine width="w-full" height="h-1" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

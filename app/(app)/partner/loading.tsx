import { SkeletonLine } from "@/components/ui/Skeleton";

/**
 * Header con CTA "Explorar" a la derecha + 4 KpiCards en grilla + lista
 * de participaciones. Reproducimos la estructura para evitar reflow.
 */
export default function PartnerLoading() {
  return (
    <div>
      <div
        aria-hidden
        className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex-1 space-y-4">
          <SkeletonLine width="w-24" height="h-3" />
          <SkeletonLine width="w-2/3" height="h-10" />
          <SkeletonLine width="w-1/2" height="h-3" />
        </div>
        <SkeletonLine width="w-32" height="h-11" className="shrink-0" />
      </div>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-paper p-6 space-y-3">
            <SkeletonLine width="w-28" height="h-3" />
            <SkeletonLine width="w-40" height="h-8" />
            <SkeletonLine width="w-20" height="h-3" />
          </div>
        ))}
      </div>

      <div className="mt-12">
        <SkeletonLine width="w-40" height="h-3" className="mb-6" />
        <ul className="hairline-t">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="hairline-b py-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <SkeletonLine width="w-1/2" height="h-5" />
                <SkeletonLine width="w-20" height="h-3" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="space-y-2">
                    <SkeletonLine width="w-16" height="h-3" />
                    <SkeletonLine width="w-20" height="h-4" />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

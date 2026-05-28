import { SkeletonLine, SkeletonBlock } from "@/components/ui/Skeleton";

/**
 * Skeleton del detalle de proyecto. Replica el hero (eyebrow + h1 grande
 * + one-liner + founder/web + CTAs) y la grilla main + sidebar sticky
 * de cap table / fondeo. Sin esto el contenido pega un salto vertical
 * cuando llega el real.
 */
export default function ProjectDetailLoading() {
  return (
    <div>
      <div aria-hidden className="mt-4 hairline-b pt-2 pb-8 sm:pb-10 px-1 sm:px-2 space-y-5">
        <SkeletonLine width="w-24" height="h-3" />
        <SkeletonLine width="w-2/3" height="h-3" />
        <SkeletonLine width="w-3/4" height="h-12" />
        <SkeletonLine width="w-1/2" height="h-5" />
        <SkeletonLine width="w-2/3" height="h-5" />
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <SkeletonLine width="w-9" height="h-9" />
          <div className="space-y-1.5">
            <SkeletonLine width="w-32" height="h-3" />
            <SkeletonLine width="w-20" height="h-3" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <SkeletonLine width="w-40" height="h-11" />
          <SkeletonLine width="w-32" height="h-11" />
        </div>
      </div>

      <div aria-hidden className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-x-10 xl:gap-x-14 gap-y-8">
        <div className="space-y-8 min-w-0">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-4 pt-7 sm:pt-8">
              <div className="flex items-baseline gap-3">
                <SkeletonLine width="w-8" height="h-3" />
                <SkeletonLine width="w-40" height="h-5" />
              </div>
              <SkeletonBlock lines={4} />
            </div>
          ))}
        </div>

        {/* Sidebar: fondeo + cap table */}
        <aside className="space-y-5">
          <div className="hairline bg-paper p-5 space-y-4">
            <SkeletonLine width="w-20" height="h-3" />
            <SkeletonLine width="w-32" height="h-3" />
            <SkeletonLine width="w-40" height="h-7" />
            <SkeletonLine width="w-full" height="h-2.5" />
            <div className="space-y-2 pt-2">
              <SkeletonLine width="w-full" height="h-3" />
              <SkeletonLine width="w-full" height="h-3" />
              <SkeletonLine width="w-full" height="h-3" />
            </div>
          </div>
          <div className="hairline bg-paper p-5 space-y-3">
            <SkeletonLine width="w-24" height="h-3" />
            <SkeletonBlock lines={4} />
          </div>
        </aside>
      </div>
    </div>
  );
}

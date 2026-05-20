import { SkeletonHeader, SkeletonLine } from "@/components/ui/Skeleton";

export default function FounderProjectLoading() {
  return (
    <div>
      <SkeletonHeader />

      <div className="mt-8 flex flex-wrap gap-3">
        <SkeletonLine width="w-44" height="h-10" />
        <SkeletonLine width="w-40" height="h-10" />
      </div>

      {/* Banda KPIs */}
      <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-px bg-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-paper p-6 space-y-3">
            <SkeletonLine width="w-24" height="h-3" />
            <SkeletonLine width="w-20" height="h-8" />
            <SkeletonLine width="w-32" height="h-3" />
          </div>
        ))}
      </div>

      {/* Grilla de módulos */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="hairline bg-paper p-6 space-y-4">
            <SkeletonLine width="w-32" height="h-3" />
            <SkeletonLine width="w-16" height="h-8" />
            <SkeletonLine width="w-full" height="h-3" />
            <SkeletonLine width="w-20" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

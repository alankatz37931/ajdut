import { SkeletonHeader, SkeletonLine } from "@/components/ui/Skeleton";

export default function FounderProjectLoading() {
  return (
    <div>
      <SkeletonHeader />
      <div className="mt-8 flex flex-wrap gap-3">
        <SkeletonLine width="w-40" height="h-10" />
        <SkeletonLine width="w-36" height="h-10" />
        <SkeletonLine width="w-32" height="h-10" />
      </div>
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-paper p-6 space-y-3">
            <SkeletonLine width="w-24" height="h-3" />
            <SkeletonLine width="w-32" height="h-8" />
            <SkeletonLine width="w-16" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

import {
  SkeletonHeader,
  SkeletonLine,
  SkeletonBlock,
} from "@/components/ui/Skeleton";

export default function ProjectDetailLoading() {
  return (
    <div>
      <SkeletonLine width="w-24" height="h-3" className="mb-6" />
      <SkeletonHeader />

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-paper p-6 space-y-3">
            <SkeletonLine width="w-24" height="h-3" />
            <SkeletonLine width="w-32" height="h-8" />
            <SkeletonLine width="w-16" height="h-3" />
          </div>
        ))}
      </div>

      <div className="mt-12 space-y-4">
        <SkeletonLine width="w-32" height="h-3" />
        <SkeletonBlock lines={4} />
      </div>
    </div>
  );
}

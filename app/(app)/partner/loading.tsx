import {
  SkeletonHeader,
  SkeletonLine,
  SkeletonListRow,
} from "@/components/ui/Skeleton";

export default function PartnerLoading() {
  return (
    <div>
      <SkeletonHeader />

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-paper p-6 space-y-3">
            <SkeletonLine width="w-32" height="h-3" />
            <SkeletonLine width="w-40" height="h-8" />
            <SkeletonLine width="w-20" height="h-3" />
          </div>
        ))}
      </div>

      <div className="mt-12">
        <SkeletonLine width="w-40" height="h-3" className="mb-6" />
        <ul className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
        </ul>
      </div>
    </div>
  );
}

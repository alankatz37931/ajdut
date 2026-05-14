import {
  SkeletonHeader,
  SkeletonLine,
  SkeletonListRow,
} from "@/components/ui/Skeleton";

export default function ApplicationsLoading() {
  return (
    <div>
      <SkeletonHeader />

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLine key={i} width="w-20" height="h-3" />
        ))}
      </div>

      <ul className="mt-10 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </ul>
    </div>
  );
}

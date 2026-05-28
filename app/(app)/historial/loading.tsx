import { SkeletonLine, SkeletonListRow } from "@/components/ui/Skeleton";

export default function HistorialLoading() {
  return (
    <div>
      <header aria-hidden className="pt-5 pb-5 sm:pt-7 sm:pb-7 space-y-4">
        <SkeletonLine width="w-24" height="h-3" />
        <SkeletonLine width="w-1/2" height="h-10" />
        <SkeletonLine width="w-2/3" height="h-3" />
      </header>

      {/* Filtros: dos FloatingSelects side-by-side (cat + período). */}
      <div
        aria-hidden
        className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6"
      >
        <SkeletonLine width="w-full" height="h-10" />
        <SkeletonLine width="w-full" height="h-10" />
      </div>

      <ul aria-hidden className="mt-8 hairline-t">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </ul>
    </div>
  );
}

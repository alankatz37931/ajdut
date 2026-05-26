import { SkeletonLine, SkeletonListRow } from "@/components/ui/Skeleton";

export default function HistorialLoading() {
  return (
    <div>
      <header aria-hidden className="pt-5 pb-5 sm:pt-7 sm:pb-7 space-y-4">
        <SkeletonLine width="w-24" height="h-3" />
        <SkeletonLine width="w-1/2" height="h-10" />
        <SkeletonLine width="w-2/3" height="h-3" />
      </header>

      {/* Filtros: categoría + período */}
      <div
        aria-hidden
        className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3"
      >
        <SkeletonLine width="w-20" height="h-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLine key={`c-${i}`} width="w-16" height="h-3" />
        ))}
        <SkeletonLine width="w-20" height="h-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLine key={`p-${i}`} width="w-12" height="h-3" />
        ))}
      </div>

      <ul aria-hidden className="mt-8 hairline-t">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </ul>
    </div>
  );
}

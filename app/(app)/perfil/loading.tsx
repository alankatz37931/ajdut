import { SkeletonBlock, SkeletonLine } from "@/components/ui/Skeleton";

export default function PerfilLoading() {
  return (
    <div>
      {/* Header con avatar circular + título */}
      <header
        aria-hidden
        className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex items-center gap-5 sm:gap-6"
      >
        <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-line/80 animate-pulse hairline" />
        <div className="flex-1 space-y-3">
          <SkeletonLine width="w-20" height="h-3" />
          <SkeletonLine width="w-1/2" height="h-9" />
          <SkeletonLine width="w-2/3" height="h-3" />
        </div>
      </header>

      {/* Superficie con campos del perfil apilados */}
      <div className="mt-8 hairline-t">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            className="hairline-b py-5 sm:py-6 flex items-start justify-between gap-4"
          >
            <div className="flex-1 space-y-2">
              <SkeletonLine width="w-24" height="h-3" />
              <SkeletonLine width="w-2/3" height="h-5" />
            </div>
            <SkeletonLine width="w-5" height="h-5" />
          </div>
        ))}
      </div>

      <div className="mt-10">
        <SkeletonBlock lines={2} />
      </div>
    </div>
  );
}

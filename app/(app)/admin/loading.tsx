import { SkeletonHeader, SkeletonBlock } from "@/components/ui/Skeleton";

/**
 * `/admin` hoy hace redirect a `/proyectos`. El skeleton es solo el header
 * para evitar layout shift durante el round-trip del redirect.
 */
export default function AdminLoading() {
  return (
    <div>
      <SkeletonHeader />
      <div className="mt-8">
        <SkeletonBlock lines={2} />
      </div>
    </div>
  );
}

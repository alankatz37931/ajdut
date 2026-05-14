import {
  SkeletonHeader,
  SkeletonProjectCard,
} from "@/components/ui/Skeleton";

export default function ProjectsDiscoveryLoading() {
  return (
    <div>
      <SkeletonHeader />
      <ul className="mt-12 grid grid-cols-1 gap-px bg-line md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonProjectCard key={i} />
        ))}
      </ul>
    </div>
  );
}

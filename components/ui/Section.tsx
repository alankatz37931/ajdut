import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils/cn";

type SectionHeadingProps = {
  n?: string;
  title: string;
  actionHref?: Route;
  actionLabel?: string;
  className?: string;
};

export function SectionHeading({ n, title, actionHref, actionLabel, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-end justify-between hairline-b pb-3", className)}>
      <div className="flex items-baseline gap-3">
        {n && <span className="eyebrow">{n}</span>}
        <h2 className="eyebrow !text-navy">{title}</h2>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="eyebrow !text-navy hover:!text-gold transition-colors">
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}

type SectionProps = SectionHeadingProps & {
  children: React.ReactNode;
};

export function Section({ n, title, actionHref, actionLabel, className, children }: SectionProps) {
  return (
    <section className={cn("py-12 sm:py-section", className)}>
      <SectionHeading n={n} title={title} actionHref={actionHref} actionLabel={actionLabel} />
      <div className="mt-6">{children}</div>
    </section>
  );
}

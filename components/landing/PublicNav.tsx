import { BrandMark } from "./BrandMark";

export function PublicNav() {
  return (
    <nav className="hairline-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <BrandMark />
        <span className="eyebrow">ESP</span>
      </div>
    </nav>
  );
}

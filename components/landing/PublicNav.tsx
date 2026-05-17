import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function PublicNav() {
  return (
    <nav className="hairline-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <BrandMark />
        <div className="flex items-center gap-6">
          <Link
            href="/nosotros"
            className="eyebrow hover:!text-gold transition-colors"
          >
            Sobre nosotros
          </Link>
          <Link
            href="/acceder"
            className="eyebrow hover:!text-gold transition-colors"
          >
            Acceder
          </Link>
        </div>
      </div>
    </nav>
  );
}

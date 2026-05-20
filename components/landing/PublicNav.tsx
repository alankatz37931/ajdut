import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { getDict } from "@/lib/i18n";

export async function PublicNav() {
  const dict = await getDict();
  const t = dict.publicNav;
  return (
    <nav className="hairline-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8 sm:py-5">
        <BrandMark />
        <div className="flex items-center gap-6">
          {/* "Sobre nosotros" oculta en mobile para liberar espacio */}
          <Link
            href="/nosotros"
            className="hidden sm:inline-block eyebrow tracking-widest font-medium !text-navy/80 hover:!text-gold transition-colors"
          >
            {t.aboutUs}
          </Link>
          <Link
            href="/acceder"
            className="text-[0.7rem] sm:text-xs uppercase tracking-widest font-medium !text-navy/80 hover:!text-gold transition-colors"
          >
            {t.signIn}
          </Link>
        </div>
      </div>
    </nav>
  );
}

import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { getDict } from "@/lib/i18n";

export async function PublicNav() {
  const dict = await getDict();
  const t = dict.publicNav;
  return (
    <nav className="hairline-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <BrandMark />
        <div className="flex items-center gap-6">
          <Link
            href="/nosotros"
            className="eyebrow tracking-widest hover:!text-gold transition-colors"
          >
            {t.aboutUs}
          </Link>
          <Link
            href="/acceder"
            className="eyebrow tracking-widest hover:!text-gold transition-colors"
          >
            {t.signIn}
          </Link>
        </div>
      </div>
    </nav>
  );
}

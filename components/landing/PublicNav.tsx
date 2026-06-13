import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { getDict } from "@/lib/i18n";

export async function PublicNav() {
  const dict = await getDict();
  const t = dict.publicNav;
  return (
    <nav className="hairline-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 md:px-8 sm:py-5">
        <BrandMark tagline={dict.brand.tagline} ariaLabel={dict.brand.ariaLabel} />
        <div className="flex items-center gap-3 sm:gap-6">
          {/* En mobile ambos links entran con tipografía y tracking más
              chicos — en sm+ recuperan la métrica original */}
          <Link
            href="/nosotros"
            className="eyebrow text-[0.65rem] sm:text-xs tracking-wider sm:tracking-widest font-medium !text-navy/80 hover:!text-gold transition-colors whitespace-nowrap"
          >
            {t.aboutUs}
          </Link>
          <Link
            href="/acceder"
            className="text-[0.65rem] sm:text-xs uppercase tracking-wider sm:tracking-widest font-medium !text-navy/80 hover:!text-gold transition-colors whitespace-nowrap"
          >
            {t.signIn}
          </Link>
        </div>
      </div>
    </nav>
  );
}

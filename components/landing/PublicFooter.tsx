import Link from "next/link";
import { getDict } from "@/lib/i18n";

export async function PublicFooter() {
  const dict = await getDict();
  const t = dict.publicFooter;
  return (
    <footer className="hairline-t">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-8 sm:py-3 text-xs tracking-wider text-navy/30">
        <span>{t.copy}</span>
        <Link href="/legal" className="hover:!text-gold transition-colors">
          {t.legal}
        </Link>
      </div>
    </footer>
  );
}

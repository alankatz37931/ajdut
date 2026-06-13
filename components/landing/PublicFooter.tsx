import Link from "next/link";
import { getDict, getLanguage } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";

export async function PublicFooter() {
  const dict = await getDict();
  const lang = await getLanguage();
  const t = dict.publicFooter;
  return (
    <footer className="hairline-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 md:px-8 text-xs tracking-wider text-navy/55">
        <span>{t.copy.replace("{year}", String(new Date().getFullYear()))}</span>
        <span className="inline-flex items-center gap-3">
          <Link href="/legal" className="hover:!text-gold transition-colors">
            {t.legal}
          </Link>
          <span aria-hidden className="!text-navy/55">·</span>
          <LanguageToggle current={lang} />
        </span>
      </div>
    </footer>
  );
}

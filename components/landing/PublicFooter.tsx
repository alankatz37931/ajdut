import Link from "next/link";
import { getDict } from "@/lib/i18n";

export async function PublicFooter() {
  const dict = await getDict();
  const t = dict.publicFooter;
  return (
    <footer className="hairline-t">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <span className="eyebrow">{t.copy}</span>
        <Link href="/legal" className="eyebrow hover:!text-gold transition-colors">
          {t.legal}
        </Link>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { ApplicationForm } from "./ApplicationForm";
import { getDict, getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Aplicar · AJDUT",
};

export default async function AplicarPage() {
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.apply;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
      <div className="flex items-center gap-3 -ml-2">
        <Link
          href="/"
          aria-label={t.backToHome}
          className="inline-flex h-8 w-8 items-center justify-center text-navy hover:text-gold transition-colors text-lg"
        >
          ←
        </Link>
        <p className="eyebrow">{t.eyebrow}</p>
      </div>

      <h1 className="font-sans mt-4 text-h1 text-navy">{t.title}</h1>
      <p className="mt-3 max-w-xl text-sm text-navy/75 leading-relaxed">
        {t.intro}
      </p>

      <div className="mt-6 hairline p-5 bg-paper-light">
        <ApplicationForm dict={t} locale={locale} />
      </div>
    </div>
  );
}

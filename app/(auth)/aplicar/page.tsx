import { ApplicationForm } from "./ApplicationForm";
import { BackLink } from "@/components/app/BackLink";
import { getDict, getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Aplicar · AJDUT",
};

export default async function AplicarPage() {
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.apply;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <BackLink fallback="/">{t.eyebrow}</BackLink>

      <h1 className="font-sans mt-4 text-h1 text-navy">{t.title}</h1>
      <p className="mt-3 text-base text-navy/75 leading-relaxed">
        {t.intro}
      </p>

      <div className="mt-8">
        <ApplicationForm dict={t} locale={locale} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { ApplicationForm } from "./ApplicationForm";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.apply.metaTitle };
}

export default async function AplicarPage() {
  const dict = await getDict();
  const t = dict.apply;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <BackLink fallback="/">{t.eyebrow}</BackLink>

      <h1 className="font-sans mt-4 text-h1 text-navy">{t.title}</h1>
      <p className="mt-3 text-base text-navy/75 leading-relaxed">
        {t.intro}
      </p>

      <div className="mt-8">
        <ApplicationForm dict={t} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { BackLink } from "@/components/app/BackLink";
import { requireRole } from "@/lib/auth/session";
import { getDict, getLocale } from "@/lib/i18n";
import { NewProjectForm } from "./NewProjectForm";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderNuevoProyecto };
}

export default async function NewProjectPage() {
  await requireRole(["PROJECT_OWNER", "ADMIN"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderNuevoProyecto;

  return (
    <div className="max-w-4xl">
      <header className="pt-5 sm:pt-7 pb-8 sm:pb-10 hairline-b">
        <BackLink fallback="/founder">{t.back}</BackLink>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-3xl">{t.intro}</p>
      </header>

      <NewProjectForm dict={t} locale={locale} />
    </div>
  );
}

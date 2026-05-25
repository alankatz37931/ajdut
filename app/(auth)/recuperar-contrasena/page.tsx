import type { Metadata } from "next";
import { RecoveryForm } from "./RecoveryForm";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.recoveryPassword.metaTitle };
}

export default async function RecoveryPage() {
  const dict = await getDict();
  const t = dict.recoveryPassword;
  return (
    <div className="mx-auto w-full max-w-lg px-4 sm:px-6 pb-section">
      <BackLink fallback="/acceder">{t.back}</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">{t.title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{t.intro}</p>

      <div className="mt-10 hairline p-6 bg-paper-light">
        <RecoveryForm dict={t} />
      </div>
    </div>
  );
}

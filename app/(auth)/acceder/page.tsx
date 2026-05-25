import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.login.metaTitle };
}

export default async function AccederPage() {
  const dict = await getDict();
  const t = dict.login;
  return (
    <div className="mx-auto w-full max-w-lg px-4 sm:px-6">
      <BackLink fallback="/">{t.eyebrow}</BackLink>

      <h1 className="font-sans mt-4 text-h1 text-navy">{t.title}</h1>
      <p className="mt-3 text-navy/75 leading-relaxed">
        {t.intro}{" "}
        <Link href="/aplicar" className="text-navy underline decoration-gold underline-offset-4">
          {t.applyLink}
        </Link>
        .
      </p>

      <div className="mt-6 hairline p-6 bg-paper-light">
        <LoginForm dict={t} />
      </div>

      <p className="mt-4 eyebrow">
        <Link
          href="/recuperar-contrasena"
          className="hover:!text-gold transition-colors"
        >
          {t.forgotPassword}
        </Link>
      </p>
    </div>
  );
}

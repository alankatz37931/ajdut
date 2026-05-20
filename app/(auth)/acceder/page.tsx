import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { getDict } from "@/lib/i18n";

// Metadata estática: se compone en build / en español por defecto. El
// metaTitle traducible vive en el dict para el JSX visible.
export const metadata = {
  title: "Acceder · AJDUT",
};

export default async function AccederPage() {
  const dict = await getDict();
  const t = dict.login;
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6">
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

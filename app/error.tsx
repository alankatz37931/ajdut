"use client";

import { useEffect } from "react";
import Link from "next/link";
import { getErrorBoundaryDict } from "@/lib/i18n/clientLang";

/**
 * Boundary para rutas públicas / marketing (todo lo que NO está bajo
 * el grupo `(app)`). Tiene acceso al layout — solo aísla el contenido
 * de la página. Para crashes del root layout ver `app/global-error.tsx`.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing-error]", error);
  }, [error]);

  const dict = getErrorBoundaryDict();

  return (
    <div className="min-h-[60vh] flex items-center px-6 sm:px-10 py-16">
      <div className="mx-auto max-w-2xl w-full">
        <p className="eyebrow">— AJDUT</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          {dict.title}
        </h1>
        <p className="mt-3 text-navy/75 leading-relaxed">{dict.description}</p>

        {error.digest && (
          <p className="eyebrow !text-navy/40 mt-6 font-mono normal-case tracking-wider">
            {dict.digestLabel}: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            {dict.tryAgainBtn}
          </button>
          <Link href="/" className="btn-outline">
            {dict.goHomeBtn}
          </Link>
        </div>
      </div>
    </div>
  );
}

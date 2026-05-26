"use client";

import { useEffect } from "react";
import Link from "next/link";
import { getErrorBoundaryDict } from "@/lib/i18n/clientLang";

/**
 * Boundary para el segmento autenticado `(app)`. El AppShell (sidebar +
 * header) sigue montado — solo aísla el contenido de la página/sub-ruta.
 * Para crashes del root layout ver `app/global-error.tsx`.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry defensivo: si la próxima ola de observability inyectó el SDK,
    // reportamos el crash; si no, fallback a console.error. Permite enchufar
    // Sentry sin tocar este boundary.
    const sentry = (globalThis as { Sentry?: { captureException?: (err: unknown) => void } })
      .Sentry;
    if (sentry?.captureException) {
      sentry.captureException(error);
    } else {
      console.error("[app-error]", error);
    }
  }, [error]);

  const dict = getErrorBoundaryDict();

  return (
    <div className="py-12 sm:py-16">
      <div className="max-w-2xl">
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
          <Link href="/proyectos" className="btn-outline">
            {dict.goHomeBtn}
          </Link>
        </div>
      </div>
    </div>
  );
}

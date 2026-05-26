"use client";

import { useEffect } from "react";
import { getErrorBoundaryDict } from "@/lib/i18n/clientLang";

/**
 * Last-resort error boundary: se monta SOLO cuando el root layout crashea.
 * Por eso debe incluir `<html>` + `<body>` manualmente y NO puede confiar en
 * Tailwind (la cadena de CSS también pudo no cargar). Usamos estilos inline
 * para garantizar legibilidad mínima incluso en el peor escenario.
 *
 * Para errores en rutas individuales se usa `app/error.tsx` y
 * `app/(app)/error.tsx`, que sí tienen acceso al CSS del proyecto.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook para reporting futuro (Sentry, etc.). Por ahora solo console.
    console.error("[global-error]", error);
  }, [error]);

  const dict = getErrorBoundaryDict();

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f5f3ee",
          color: "#0e1a2b",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
        }}
      >
        <main
          style={{
            maxWidth: 560,
            width: "100%",
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#0e1a2b",
              opacity: 0.6,
              margin: 0,
            }}
          >
            — AJDUT
          </p>
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.15,
              marginTop: 16,
              marginBottom: 16,
              fontWeight: 500,
              color: "#0e1a2b",
            }}
          >
            {dict.title}
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              margin: 0,
              color: "#0e1a2b",
              opacity: 0.75,
            }}
          >
            {dict.description}
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: 24,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#0e1a2b",
                opacity: 0.4,
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              }}
            >
              {dict.digestLabel}: {error.digest}
            </p>
          )}

          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                appearance: "none",
                border: 0,
                padding: "12px 24px",
                background: "#0e1a2b",
                color: "#f5f3ee",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              {dict.tryAgainBtn}
            </button>
            <a
              href="/"
              style={{
                appearance: "none",
                border: "1px solid rgba(14, 26, 43, 0.25)",
                padding: "11px 24px",
                background: "transparent",
                color: "#0e1a2b",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.04em",
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {dict.goHomeBtn}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

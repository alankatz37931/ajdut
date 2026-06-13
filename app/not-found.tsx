import Link from "next/link";
import { getDict } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";
import { BrandMark } from "@/components/landing/BrandMark";

/**
 * 404 global con marca — server component en la raíz de `app/`, así cubre
 * cualquier `notFound()` del árbol (públicas, app y founder) y las URLs que
 * no matchean ninguna ruta.
 *
 * Fallback en español: `getDict()` lee cookies del request y en contextos
 * degradados (404 servido sin request scope completo) puede tirar — en ese
 * caso caemos a la copy en español en vez de romper la página de error.
 */
const FALLBACK_BRAND = {
  tagline: "Comunidades de negocio",
  ariaLabel: "AJDUT — Comunidades de negocio — inicio",
};

const FALLBACK_NOT_FOUND = {
  title: "Página no encontrada",
  body: "La página que buscás no existe o ya no está disponible. Puede que el link esté vencido o que el contenido se haya movido.",
  backHome: "Volver al inicio →",
};

export default async function NotFound() {
  let t = FALLBACK_NOT_FOUND;
  let brand = FALLBACK_BRAND;
  try {
    const dict: Dict = await getDict();
    t = dict.notFound;
    brand = dict.brand;
  } catch {
    // Sin dict (request degradado) → copy en español.
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Nav mínima con el wordmark — mismo lenguaje que PublicNav. */}
      <nav className="hairline-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 md:px-8 sm:py-5">
          <BrandMark tagline={brand.tagline} ariaLabel={brand.ariaLabel} />
        </div>
      </nav>

      <main className="flex-1 flex flex-col justify-center">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 md:px-8 py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="eyebrow">— 404</p>
            <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
              {t.title}
            </h1>
            {/* Hairline corta en gold — acento de marca, como los bullets
                dorados de la home pública. */}
            <div aria-hidden className="mt-5 h-px w-16 bg-gold" />
            <p className="mt-5 text-base sm:text-lg text-navy/75 leading-relaxed">
              {t.body}
            </p>
            <div className="mt-8">
              <Link href="/" className="btn-primary inline-flex">
                {t.backHome}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

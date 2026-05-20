import Link from "next/link";
import { getDict } from "@/lib/i18n";

export default async function HomePage() {
  const dict = await getDict();
  const t = dict.home;
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-8 py-5 sm:py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-[72px] lg:items-start">
        {/* Hero (col izquierda en desktop) — usa todo el ancho de su col */}
        <section>
          <p className="eyebrow leading-tight">{t.eyebrow}</p>

          <h1 className="font-sans mt-3 sm:mt-4 text-[1.6rem] sm:text-[2.5rem] lg:text-[1.9rem] text-navy !leading-[1.1] font-bold">
            {t.titleLine1}
            {/* Break solo en desktop — en mobile/tablet el texto fluye natural */}
            <span className="hidden lg:inline">
              <br />
            </span>{" "}
            {t.titleLine2}
          </h1>

          {/* Valores fundacionales — ícono + label en eyebrow, separados por
              bullet gold. El icono va navy/40 para no competir con el label. */}
          <div className="mt-4 sm:mt-5 flex items-center flex-wrap gap-x-2 gap-y-1 eyebrow !text-navy/60">
            <span className="inline-flex items-center gap-1.5">
              <TransparencyIcon />
              Transparencia
            </span>
            <span className="text-gold">·</span>
            <span className="inline-flex items-center gap-1.5">
              <UnityIcon />
              Unidad
            </span>
            <span className="text-gold">·</span>
            <span className="inline-flex items-center gap-1.5">
              <ValueIcon />
              Valor
            </span>
          </div>

          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-navy/80 leading-relaxed">
            {t.description}
          </p>

          {/* CTA único: 'Aplica para ser parte' — botón con presencia, hover premium */}
          <div className="mt-5 sm:mt-6 max-w-md">
            <Link
              href="/aplicar"
              className="btn-primary w-full text-center transition-all duration-300 hover:shadow-lg hover:shadow-navy/15 hover:-translate-y-0.5"
            >
              <span>{t.ctaApply}</span>
              <span aria-hidden className="ml-1">→</span>
            </Link>
          </div>
        </section>

        {/* Pilares (col derecha en desktop, debajo en mobile) */}
        <aside className="flex flex-col gap-3 sm:gap-4">
          <p className="eyebrow !text-navy/60 font-medium lg:text-left mb-1 sm:mb-2">
            {t.pillarsHeading}
          </p>
          <Pillar
            icon={<ShieldIcon />}
            title={t.pillarLegacyTitle}
            body={t.pillarLegacyBody}
          />
          <Pillar
            icon={<EyeIcon />}
            title={t.pillarReportsTitle}
            body={t.pillarReportsBody}
          />
          <Pillar
            icon={<HandshakeIcon />}
            title={t.pillarResaleTitle}
            body={t.pillarResaleBody}
          />
        </aside>
      </div>
    </div>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="select-none cursor-default rounded-xl border border-line/80 bg-gradient-to-br from-paper-light to-paper-light/40 px-5 py-4 shadow-sm shadow-navy/5 transition-all duration-300 hover:border-gold/60 hover:shadow-md hover:shadow-navy/10 hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <div className="text-gold shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <p className="font-sans font-semibold text-navy text-[15px] sm:text-base">
            {title}
          </p>
          <p className="mt-1 text-navy/75 leading-[1.5] text-[13.5px] sm:text-sm">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Íconos sutiles (SVG inline, stroke oro) ── */

// Cucarda octagonal con check — "Propiedad Inmutable":
// la forma de sello sugiere "certificado", la marca interna confirma.
function ShieldIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// Documento con líneas — "Información Exclusiva":
// reporte / hoja, líneas internas sugieren contenido formal.
function EyeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

// Flechas bidireccionales — "Liquidez y Traspaso":
// traspaso de propiedad de una mano a otra.
function HandshakeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

/* ── Íconos compactos para los valores fundacionales (14px, navy/40) ── */

function TransparencyIcon() {
  // Cadena / link — vínculos visibles, transparencia de conexiones.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-navy/40 shrink-0"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function UnityIcon() {
  // Persona dentro de un círculo — unidad / comunidad.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-navy/40 shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.168 18.849A4 4 0 0 1 10 16h4a4 4 0 0 1 3.834 2.855" />
    </svg>
  );
}

function ValueIcon() {
  // Gema facetada — activo durable, valor de cara.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-navy/40 shrink-0"
      aria-hidden
    >
      <path d="M6 3h12l4 6-10 13L2 9z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}

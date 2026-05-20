import type { Metadata } from "next";
import { getDict, getLanguage } from "@/lib/i18n";
import { BackLink } from "@/components/app/BackLink";
import { getOptionalSession } from "@/lib/auth/session";

// Metadata estática: el dict no llega acá. El metaTitle/metaDescription
// traducibles vienen del dict y se aplican en el JSX para SEO de la página.
// TODO i18n: promover a generateMetadata cuando se ajuste la prerender policy.
export const metadata: Metadata = {
  title: "Sobre nosotros · AJDUT",
  description:
    "Ajdut coordina comunidades de negocio donde personas reales construyen valor real, juntos. Transparencia, unidad, valor y legado.",
};

export default async function NosotrosPage() {
  const dict = await getDict();
  const language = await getLanguage();
  const user = await getOptionalSession();
  const t = dict.nosotros;
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-8 pb-4 sm:pb-6">
      {/* Hero — sin sesión, el eyebrow es el back-link; con sesión, el viewer
          ya tiene el sidebar como nav, así que un "volver" no aporta. */}
      <section className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        {user ? (
          <p className="eyebrow !text-navy/40">{t.eyebrow.replace(/^—\s*/, "")}</p>
        ) : (
          <BackLink fallback="/">{t.eyebrow.replace(/^—\s*/, "")}</BackLink>
        )}

        <h1 className="font-sans mt-2 sm:mt-3 text-[1.6rem] sm:text-[2.5rem] lg:text-[1.9rem] text-navy !leading-[1.1] font-bold">
          {t.title}
        </h1>

        <p className="mt-3 sm:mt-4 text-lg sm:text-xl text-navy/80 leading-relaxed">
          {t.intro}
        </p>

        <p className="mt-3 sm:mt-4 eyebrow !text-navy/50">{t.values}</p>
      </section>

      {/* Aviso EN sobre el contenido aún no traducido del manual */}
      {language === "en" && (
        <p className="border-t border-navy/10 py-6 mt-6 sm:py-4 text-sm text-navy/60 italic">
          The sections below are presented in the original Spanish from our brand manual.
        </p>
      )}

      {/* 01 Origen · 02 Propósito — dos columnas en desktop */}
      <section className="border-t border-navy/10 py-3 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 md:gap-x-12 lg:gap-x-16">
          {/* 01 · Origen — separa la columna del divisor superior */}
          <div className="pt-4">
            <p className="font-mono text-sm tracking-wider text-navy mb-3">
              <span className="text-gold">01</span> · {t.origin.title}
            </p>
            <p className="text-navy/85 leading-relaxed">{t.origin.body1}</p>
            <p className="mt-3 text-navy/85 leading-relaxed">{t.origin.body2}</p>
          </div>

          {/* 02 · Propósito — idem */}
          <div className="pt-4">
            <p className="font-mono text-sm tracking-wider text-navy mb-3">
              <span className="text-gold">02</span> · Propósito
            </p>
            <div className="space-y-4">
              <PurposeItem
                label="Misión"
                body="Coordinar comunidades de negocio donde la confianza, la comunicación y el valor compartido son la base de cada participación."
              />
              <PurposeItem
                label="Visión"
                body="Ser la plataforma de referencia en Latinoamérica para comunidades de negocio donde el valor se construye colectivamente —y se hereda."
              />
              <PurposeItem
                label="Propuesta"
                body="Convertimos proyectos en comunidades. Cada participación es una membresía activa: acceso a información, reportes y comunicación directa con quienes operan el negocio."
              />
            </div>
          </div>
        </div>
      </section>

      {/* 03 · Lo que somos / lo que no somos */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3 sm:mb-4">
          <span className="text-gold">03</span> · Lo que somos
        </p>

        {/* Bloque binario: gap ajustado, ancho completo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <div>
            <p className="eyebrow !text-navy/50 mb-2">Lo que SÍ somos</p>
            <ul className="space-y-2">
              <YesItem>Una comunidad de negocios con acceso aprobado.</YesItem>
              <YesItem>Un espacio de comunicación e información.</YesItem>
              <YesItem>Un validador de participaciones accionarias.</YesItem>
              <YesItem>Un puente entre proyectos y comunidad.</YesItem>
            </ul>
          </div>
          <div>
            <p className="eyebrow !text-navy/50 mb-2">Lo que NO somos</p>
            <ul className="space-y-2">
              <NoItem>Un fondo de participación.</NoItem>
              <NoItem>Un procesador de pagos o custodia de dinero.</NoItem>
              <NoItem>Asesoría legal o financiera.</NoItem>
              <NoItem>Un exchange ni plataforma de trading.</NoItem>
            </ul>
          </div>
        </div>
      </section>

      {/* 04 · Valores — grilla 4 columnas en desktop, mismas tarjetas del landing */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3">
          <span className="text-gold">04</span> · Valores
        </p>
        <p className="mb-4 text-navy/75 leading-relaxed">
          No son aspiracionales. Son criterios de entrada. Quien entra a la
          plataforma —como responsable o como miembro— los asume como parte del
          acuerdo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch gap-6">
          <ValueCard
            title="Transparencia"
            body="Reportes periódicos para todos los miembros. Comunicación directa, sin intermediarios. Liderazgo que rinde cuentas."
            icon={<TransparencyIcon />}
          />
          <ValueCard
            title="Unidad"
            body="Para personas que comparten visión, no solo capital. Cada miembro es parte activa, no espectador."
            icon={<UnityIcon />}
          />
          <ValueCard
            title="Valor"
            body="Tangible o intangible: activo, marca, sistema, comunidad, tracción. Real, verificable y con responsables detrás."
            icon={<ValueIcon />}
          />
          <ValueCard
            title="Legado"
            body="Lo que se construye acá es para lo que viene después. Una participación bien administrada se puede heredar."
            icon={<LegacyIcon />}
          />
        </div>
      </section>

      {/* 05 · Glosario — lista limpia: término izquierda, definición derecha */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3">
          <span className="text-gold">05</span> · Lenguaje de participaciones
        </p>
        <p className="mb-4 text-navy/75 leading-relaxed">
          Activos reales, lenguaje accesible. Familiar para quien conoce
          fintech, sin excluir a quien nunca operó en esos mercados.
        </p>
        <dl className="border-t border-navy/10">
          <Term name="Participación">
            Una fracción del proyecto. No es una acción bursátil ni un token: es
            tu lugar en la comunidad y en el valor del negocio.
          </Term>
          <Term name="Comunidad">
            El grupo de personas que conforman un proyecto Ajdut. Transparente,
            comunicada y responsable.
          </Term>
          <Term name="Respaldar">
            Lo que le da sustancia a una participación: un inmueble, una marca,
            un sistema, una comunidad, un plan de acción o la tracción del
            negocio. Siempre hay algo real detrás.
          </Term>
          <Term name="Cultivar valor">
            Ser parte de un proyecto: no solo esperar rendimiento, sino
            participar, informarse y crecer.
          </Term>
          <Term name="Legado">
            Lo que una participación bien administrada puede representar para
            quien viene después. Construimos valor que trasciende.
          </Term>
        </dl>
      </section>
    </div>
  );
}

/* ── Subcomponentes ── */

function PurposeItem({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="eyebrow !text-navy/50">{label}</p>
      <p className="mt-2 text-navy/85 leading-relaxed">{body}</p>
    </div>
  );
}

function YesItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-navy/85 leading-relaxed">
      <span aria-hidden className="text-gold shrink-0 mt-1 text-sm">+</span>
      <span>{children}</span>
    </li>
  );
}

function NoItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-navy/85 leading-relaxed">
      <span
        aria-hidden
        className="text-navy/35 shrink-0 mt-1 text-sm font-light"
      >
        ×
      </span>
      <span>{children}</span>
    </li>
  );
}

function ValueCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  // Layout: title arriba (uppercase tracked), body en el medio, icono
  // centrado al pie. `flex flex-col` + `mt-auto` empuja el icono al bottom
  // cuando los cuerpos de las cards tienen alturas distintas, manteniendo
  // los iconos alineados horizontalmente entre las 4 cards.
  return (
    <article className="select-none cursor-default h-full flex flex-col rounded-xl border border-line/80 bg-gradient-to-br from-paper-light to-paper-light/40 p-5 shadow-sm shadow-navy/5 transition-all duration-300 hover:border-gold/60 hover:shadow-md hover:shadow-navy/10 hover:-translate-y-0.5">
      <p className="font-sans font-semibold text-navy text-base uppercase tracking-wide text-center">
        {title}
      </p>
      <p className="mt-3 text-navy/75 leading-[1.5] text-[13.5px] sm:text-sm text-center">
        {body}
      </p>
      {icon && (
        <div className="mt-auto pt-6 flex justify-center text-gold">
          {icon}
        </div>
      )}
    </article>
  );
}

/* ── Íconos de los valores fundacionales (mismos del landing público) ── */

function TransparencyIcon() {
  // Cadena / link — vínculos visibles, transparencia de conexiones.
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
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
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
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
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h12l4 6-10 13L2 9z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}

function LegacyIcon() {
  // Templo clásico / columnas — patrimonio, herencia, lo que trasciende.
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-navy/10 grid grid-cols-1 md:grid-cols-[30%_70%] md:gap-x-4 py-3">
      <dt className="font-sans font-semibold text-navy leading-tight">{name}</dt>
      <dd className="text-navy/75 leading-relaxed mt-1.5 md:mt-0">
        {children}
      </dd>
    </div>
  );
}

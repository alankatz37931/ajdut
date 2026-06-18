import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { BackLink } from "@/components/app/BackLink";
import { getOptionalSession } from "@/lib/auth/session";

/** Metadata traducida — se resuelve por request usando el dict del idioma activo. */
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return {
    title: dict.nosotros.metaTitle,
    description: dict.nosotros.metaDescription,
  };
}

export default async function NosotrosPage() {
  const dict = await getDict();
  const user = await getOptionalSession();
  const t = dict.nosotros;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8 pb-4 sm:pb-6">
      {/* Hero — sin sesión, el eyebrow es el back-link; con sesión, el viewer
          ya tiene el sidebar como nav, así que un "volver" no aporta. */}
      <section className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        {user ? (
          <p className="eyebrow !text-navy/40">{t.eyebrow.replace(/^—\s*/, "")}</p>
        ) : (
          <BackLink fallback="/">{t.eyebrow.replace(/^—\s*/, "")}</BackLink>
        )}

        <h1 className="font-sans mt-2 sm:mt-3 text-[1.6rem] sm:text-[2.5rem] lg:text-[1.9rem] text-navy !leading-[1.1] font-bold break-words">
          {t.title}
        </h1>

        <p className="mt-3 sm:mt-4 text-lg sm:text-xl text-navy/80 leading-relaxed">
          {t.intro}
        </p>

        <p className="mt-3 sm:mt-4 eyebrow !text-navy/50">{t.values}</p>
      </section>

      {/* 01 Origen · 02 Propósito — dos columnas en desktop */}
      <section className="border-t border-navy/10 py-3 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 md:gap-x-12 lg:gap-x-16">
          {/* 01 · Origen */}
          <div className="pt-4">
            <p className="font-mono text-sm tracking-wider text-navy mb-3">
              <span className="text-gold">01</span> · {t.origin.title}
            </p>
            <p className="text-navy/85 leading-relaxed">{t.origin.body1}</p>
            <p className="mt-3 text-navy/85 leading-relaxed">{t.origin.body2}</p>
          </div>

          {/* 02 · Propósito */}
          <div className="pt-4">
            <p className="font-mono text-sm tracking-wider text-navy mb-3">
              <span className="text-gold">02</span> · {t.purpose.sectionTitle}
            </p>
            <div className="space-y-4">
              <PurposeItem
                label={t.purpose.mision.label}
                body={t.purpose.mision.body}
              />
              <PurposeItem
                label={t.purpose.vision.label}
                body={t.purpose.vision.body}
              />
              <PurposeItem
                label={t.purpose.propuesta.label}
                body={t.purpose.propuesta.body}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 03 · Lo que somos / lo que no somos */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3 sm:mb-4">
          <span className="text-gold">03</span> · {t.whatWeAre.sectionTitle}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <div>
            <p className="eyebrow !text-navy/50 mb-2">{t.whatWeAre.yesLabel}</p>
            <ul className="space-y-2">
              {t.whatWeAre.yes.map((item, i) => (
                <YesItem key={i}>{item}</YesItem>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow !text-navy/50 mb-2">{t.whatWeAre.noLabel}</p>
            <ul className="space-y-2">
              {t.whatWeAre.no.map((item, i) => (
                <NoItem key={i}>{item}</NoItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 04 · Valores */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3">
          <span className="text-gold">04</span> · {t.coreValues.sectionTitle}
        </p>
        <p className="mb-4 text-navy/75 leading-relaxed">{t.coreValues.intro}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch gap-6">
          <ValueCard
            title={t.coreValues.cards.transparency.title}
            body={t.coreValues.cards.transparency.body}
            icon={<TransparencyIcon />}
          />
          <ValueCard
            title={t.coreValues.cards.unity.title}
            body={t.coreValues.cards.unity.body}
            icon={<UnityIcon />}
          />
          <ValueCard
            title={t.coreValues.cards.value.title}
            body={t.coreValues.cards.value.body}
            icon={<ValueIcon />}
          />
          <ValueCard
            title={t.coreValues.cards.legacy.title}
            body={t.coreValues.cards.legacy.body}
            icon={<LegacyIcon />}
          />
        </div>
      </section>

      {/* 05 · Glosario */}
      <section className="border-t border-navy/10 py-6 mt-6">
        <p className="font-mono text-sm tracking-wider text-navy mb-3">
          <span className="text-gold">05</span> · {t.glossary.sectionTitle}
        </p>
        <p className="mb-4 text-navy/75 leading-relaxed">{t.glossary.intro}</p>
        <dl className="border-t border-navy/10">
          <Term name={t.glossary.terms.participation.name}>
            {t.glossary.terms.participation.body}
          </Term>
          <Term name={t.glossary.terms.community.name}>
            {t.glossary.terms.community.body}
          </Term>
          <Term name={t.glossary.terms.back.name}>
            {t.glossary.terms.back.body}
          </Term>
          <Term name={t.glossary.terms.cultivate.name}>
            {t.glossary.terms.cultivate.body}
          </Term>
          <Term name={t.glossary.terms.legacy.name}>
            {t.glossary.terms.legacy.body}
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
      <p className="mt-2 text-navy/85 leading-relaxed text-justify">{body}</p>
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

/* ── Íconos de los valores fundacionales ── */

function TransparencyIcon() {
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

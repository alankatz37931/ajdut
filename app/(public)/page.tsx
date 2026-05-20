import Link from "next/link";
import { getDict } from "@/lib/i18n";

export default async function HomePage() {
  const dict = await getDict();
  const t = dict.home;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-5 pb-6 sm:pt-7 sm:pb-8">
        <div className="max-w-3xl">
          <p className="eyebrow">{t.eyebrow}</p>

          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
            {t.titleLine1}
            <br />
            {t.titleLine2}
          </h1>

          <p className="mt-3 sm:mt-4 eyebrow !text-navy/50">
            {t.pillarsEyebrow}
          </p>

          <p className="mt-3 sm:mt-4 max-w-2xl text-base sm:text-lg text-navy/80 leading-relaxed">
            {t.description}
          </p>

          <div className="mt-5 sm:mt-6 flex flex-col items-stretch sm:items-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link href="/acceder" className="btn-primary text-center">
              {t.ctaSignIn}
            </Link>
            <Link href="/aplicar" className="btn-outline text-center">
              {t.ctaApply}
            </Link>
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="hairline-t grid grid-cols-1 gap-px bg-line md:grid-cols-3">
        <Pillar number="01" title={t.pillarLegacyTitle} body={t.pillarLegacyBody} />
        <Pillar number="02" title={t.pillarReportsTitle} body={t.pillarReportsBody} />
        <Pillar number="03" title={t.pillarResaleTitle} body={t.pillarResaleBody} />
      </section>

      <div className="hairline-t" />
    </div>
  );
}

function Pillar({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="bg-paper p-5 sm:p-6">
      <p className="font-mono text-sm tracking-wider text-navy">
        <span className="text-gold">{number}</span> · {title}
      </p>
      <p className="mt-3 max-w-sm text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

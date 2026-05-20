import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Aviso legal · AJDUT",
};

export default async function LegalPage() {
  const dict = await getDict();
  const t = dict.legal;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-4 pb-3 sm:pt-5 sm:pb-4">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
      </section>

      <Section n="01" title={t.sections.nature.title}>
        <p>{t.sections.nature.body}</p>
      </Section>

      <Section n="02" title={t.sections.gatekeeping.title}>
        <p>{t.sections.gatekeeping.body}</p>
      </Section>

      <Section n="03" title={t.sections.stake.title}>
        <p>{t.sections.stake.body}</p>
      </Section>

      <Section n="04" title={t.sections.distributions.title}>
        <p>{t.sections.distributions.body}</p>
      </Section>

      <Section n="05" title={t.sections.resale.title}>
        <p>{t.sections.resale.body}</p>
      </Section>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hairline-t py-3 sm:py-4">
      <p className="font-mono text-sm tracking-wider text-navy">
        <span className="text-gold">{n}</span> · {title}
      </p>
      <div className="mt-2 sm:mt-3 text-sm text-navy/85 leading-relaxed">{children}</div>
    </section>
  );
}

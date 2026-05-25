import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { BackLink } from "@/components/app/BackLink";
import { getOptionalSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.legal.metaTitle };
}

export default async function LegalPage() {
  const dict = await getDict();
  const user = await getOptionalSession();
  const t = dict.legal;
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-8">
      {/* Eyebrow: sin sesión es BackLink (volver al landing). Con sesión queda
          como label estático — el viewer navega con el sidebar. */}
      <section className="pt-5 pb-8 sm:pt-7 sm:pb-12">
        {user ? (
          <p className="eyebrow !text-navy/40">{t.eyebrow.replace(/^—\s*/, "")}</p>
        ) : (
          <BackLink fallback="/">{t.eyebrow.replace(/^—\s*/, "")}</BackLink>
        )}
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
      </section>

      <Section n="01" title={t.sections.nature.title} body={t.sections.nature.body} />
      <Section n="02" title={t.sections.gatekeeping.title} body={t.sections.gatekeeping.body} />
      <Section n="03" title={t.sections.stake.title} body={t.sections.stake.body} />
      <Section n="04" title={t.sections.distributions.title} body={t.sections.distributions.body} />
      <Section n="05" title={t.sections.resale.title} body={t.sections.resale.body} />
    </div>
  );
}

/**
 * Sección editorial del aviso legal.
 *
 * Layout:
 *  - Número en mono gold, eyebrow-tracked (peso visual del "índice")
 *  - Título sans-serif, alto contraste — el "encabezado del párrafo"
 *  - Lead (primera oración) en navy font-medium — guía de escaneo
 *  - Resto en navy/65, leading-relaxed — cuerpo de soporte
 *
 * Cada sección respira con py-12/16 — el aviso es para leer, no para escanear
 * en una grilla densa.
 */
function Section({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  const { lead, rest } = splitLead(body);
  return (
    <section className="hairline-t py-7 sm:py-9">
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-gold">
        {n}
      </p>
      <h2 className="mt-3 sm:mt-4 font-sans text-2xl sm:text-[1.625rem] text-navy leading-tight tracking-tight">
        {title}
      </h2>
      <div className="mt-5 sm:mt-6 space-y-3 text-base leading-relaxed">
        <p className="text-navy font-medium">{lead}</p>
        {rest && <p className="text-navy/65">{rest}</p>}
      </div>
    </section>
  );
}

/**
 * Separa el "lead" (primera oración) del resto. El lead opera como
 * concepto crítico de la sección — se resalta con font-medium para
 * guiar el escaneo visual. Si el body es una sola oración, todo va al lead.
 *
 * Heurística simple: split en el primer ". " (no maneja abreviaciones,
 * pero los textos legales del aviso están redactados sin ellas).
 */
function splitLead(text: string): { lead: string; rest: string } {
  const idx = text.indexOf(". ");
  if (idx === -1) return { lead: text, rest: "" };
  return { lead: text.slice(0, idx + 1), rest: text.slice(idx + 2) };
}

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-8 pb-10 sm:pt-12 sm:pb-16">
        <div className="max-w-3xl">
          <p className="eyebrow">— Comunidad cerrada de proyectos validados</p>

          <h1 className="font-sans mt-4 sm:mt-6 text-display !leading-[1.05] text-navy">
            Coordinamos
            <br />
            comunidades de negocios.
          </h1>

          <p className="mt-5 sm:mt-8 eyebrow !text-navy/50">
            Transparencia · Unidad · Valor
          </p>

          <p className="mt-6 sm:mt-8 max-w-2xl text-base sm:text-lg text-navy/80 leading-relaxed">
            AJDUT no procesa pagos ni custodia fondos. Es la herramienta de gestión,
            comunicación y certificación que respalda proyectos reales — startups,
            inmobiliarios y de mercancía — para sus socios.
          </p>

          <div className="mt-6 sm:mt-8 flex flex-col items-stretch sm:items-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link href="/acceder" className="btn-primary text-center">
              Acceder
            </Link>
            <Link href="/aplicar" className="btn-outline text-center">
              Aplica para ser parte →
            </Link>
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="hairline-t grid grid-cols-1 gap-px bg-line md:grid-cols-3">
        <Pillar
          number="01"
          title="Trazabilidad de legado"
          body="Cada cambio de propiedad de una participación queda registrado en una cadena inmutable. No se borra: se sucede."
        />
        <Pillar
          number="02"
          title="Reportes trimestrales"
          body="Documentos firmados con URL privada y marca de agua dinámica. Acceso solo para socios del proyecto."
        />
        <Pillar
          number="03"
          title="Reventa comunicativa"
          body="El cierre es externo a la plataforma. El registro es nuestro: AJDUT facilita la conversación y certifica el cambio."
        />
      </section>

      <div className="hairline-t" />
    </div>
  );
}

function Pillar({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="bg-paper p-6 sm:p-10">
      <p className="font-mono text-sm tracking-wider text-navy">
        <span className="text-gold">{number}</span> · {title}
      </p>
      <p className="mt-4 sm:mt-6 max-w-sm text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

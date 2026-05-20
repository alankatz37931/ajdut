import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-5 pb-6 sm:pt-7 sm:pb-8">
        <div className="max-w-3xl">
          <p className="eyebrow">— Comunidad cerrada de proyectos validados</p>

          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
            Coordinamos
            <br />
            comunidades de negocios.
          </h1>

          <p className="mt-3 sm:mt-4 eyebrow !text-navy/50">
            Transparencia · Unidad · Valor
          </p>

          <p className="mt-3 sm:mt-4 max-w-2xl text-base sm:text-lg text-navy/80 leading-relaxed">
            AJDUT no procesa pagos ni custodia fondos. Es la herramienta de gestión,
            comunicación y certificación que respalda proyectos reales — startups,
            inmobiliarios y de mercancía — para sus miembros.
          </p>

          <div className="mt-5 sm:mt-6 flex flex-col items-stretch sm:items-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
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
          body="Documentos firmados con URL privada y marca de agua dinámica. Acceso solo para miembros del proyecto."
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
    <div className="bg-paper p-5 sm:p-6">
      <p className="font-mono text-sm tracking-wider text-navy">
        <span className="text-gold">{number}</span> · {title}
      </p>
      <p className="mt-3 max-w-sm text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

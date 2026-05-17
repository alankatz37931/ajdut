import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre nosotros · AJDUT",
  description:
    "Ajdut coordina comunidades de negocio donde personas reales construyen valor real, juntos. Transparencia, unidad, valor y legado.",
};

export default function NosotrosPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Sobre nosotros</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-display !leading-[1.05] text-navy">
          Coordinamos comunidades de negocios.
        </h1>
        <p className="mt-4 sm:mt-5 text-base sm:text-lg text-navy/80 leading-relaxed">
          “Ajdut” proviene del hebreo antiguo y significa unidad, hermandad,
          acuerdo. Es un espacio donde proyectos con visión —respaldados por su
          tracción, su comunidad, sus sistemas, su marca o sus activos—
          encuentran a las personas correctas para crecer.
        </p>
        <p className="mt-3 eyebrow !text-navy/50">
          Transparencia · Unidad · Valor
        </p>
      </section>

      {/* Origen */}
      <Section n="01" title="Origen">
        <p>
          Ajdut no es un fondo, no es un banco, no es un exchange. Es una
          plataforma de comunidades de negocio donde el valor —tangible o
          intangible— es real, tiene respaldo genuino y personas responsables
          detrás.
        </p>
        <p className="mt-4">
          Tomamos el lenguaje intuitivo de los activos digitales
          —participaciones, portafolio, rendimiento— y lo aterrizamos en
          negocios con propósito, personas que comparten visión y una comunidad
          que se conoce, se comunica y rinde cuentas. No prometemos magia.
          Prometemos orden, transparencia y comunidad.
        </p>
      </Section>

      {/* Misión / Visión / Propuesta */}
      <Section n="02" title="Propósito">
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-3">
          <Card label="Misión">
            Coordinar comunidades de negocio donde la confianza, la comunicación
            y el valor compartido son la base de cada participación.
          </Card>
          <Card label="Visión">
            Ser la plataforma de referencia en Latinoamérica para comunidades de
            negocio donde el valor se construye colectivamente —y se hereda.
          </Card>
          <Card label="Propuesta">
            Convertimos proyectos en comunidades. Cada participación es una
            membresía activa: acceso a información, reportes y comunicación
            directa con quienes operan el negocio.
          </Card>
        </div>
      </Section>

      {/* Qué somos / qué no somos */}
      <Section n="03" title="Lo que somos">
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
          <div>
            <p className="eyebrow !text-navy/50">Lo que SÍ somos</p>
            <ul className="mt-4 space-y-3 text-navy/85 leading-relaxed">
              <li>— Una comunidad de negocios con acceso aprobado.</li>
              <li>— Un espacio de comunicación e información.</li>
              <li>— Un validador de participaciones accionarias.</li>
              <li>— Un puente entre proyectos y comunidad.</li>
            </ul>
          </div>
          <div>
            <p className="eyebrow !text-navy/50">Lo que NO somos</p>
            <ul className="mt-4 space-y-3 text-navy/85 leading-relaxed">
              <li>✕ Un fondo de inversión.</li>
              <li>✕ Un procesador de pagos o custodia de dinero.</li>
              <li>✕ Asesoría legal o financiera.</li>
              <li>✕ Un exchange ni plataforma de trading.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Valores */}
      <Section n="04" title="Valores">
        <p className="mb-5 text-navy/75 leading-relaxed">
          No son aspiracionales. Son criterios de entrada. Quien entra a la
          plataforma —como responsable o como miembro— los asume como parte del
          acuerdo.
        </p>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          <Value
            n="01"
            title="Transparencia"
            body="Reportes periódicos para todos los miembros. Comunicación directa, sin intermediarios. Liderazgo que rinde cuentas: lo bueno, lo difícil y lo que viene."
          />
          <Value
            n="02"
            title="Unidad"
            body="Para personas que comparten visión, no solo capital. Cada miembro es parte activa, no espectador. No buscamos socios pasivos: buscamos comunidad comprometida."
          />
          <Value
            n="03"
            title="Valor"
            body="Tangible o intangible: activo, marca, sistema, comunidad, tracción. Real, verificable y con responsables detrás. Innovamos en la forma, no en el fondo."
          />
          <Value
            n="04"
            title="Legado"
            body="Lo que se construye acá es para lo que viene después. Una participación bien administrada puede ser el patrimonio de la siguiente generación."
          />
        </div>
      </Section>

      {/* Glosario */}
      <Section n="05" title="Lenguaje de participaciones">
        <p className="mb-5 text-navy/75 leading-relaxed">
          Activos reales, lenguaje accesible. Familiar para quien conoce
          fintech, sin excluir a quien nunca operó en esos mercados.
        </p>
        <dl className="hairline-t">
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
    <section className="hairline-t py-5 sm:py-6">
      <p className="font-mono text-sm tracking-wider text-navy">
        <span className="text-gold">{n}</span> · {title}
      </p>
      <div className="mt-4 sm:mt-5 text-navy/85 leading-relaxed">{children}</div>
    </section>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow !text-navy/50">{label}</p>
      <p className="mt-3 text-navy/85 leading-relaxed">{children}</p>
    </div>
  );
}

function Value({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="font-mono text-sm tracking-wider">
        <span className="text-gold">{n}</span>{" "}
        <span className="text-navy">{title}</span>
      </p>
      <p className="mt-3 text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="hairline-b grid grid-cols-1 gap-2 py-4 sm:grid-cols-4 sm:gap-6">
      <dt className="font-sans text-navy sm:col-span-1">{name}</dt>
      <dd className="text-navy/75 leading-relaxed sm:col-span-3">{children}</dd>
    </div>
  );
}

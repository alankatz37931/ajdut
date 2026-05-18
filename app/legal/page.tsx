import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso legal · AJDUT",
};

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Aviso legal</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          Términos y condiciones de uso
        </h1>
      </section>

      <Section n="01" title="Naturaleza de la plataforma">
        <p>
          AJDUT es una herramienta de gestión, comunicación y certificación. No
          procesa pagos, no custodia fondos y no es un mercado financiero. Toda
          transacción económica entre las partes ocurre por fuera de la
          plataforma.
        </p>
      </Section>

      <Section n="02" title="Gatekeeping">
        <p>
          El acceso a AJDUT requiere aplicación previa y aprobación manual del
          equipo. No existe registro abierto.
        </p>
      </Section>

      <Section n="03" title="Stake institucional">
        <p>
          AJDUT mantiene una participación económica del 10% en cada proyecto
          activo. Esta proporción queda documentada en el Platform Equity
          Agreement firmado entre AJDUT y el founder al momento de aprobación.
        </p>
      </Section>

      <Section n="04" title="Distribuciones">
        <p>
          AJDUT no procesa, custodia ni facilita el pago de distribuciones de
          dividendos. Los fondos se transfieren fuera de la plataforma según los
          términos acordados entre founder y socio. AJDUT registra la
          declaración, el envío y la recepción con fines de trazabilidad y
          auditoría. El founder es responsable de las retenciones fiscales
          aplicables.
        </p>
      </Section>

      <Section n="05" title="Reventa de participaciones">
        <p>
          Las reventas son comunicativas. El cierre se realiza fuera de la
          plataforma. El cambio de titularidad se ejecuta únicamente tras
          validación del Admin con doble firma cuando corresponda.
        </p>
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

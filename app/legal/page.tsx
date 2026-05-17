import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso legal · AJDUT",
};

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Aviso legal</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-display !leading-[1.05] text-navy">
          Términos y condiciones de uso
        </h1>
      </section>

      <div className="hairline-t space-y-8 py-5 text-navy/85 leading-relaxed sm:py-6">
        <section>
          <h2 className="font-sans text-h2 text-navy">
            01 · Naturaleza de la plataforma
          </h2>
          <p className="mt-3">
            AJDUT es una herramienta de gestión, comunicación y certificación. No
            procesa pagos, no custodia fondos y no es un mercado financiero. Toda
            transacción económica entre las partes ocurre por fuera de la
            plataforma.
          </p>
        </section>

        <section>
          <h2 className="font-sans text-h2 text-navy">02 · Gatekeeping</h2>
          <p className="mt-3">
            El acceso a AJDUT requiere aplicación previa y aprobación manual del
            equipo. No existe registro abierto.
          </p>
        </section>

        <section>
          <h2 className="font-sans text-h2 text-navy">
            03 · Stake institucional
          </h2>
          <p className="mt-3">
            AJDUT mantiene una participación económica del 10% en cada proyecto
            activo. Esta proporción queda documentada en el Platform Equity
            Agreement firmado entre AJDUT y el founder al momento de aprobación.
          </p>
        </section>

        <section>
          <h2 className="font-sans text-h2 text-navy">04 · Distribuciones</h2>
          <p className="mt-3">
            AJDUT no procesa, custodia ni facilita el pago de distribuciones de
            dividendos. Los fondos se transfieren fuera de la plataforma según los
            términos acordados entre founder y socio. AJDUT registra la
            declaración, el envío y la recepción con fines de trazabilidad y
            auditoría. El founder es responsable de las retenciones fiscales
            aplicables.
          </p>
        </section>

        <section>
          <h2 className="font-sans text-h2 text-navy">
            05 · Reventa de participaciones
          </h2>
          <p className="mt-3">
            Las reventas son comunicativas. El cierre se realiza fuera de la
            plataforma. El cambio de titularidad se ejecuta únicamente tras
            validación del Admin con doble firma cuando corresponda.
          </p>
        </section>
      </div>
    </div>
  );
}

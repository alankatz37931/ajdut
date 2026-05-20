import { prisma } from "@/lib/db/client";
import { ConfirmButton } from "./ConfirmButton";
import { BackLink } from "@/components/app/BackLink";

export const metadata = {
  title: "Verificación de vida · AJDUT",
};

type Params = { params: Promise<{ id: string }> };

export default async function ConfirmarVidaPage({ params }: Params) {
  const { id } = await params;

  // Buscamos el check con datos mínimos del user para personalizar el saludo.
  const check = await prisma.validationCheck.findUnique({
    where: { id },
    include: {
      user: {
        select: { fullName: true, alias: true },
      },
    },
  });

  if (!check) {
    return <NeutralView title="Link no válido" body="El link que usaste no corresponde a ninguna verificación." />;
  }

  if (check.status !== "PENDING") {
    return (
      <NeutralView
        title="Verificación ya respondida"
        body={
          check.status === "CONFIRMED"
            ? "Esta verificación ya fue confirmada. No hace falta que hagas nada más."
            : "Esta verificación venció. Si recibís otra en los próximos días, respondé esa."
        }
      />
    );
  }

  const greetingName =
    check.user.alias ?? check.user.fullName.split(" ")[0] ?? "amigo";

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">Verificación de vida</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">
        Hola, {greetingName}. ¿Seguís todo bien?
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">
        Esta es una verificación periódica de AJDUT. Solo necesitamos que toques
        el botón para confirmar que seguís activo. Si no respondés en los
        próximos días, contactaremos a los herederos que cargaste en tu cuenta.
      </p>

      <ConfirmButton checkId={id} />
    </div>
  );
}

function NeutralView({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">Verificación de vida</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

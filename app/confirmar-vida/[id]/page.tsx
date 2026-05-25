import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { ConfirmButton } from "./ConfirmButton";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.confirmarVida.metaTitle };
}

type Params = { params: Promise<{ id: string }> };

export default async function ConfirmarVidaPage({ params }: Params) {
  const { id } = await params;
  const dict = await getDict();
  const t = dict.confirmarVida;

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
    return (
      <NeutralView
        title={t.invalidLinkTitle}
        body={t.invalidLinkBody}
        back={t.back}
      />
    );
  }

  if (check.status !== "PENDING") {
    return (
      <NeutralView
        title={t.alreadyTitle}
        body={
          check.status === "CONFIRMED"
            ? t.alreadyConfirmedBody
            : t.alreadyExpiredBody
        }
        back={t.back}
      />
    );
  }

  const greetingName =
    check.user.alias ?? check.user.fullName.split(" ")[0] ?? t.fallbackName;

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.back}</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">
        {t.greeting.replace("{name}", greetingName)}
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{t.body}</p>

      <ConfirmButton checkId={id} dict={t} />
    </div>
  );
}

function NeutralView({
  title,
  body,
  back,
}: {
  title: string;
  body: string;
  back: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{back}</BackLink>
      <h1 className="font-sans mt-6 text-h1 text-navy">{title}</h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{body}</p>
    </div>
  );
}

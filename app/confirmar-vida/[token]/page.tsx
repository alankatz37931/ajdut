import type { Metadata } from "next";
import { ConfirmButton } from "./ConfirmButton";
import { BackLink } from "@/components/app/BackLink";
import { getDict } from "@/lib/i18n";
import { inspectValidationToken } from "@/lib/services/heirs";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.confirmarVida.metaTitle };
}

type Params = { params: Promise<{ token: string }> };

export default async function ConfirmarVidaPage({ params }: Params) {
  const { token } = await params;
  const dict = await getDict();
  const t = dict.confirmarVida;

  // Lookup vía SHA-256(token). Si el token no matchea ningún check, devolvemos
  // la vista neutra "link inválido" sin filtrar info. Si matchea pero ya fue
  // respondido o expiró, mostramos el mensaje correspondiente.
  const result = await inspectValidationToken(token);

  if (!result.ok) {
    if (result.reason === "ALREADY_RESPONDED") {
      return (
        <NeutralView
          title={t.alreadyTitle}
          body={t.alreadyConfirmedBody}
          back={t.back}
        />
      );
    }
    if (result.reason === "EXPIRED") {
      return (
        <NeutralView
          title={t.alreadyTitle}
          body={t.alreadyExpiredBody}
          back={t.back}
        />
      );
    }
    return (
      <NeutralView
        title={t.invalidLinkTitle}
        body={t.invalidLinkBody}
        back={t.back}
      />
    );
  }

  const greetingName =
    result.check.user.alias ??
    result.check.user.fullName.split(" ")[0] ??
    t.fallbackName;

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:px-6 pb-section">
      <BackLink fallback="/">{t.back}</BackLink>

      <h1 className="font-sans mt-6 text-h1 text-navy">
        {t.greeting.replace("{name}", greetingName)}
      </h1>
      <p className="mt-4 text-navy/75 leading-relaxed">{t.body}</p>

      <ConfirmButton token={token} dict={t} />
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

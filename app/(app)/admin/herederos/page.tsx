import { requireRole } from "@/lib/auth/session";
import { listEscalatedUsers } from "@/lib/services/heirs";
import { formatDate } from "@/lib/utils/format";
import { RunCronButton } from "./RunCronButton";

export const metadata = { title: "Herederos · AJDUT" };

export default async function AdminHerederosPage() {
  await requireRole(["ADMIN"]);
  const escalated = await listEscalatedUsers();

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Herederos</h1>
        <p className="mt-3 font-mono text-sm text-navy/75">
          {escalated.length === 0
            ? "Bandeja al día."
            : `${escalated.length} miembro${escalated.length === 1 ? "" : "s"} pendiente${
                escalated.length === 1 ? "" : "s"
              } de contactar.`}
        </p>
      </header>

      <div className="mt-6">
        <RunCronButton />
      </div>

      <div className="mt-10">
        {escalated.length === 0 ? (
          <p className="text-navy/60">
            No hay miembros con verificaciones de vida escaladas. Todo en
            orden.
          </p>
        ) : (
          <ul className="space-y-6">
            {escalated.map((u) => {
              const totalShare = u.heirs.reduce(
                (s, h) => s + h.sharePercent,
                0
              );
              const displayName = u.alias ?? u.fullName;
              return (
                <li key={u.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className="shrink-0 w-[3px] self-stretch bg-gold"
                  />
                  <div className="flex-1 min-w-0 py-2 pr-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-sans text-navy text-lg leading-tight">
                        {displayName}
                      </p>
                      <p className="eyebrow shrink-0 !text-navy/40">
                        {u.missedValidationCount} sin responder
                      </p>
                    </div>
                    <p className="mt-1 eyebrow truncate normal-case tracking-normal !text-navy/60">
                      {u.email}
                    </p>
                    {u.lastValidationConfirmedAt && (
                      <p className="mt-1 eyebrow !text-navy/40">
                        Última confirmación: {formatDate(u.lastValidationConfirmedAt)}
                      </p>
                    )}

                    <div className="mt-4 hairline p-4 bg-paper">
                      <p className="eyebrow">
                        Herederos cargados —{" "}
                        <span className="font-mono text-navy">
                          {totalShare.toFixed(2)}%
                        </span>{" "}
                        asignado
                      </p>
                      {u.heirs.length === 0 ? (
                        <p className="mt-3 text-navy/60">
                          Este miembro no cargó herederos. Contactalo por su
                          email registrado o reviendo la cuenta directamente.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {u.heirs.map((h) => (
                            <li
                              key={h.id}
                              className="grid grid-cols-12 gap-3 items-start hairline-t pt-3"
                            >
                              <div className="col-span-12 sm:col-span-5">
                                <p className="font-sans text-navy">
                                  {h.fullName}
                                </p>
                                {h.relationship && (
                                  <p className="mt-1 eyebrow">
                                    {h.relationship}
                                  </p>
                                )}
                              </div>
                              <div className="col-span-12 sm:col-span-5 min-w-0">
                                {h.email ? (
                                  <a
                                    href={`mailto:${h.email}`}
                                    className="eyebrow normal-case tracking-normal !text-navy hover:!text-gold break-all"
                                  >
                                    {h.email}
                                  </a>
                                ) : (
                                  <p className="eyebrow !text-navy/40">
                                    Sin email
                                  </p>
                                )}
                              </div>
                              <div className="col-span-12 sm:col-span-2 font-mono text-navy sm:text-right">
                                {h.sharePercent.toFixed(2)}%
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

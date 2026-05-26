import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { listEscalatedUsers } from "@/lib/services/heirs";
import { getDict, getLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { RunCronButton } from "./RunCronButton";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.adminHerederos };
}

export default async function AdminHerederosPage() {
  await requireRole(["ADMIN"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.adminHerederos;
  const escalated = await listEscalatedUsers();

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-3xl">{t.intro}</p>
      </header>

      <RunCronButton dict={t.cron} locale={locale} />

      <div className="mt-8">
        {escalated.length === 0 ? (
          <p className="text-navy/60">{t.emptyAll}</p>
        ) : (
          <ul>
            {escalated.map((u) => {
              const totalShare = u.heirs.reduce(
                (s, h) => s + h.sharePercent,
                0
              );
              const displayName = u.alias ?? u.fullName;
              return (
                <li key={u.id} className="hairline-b py-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-sans text-navy text-lg leading-tight">
                      {displayName}
                    </p>
                    <p className="eyebrow shrink-0 !text-gold">
                      {t.missedFmt.replace(
                        "{n}",
                        String(u.missedValidationCount)
                      )}
                    </p>
                  </div>

                  <p className="mt-2 eyebrow normal-case tracking-normal !text-navy/60">
                    <a
                      href={`mailto:${u.email}`}
                      className="hover:!text-gold transition-colors"
                    >
                      {u.email}
                    </a>
                    {u.lastValidationConfirmedAt && (
                      <>
                        <span className="!text-navy/30"> · </span>
                        <span className="!text-navy/40">
                          {t.lastConfirmedFmt.replace(
                            "{date}",
                            formatDate(u.lastValidationConfirmedAt, locale)
                          )}
                        </span>
                      </>
                    )}
                  </p>

                  <div className="mt-5">
                    <p className="eyebrow !text-navy/50">
                      {t.heirsLoadedFmt
                        .split(/(\{pct\})/)
                        .map((part, i) =>
                          part === "{pct}" ? (
                            <span key={i} className="font-mono text-navy">
                              {totalShare.toFixed(2)}
                            </span>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                    </p>

                    {u.heirs.length === 0 ? (
                      <p className="mt-3 text-sm text-navy/60">
                        {t.noHeirsLoaded}
                      </p>
                    ) : (
                      <ul className="mt-3">
                        {u.heirs.map((h) => (
                          <li
                            key={h.id}
                            className="hairline-t py-3 grid grid-cols-12 gap-3 items-baseline"
                          >
                            <div className="col-span-12 sm:col-span-5 min-w-0">
                              <p className="font-sans text-navy">
                                {h.fullName}
                              </p>
                              {h.relationship && (
                                <p className="mt-0.5 eyebrow !text-navy/40">
                                  {h.relationship}
                                </p>
                              )}
                            </div>
                            <div className="col-span-12 sm:col-span-5 min-w-0">
                              {h.email ? (
                                <a
                                  href={`mailto:${h.email}`}
                                  className="eyebrow normal-case tracking-normal !text-navy/70 hover:!text-gold break-all"
                                >
                                  {h.email}
                                </a>
                              ) : (
                                <span className="eyebrow !text-navy/40">
                                  {t.noEmail}
                                </span>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getUserPreferences } from "@/lib/preferences";
import { getDict, getLocale } from "@/lib/i18n";
import { getRoleLabel } from "@/components/app/nav-items";
import {
  listHeirs,
  getValidationState,
  type HeirRow,
  type ValidationState,
} from "@/lib/services/heirs";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { SettingsSurface } from "./SettingsSurface";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.settings.metaTitle };
}

export default async function SettingsPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const dict = await getDict();
  const locale = await getLocale();
  const roleLabel = await getRoleLabel(user.role);

  // Defaults defensivos: si listHeirs / getValidationState fallan (DB blip,
  // user gone), la página entra con valores neutros en vez de crashear. El
  // user puede recargar; si el problema persiste, el error queda en logs.
  const validationFallback: ValidationState = {
    frequencyMonths: 0,
    lastConfirmedAt: null,
    missedCount: 0,
    heirsEscalated: false,
    pendingCheck: null,
  };
  const [heirs, validation] = await sequentialPrisma([
    {
      run: () => listHeirs(user.id),
      fallback: [] as HeirRow[],
      tag: "configuracion:listHeirs",
    },
    {
      run: () => getValidationState(user.id),
      fallback: validationFallback,
      tag: "configuracion:getValidationState",
    },
  ] as const);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{dict.settings.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          {dict.settings.title}
        </h1>
      </header>

      <SettingsSurface
        initialLanguage={prefs.language}
        initialCurrency={prefs.currency}
        roleLabel={roleLabel}
        initialHeirs={heirs.map((h) => ({
          id: h.id,
          fullName: h.fullName,
          email: h.email,
          relationship: h.relationship,
          sharePercent: h.sharePercent,
        }))}
        initialValidation={{
          frequencyMonths: validation.frequencyMonths,
          lastConfirmedAt: validation.lastConfirmedAt
            ? validation.lastConfirmedAt.toISOString()
            : null,
          missedCount: validation.missedCount,
          heirsEscalated: validation.heirsEscalated,
          pendingCheck: validation.pendingCheck
            ? {
                id: validation.pendingCheck.id,
                sentAt: validation.pendingCheck.sentAt.toISOString(),
              }
            : null,
        }}
        settingsDict={dict.settings}
        heirsDict={dict.heirs}
        locale={locale}
      />
    </div>
  );
}

import { requireSession } from "@/lib/auth/session";
import { getUserPreferences } from "@/lib/preferences";
import { ROLE_LABEL } from "@/components/app/nav-items";
import { listHeirs, getValidationState } from "@/lib/services/heirs";
import { SettingsForm } from "./SettingsForm";
import { HeirsAndValidation } from "./HeirsAndValidation";

export const metadata = {
  title: "Configuración · AJDUT",
};

export default async function SettingsPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;

  const [heirs, validation] = await Promise.all([
    listHeirs(user.id),
    getValidationState(user.id),
  ]);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Tu cuenta</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Configuración</h1>
      </header>

      <SettingsForm
        initialLanguage={prefs.language}
        initialCurrency={prefs.currency}
        initialTheme={prefs.theme}
        roleLabel={roleLabel}
      />

      <HeirsAndValidation
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
      />
    </div>
  );
}

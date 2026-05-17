import { requireSession } from "@/lib/auth/session";
import { getUserPreferences } from "@/lib/preferences";
import { ROLE_LABEL } from "@/components/app/nav-items";
import { SettingsForm } from "./SettingsForm";

export const metadata = {
  title: "Configuración · AJDUT",
};

export default async function SettingsPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div>
      <h1 className="font-sans text-h1 text-navy">Configuración</h1>

      <SettingsForm
        initialLanguage={prefs.language}
        initialCurrency={prefs.currency}
        initialTheme={prefs.theme}
        roleLabel={roleLabel}
      />
    </div>
  );
}

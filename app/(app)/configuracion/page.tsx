import { requireSession } from "@/lib/auth/session";
import { getUserPreferences } from "@/lib/preferences";
import { SettingsForm } from "./SettingsForm";

export const metadata = {
  title: "Configuración · AJDUT",
};

export default async function SettingsPage() {
  await requireSession();
  const prefs = await getUserPreferences();

  return (
    <div className="max-w-2xl">
      <h1 className="font-sans text-h1 text-navy">Configuración</h1>
      <p className="mt-3 text-navy/75 leading-relaxed">
        Ajustá las preferencias de tu cuenta. Se guardan en este navegador.
      </p>

      <SettingsForm
        initialLanguage={prefs.language}
        initialCurrency={prefs.currency}
      />
    </div>
  );
}

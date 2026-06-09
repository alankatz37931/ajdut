import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getUserPreferences } from "@/lib/preferences";
import { getDict } from "@/lib/i18n";
import { getRoleLabel } from "@/components/app/nav-items";
import { SettingsSurface } from "./SettingsSurface";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.settings.metaTitle };
}

export default async function SettingsPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const dict = await getDict();
  const roleLabel = await getRoleLabel(user.role);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{dict.settings.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
          {dict.settings.title}
        </h1>
      </header>

      <SettingsSurface
        initialLanguage={prefs.language}
        initialCurrency={prefs.currency}
        roleLabel={roleLabel}
        settingsDict={dict.settings}
      />
    </div>
  );
}

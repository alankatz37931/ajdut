"use server";

import { getDict } from "@/lib/i18n";
import { setPasswordFromToken } from "@/lib/services/password-setup";

export type SetPasswordResult =
  | { ok: true; email: string }
  | { ok: false; error: string; code: string };

export async function setPasswordAction(
  token: string,
  formData: FormData
): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (password !== passwordConfirm) {
    const dict = await getDict();
    return { ok: false, error: dict.setPassword.errPasswordMismatch, code: "PASSWORD_MISMATCH" };
  }

  const res = await setPasswordFromToken({
    plainToken: token,
    newPassword: password,
  });

  if (!res.ok) return res;
  return { ok: true, email: res.email };
}

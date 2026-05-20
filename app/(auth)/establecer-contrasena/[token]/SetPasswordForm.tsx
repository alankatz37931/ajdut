"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { setPasswordAction } from "./actions";
import { FloatingInput } from "@/components/ui/Floating";

export function SetPasswordForm({ token }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"form" | "submitting" | "logging-in">("form");
  const [, startTransition] = useTransition();

  function passwordChecks() {
    const lengthOk = password.length >= 10;
    const match = password.length > 0 && password === passwordConfirm;
    return { lengthOk, match, allOk: lengthOk && match };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("submitting");

    const formData = new FormData();
    formData.append("password", password);
    formData.append("passwordConfirm", passwordConfirm);

    startTransition(async () => {
      const r = await setPasswordAction(token, formData);
      if (!r.ok) {
        setError(r.error);
        setStage("form");
        return;
      }

      setStage("logging-in");
      const loginResult = await signIn("credentials", {
        email: r.email,
        password,
        redirect: false,
      });

      if (loginResult?.error) {
        setError("Contraseña establecida, pero falló el login automático. Probá entrar en /acceder.");
        return;
      }

      router.push("/redirect-by-role");
    });
  }

  const checks = passwordChecks();
  const busy = stage !== "form";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <FloatingInput
          id="password"
          type="password"
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
          required
        />
        <p className={`mt-2 eyebrow ${checks.lengthOk ? "!text-navy" : ""}`}>
          {checks.lengthOk ? "✓ " : ""}Mínimo 10 caracteres
        </p>
      </div>

      <div>
        <FloatingInput
          id="passwordConfirm"
          type="password"
          label="Repetir contraseña"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          required
        />
        {passwordConfirm.length > 0 && (
          <p className={`mt-2 eyebrow ${checks.match ? "!text-navy" : ""}`}>
            {checks.match ? "✓ coinciden" : "no coinciden"}
          </p>
        )}
      </div>

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !checks.allOk}
        className="btn-primary w-full disabled:opacity-50"
      >
        {stage === "submitting"
          ? "Estableciendo…"
          : stage === "logging-in"
          ? "Entrando…"
          : "Establecer y entrar"}
      </button>
    </form>
  );
}

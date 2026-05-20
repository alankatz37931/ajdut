"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { Dict } from "@/lib/i18n";
import { FloatingInput } from "@/components/ui/Floating";

export function LoginForm({ dict }: { dict: Dict["login"] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(dict.invalidCredentials);
        return;
      }

      router.push("/redirect-by-role");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FloatingInput
        id="email"
        type="email"
        label={dict.emailLabel}
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />

      <FloatingInput
        id="password"
        type="password"
        label={dict.passwordLabel}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      />

      {error && (
        <p className="eyebrow !text-navy" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full disabled:opacity-50"
      >
        {isPending ? dict.verifying : dict.submit}
      </button>
    </form>
  );
}

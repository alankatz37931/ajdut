"use client";

import { useLanguageSync } from "@/components/hooks/useLanguageSync";

/**
 * Monta `useLanguageSync` sin UI propia para que el layout autenticado
 * reciba refresh automático cuando otra pestaña cambia el idioma. Va dentro
 * del AppShell — no necesita props porque el hook se autoabastece de
 * BroadcastChannel.
 */
export function LanguageSyncBoundary(): null {
  useLanguageSync();
  return null;
}

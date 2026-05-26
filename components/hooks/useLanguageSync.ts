"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Sincroniza cambios de idioma entre pestañas abiertas. Cuando una pestaña
 * llama a `broadcast()`, el resto recibe el mensaje vía BroadcastChannel y
 * dispara `router.refresh()` para que los server components re-rendericen
 * con el dict nuevo. La pestaña emisora NO recibe su propio mensaje, así
 * que no hay loop infinito ni refresh doble.
 *
 * SSR-safe: BroadcastChannel sólo se instancia en el cliente; en server el
 * hook devuelve un noop.
 */
const CHANNEL_NAME = "ajdut-lang";

export function useLanguageSync(): { broadcast: () => void } {
  const router = useRouter();
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = () => {
      router.refresh();
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [router]);

  const broadcast = useCallback(() => {
    channelRef.current?.postMessage({ at: Date.now() });
  }, []);

  return { broadcast };
}

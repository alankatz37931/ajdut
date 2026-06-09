import { NextResponse } from "next/server";
import { processDueReleases } from "@/lib/services/vesting";

/**
 * Cron de vesting — procesa los releases vencidos.
 *
 * Configurado en `vercel.json` con `schedule: "0 8 * * *"` (diario 08:00 UTC).
 * Vercel Cron invoca este GET con el header `Authorization: Bearer ${CRON_SECRET}`.
 *
 * IMPORTANTE: configurar la env var `CRON_SECRET` en Vercel (Project Settings →
 * Environment Variables). Sin ella, el endpoint rechaza todo (no procesa nada)
 * para evitar disparos no autorizados.
 *
 * Llama `processDueReleases`, que por cada VestingRelease PENDING vencido crea
 * un PendingAssignment (mismo flujo de validación que una invitación directa).
 */

// Este handler toca la DB y depende de env vars de runtime: nunca debe quedar
// estático/cacheado por el build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/vesting] CRON_SECRET no está configurado — rechazando.");
    return NextResponse.json(
      { ok: false, error: "Cron no configurado." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await processDueReleases(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/vesting] error procesando releases", e);
    return NextResponse.json(
      { ok: false, error: "Error procesando releases de vesting." },
      { status: 500 }
    );
  }
}

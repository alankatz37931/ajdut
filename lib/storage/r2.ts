/**
 * Cloudflare R2 — storage privado para uploads de la plataforma (Ola 7d).
 *
 * R2 es S3-compatible: usamos `@aws-sdk/client-s3` apuntando a
 * `https://<account>.r2.cloudflarestorage.com` con region "auto".
 *
 * Diseño de "graceful degradation":
 *   - Si las env vars no están seteadas (típico en dev local sin Cloudflare),
 *     `isR2Configured()` devuelve false y NINGUNA otra función crashea el
 *     proceso por importarse. El caller (API route / componente) decide cómo
 *     degradar: la UI cae al input "pegar URL pública" que ya teníamos.
 *   - Si SÍ está configurado pero las credenciales son inválidas, el error
 *     aparece recién al firmar/uploadear — eso ya es problema operativo, no
 *     un design flaw.
 *
 * No persistimos nada acá: solo emitimos URLs firmadas. La persistencia del
 * `publicUrl` resultante la hace el caller (Prisma update en su action).
 */

import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type UploadScope =
  | "profile-photo"
  | "id-photo"
  | "report-attachment"
  | "project-doc"
  | "chat-attachment";

/** Resultado del firmado de upload. publicUrl es la URL final donde quedará el objeto. */
export type PresignedUpload = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
};

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

function readEnv(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

/**
 * True solo si las 5 env vars están presentes (no vacías).
 * Llamable desde server components, API routes y server actions.
 */
export function isR2Configured(): boolean {
  return readEnv() !== null;
}

let clientCache: { client: S3Client; env: R2Env } | null = null;

/**
 * Devuelve un S3Client memoizado configurado para R2.
 * Throws si R2 no está configurado — protejé con `isR2Configured()` primero.
 */
export function getR2Client(): { client: S3Client; env: R2Env } {
  if (clientCache) return clientCache;
  const env = readEnv();
  if (!env) {
    throw new Error("R2 storage no está configurado.");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // R2 prefiere path-style; force es seguro y evita problemas con buckets
    // que tienen "." o subdominios virtuales.
    forcePathStyle: false,
  });
  clientCache = { client, env };
  return clientCache;
}

/** Slugify simple sin deps: lowercase, ASCII, sin espacios, conservando extensión. */
function slugifyFilename(original: string): string {
  // Separá extensión.
  const lastDot = original.lastIndexOf(".");
  const namePart = lastDot > 0 ? original.slice(0, lastDot) : original;
  const extPart = lastDot > 0 ? original.slice(lastDot + 1) : "";

  const normalized = namePart
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const ext = extPart
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 10);

  const base = normalized.length > 0 ? normalized : "file";
  return ext.length > 0 ? `${base}.${ext}` : base;
}

/**
 * Genera una key estable para guardar el objeto. Estructura:
 *   `${scope}/${userId}/${timestamp}-${random}-${slugifiedFilename}`
 *
 * El timestamp + random evita colisiones si dos uploads simultáneos del mismo
 * usuario tienen el mismo nombre. La key NO se reutiliza para overwrites.
 */
export function generateUploadKey({
  scope,
  userId,
  originalName,
}: {
  scope: UploadScope;
  userId: string;
  originalName: string;
}): string {
  const slug = slugifyFilename(originalName);
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}/${userId}/${ts}-${random}-${slug}`;
}

/**
 * Construye una presigned URL para PUT directo desde el browser.
 *
 * - `key`: ruta dentro del bucket. Usá `generateUploadKey` para que sea única.
 * - `contentType`: el browser DEBE enviar este Content-Type exacto en el PUT,
 *   o R2 rechaza la firma. El caller (FileUpload) ya lo garantiza.
 * - `expiresSeconds`: ventana de validez de la URL firmada. 300s = 5 min.
 *
 * Devuelve además `publicUrl` (la URL final, post-upload). Si el bucket está
 * mapeado a un custom domain (recomendado), usamos `R2_PUBLIC_URL`. Si no, el
 * fallback es la URL S3-style del endpoint, que NO es necesariamente accesible
 * públicamente — por eso `R2_PUBLIC_URL` es obligatorio en `isR2Configured`.
 */
export async function createPresignedUploadUrl({
  key,
  contentType,
  expiresSeconds = 300,
}: {
  key: string;
  contentType: string;
  expiresSeconds?: number;
}): Promise<PresignedUpload> {
  const { client, env } = getR2Client();
  const command = new PutObjectCommand({
    Bucket: env.bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresSeconds,
  });

  // Public URL: preferimos el custom domain configurado (R2_PUBLIC_URL).
  // Si en el futuro alguien lo deja vacío, caemos al endpoint S3-style del
  // bucket dentro del subdomain del account — pero ese path requiere que el
  // bucket esté en modo "Public" en Cloudflare. Por eso `R2_PUBLIC_URL` es
  // obligatorio en `isR2Configured`.
  const base = env.publicUrl.replace(/\/+$/, "");
  const publicUrl = `${base}/${key}`;

  return { uploadUrl, publicUrl, key };
}

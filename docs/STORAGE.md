# Storage (Cloudflare R2) — Ola 7d

AJDUT usa **Cloudflare R2** (S3-compatible) para alojar:

- Foto de perfil (`User.avatarUrl`)
- Foto de identificación / KYC (`User.idPhotoUrl`)
- Adjuntos de reportes trimestrales (`Report.storageKey`)
- Documentos de proyecto (pitch deck, data room, etc.)
- Adjuntos de chat (futuro)

> **Importante**: mientras no configures R2, los uploads caen a "Pegar URL del
> archivo" y la app sigue funcionando. Toda la UI ya tiene el input URL
> alternativo y un mensaje claro `Storage no configurado; pegá una URL pública`.

---

## Arquitectura

```
Browser ── POST /api/uploads/presign ──> Next.js (server)
                                              │
                                              ▼
                                  lib/storage/r2.ts (S3 SDK)
                                              │
                                              ▼
                                      Cloudflare R2 bucket
                                              ▲
Browser ── PUT presigned URL ─────────────────┘
        (sube el blob directo, sin pasar por nuestro server)
```

- El server **nunca toca el binario**. Solo firma URLs.
- El browser PUTea directo al bucket con la URL firmada (válida 5 min).
- La URL pública final (`R2_PUBLIC_URL/<key>`) se persiste en la DB del lado
  del caller (action que ya tenía Prisma update).

---

## Cómo configurar R2 (paso a paso)

### 1) Crear bucket en Cloudflare

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**.
2. **Create bucket** → nombre: `ajdut-docs` (o el que prefieras; ese valor va
   a `R2_BUCKET_NAME`).
3. Elegí región (Auto está bien para arrancar).

### 2) Conectar un dominio público (recomendado)

R2 tiene dos opciones para servir archivos:

- **Custom domain** (recomendado): mapeás `cdn.ajdut.io` (o similar) al bucket.
  CORS, caching y URLs limpias. Esto va en `R2_PUBLIC_URL`.
- **Public bucket** (rápido para dev): activás el bucket como público y usás
  el dominio `pub-xxxxx.r2.dev`.

Para custom domain:

1. En el bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Ingresá `cdn.ajdut.io` (o el subdominio elegido).
3. Cloudflare crea automáticamente el record DNS si el dominio está en
   Cloudflare. Si no, agregás el CNAME manualmente.
4. `R2_PUBLIC_URL` queda: `https://cdn.ajdut.io`.

Para public bucket (modo dev):

1. **Settings** → **Public access** → **Allow Access**.
2. Copiá el `pub-xxxxxxxxxxxxxxxx.r2.dev` que Cloudflare te da.
3. `R2_PUBLIC_URL` queda: `https://pub-xxxxxxxxxxxxxxxx.r2.dev`.

### 3) Generar API Token (Access Key + Secret)

1. R2 → **Manage R2 API Tokens** → **Create API Token**.
2. Permisos: **Object Read & Write** sobre el bucket `ajdut-docs`.
3. Cloudflare devuelve:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - **Account ID** (lo ves arriba a la derecha del dashboard) → `R2_ACCOUNT_ID`
4. Guardalos en `dev.env` / `production.env` (gitignored) — **nunca** los
   pongas en el repo.

### 4) Configurar CORS en el bucket

Sin CORS, el PUT del browser hacia la URL firmada va a fallar con
`No 'Access-Control-Allow-Origin' header`.

En el bucket → **Settings** → **CORS Policy** → pegá esto:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://ajdut.io",
      "https://www.ajdut.io"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Reemplazá los orígenes por los reales de tu deploy (dominios de producción
y staging si tenés).

### 5) Setear las env vars

En `.env` local y en el panel de Vercel (production):

```bash
R2_ACCOUNT_ID="<account id de Cloudflare>"
R2_ACCESS_KEY_ID="<access key del token>"
R2_SECRET_ACCESS_KEY="<secret del token>"
R2_BUCKET_NAME="ajdut-docs"
R2_PUBLIC_URL="https://cdn.ajdut.io"   # o el pub-xxxx.r2.dev si es dev
```

Las 5 deben estar presentes y no vacías. Si **cualquiera** falta,
`isR2Configured()` devuelve `false` y la app degrada al input URL manual.

---

## Verificar la primera subida

1. Reiniciá `pnpm dev`.
2. Andá a `/perfil`.
3. En "Foto de perfil" elegí una imagen chica (JPG/PNG).
4. Deberías ver el progreso `Subiendo… NN%`.
5. Si funciona: aparece la miniatura y al guardar el formulario, el campo
   `User.avatarUrl` queda persistido.
6. En el dashboard de R2 → bucket → **Objects**: debería aparecer
   `profile-photo/<userId>/<timestamp>-<random>-<filename>`.

### Si falla con CORS

El browser muestra un error tipo `Access to fetch at ... has been blocked
by CORS policy`. Revisá:

- Que la política CORS del bucket incluya **exactamente** el origen del
  navegador (`http://localhost:3000`, no `localhost:3000` sin scheme).
- Que `AllowedMethods` incluya `PUT`.
- Que esperaste ~1 minuto tras guardar la política (a veces tarda en
  propagar en R2).

### Si falla con 401 / SignatureDoesNotMatch

- El `Content-Type` que el browser manda en el PUT debe ser **idéntico** al
  que se usó para firmar. El componente `FileUpload` ya lo garantiza
  (usa `file.type` para ambas).
- Verificá que la `R2_SECRET_ACCESS_KEY` no esté truncada (las secrets de
  Cloudflare son largas).

### Si tira 503 con `R2_NOT_CONFIGURED`

Falta alguna env var. La UI lo maneja automáticamente: muestra "Storage no
configurado; pegá una URL pública" y deja al usuario operar con URLs
externas (Google Drive, Dropbox, etc.).

---

## Scopes y límites

Definidos en `app/api/uploads/presign/route.ts`:

| Scope               | Tamaño máx | Tipos permitidos                                 |
| ------------------- | ---------- | ------------------------------------------------ |
| `profile-photo`     | 5 MB       | `image/png`, `image/jpeg`, `image/webp`          |
| `id-photo`          | 5 MB       | `image/png`, `image/jpeg`, `application/pdf`     |
| `report-attachment` | 25 MB      | PDF, Excel (xlsx/xls), Word (docx/doc), PNG, JPG |
| `project-doc`       | 25 MB      | Idem report-attachment                           |
| `chat-attachment`   | 25 MB      | Cualquiera (filtro futuro en composer)           |

Todos validan size y MIME **en el server** (no solo en el cliente).

---

## Estructura de keys

```
<scope>/<userId>/<timestamp>-<random>-<filename-slugificado>
```

Ejemplo: `profile-photo/clxyz123/1715567891-9k2m4n7p-foto-perfil.jpg`

Esto permite:

- Encontrar todos los uploads de un usuario buscando por prefijo.
- Borrar uploads viejos (ej. al cambiar avatar) buscando keys anteriores.
- Auditar por scope.

---

## Costos esperados

R2 no cobra egress (a diferencia de S3). El esquema de pricing es:

- Storage: USD 0.015 / GB / mes
- Class A operations (PUT, POST, LIST): USD 4.50 / millón
- Class B operations (GET, HEAD): USD 0.36 / millón

Para AJDUT con ~100 usuarios y ~10MB de avatars + algunos PDFs cada uno,
estás en USD 0.50 / mes. Trivial.

---

## Seguridad

- Las presigned URLs **expiran a los 5 minutos** (`expiresSeconds: 300`).
- Solo usuarios autenticados pueden pedirlas (`requireSession` en el route).
- El bucket NO debe estar listable públicamente — solo accesible por key
  exacta vía `R2_PUBLIC_URL`.
- Para `id-photo` (KYC) considerá:
  - Configurar el dominio público con un sub-path restringido.
  - O moverlo a un bucket separado privado y servirlo con URLs firmadas
    también para GET (futura iteración).

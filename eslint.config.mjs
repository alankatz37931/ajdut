// Flat Config (ESLint 9 / Next 15).
//
// Usamos FlatCompat para extender `eslint-config-next` (que sigue siendo
// "legacy" eslintrc) — es lo que recomienda Next.js para Flat Config hoy.
// Cuando upstream publique configs flat nativos, simplificamos.
//
// Reglas custom (al final, sobrescriben los presets):
//   - no-unused-vars:   permitido si la variable empieza con "_"
//   - no-console:       solo `console.warn`/`console.error` (safePrisma + dev)
//   - import/order:     orden estándar (si el plugin está disponible)
//   - react/no-unescaped-entities: off — el dict usa comillas tipográficas
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  // Ignores globales — equivalente a .eslintignore.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },

  // Presets oficiales de Next.js.
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Reglas del proyecto.
  {
    rules: {
      // Allow `_`-prefixed params/locals for "intentionally unused" pattern.
      // El preset de Next pone @typescript-eslint/no-unused-vars en warn —
      // lo reconfiguramos para que respete el prefijo `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // console.error / console.warn están permitidos — los usamos en
      // safePrisma, en wrappers de email y en el handler de errores global.
      // console.log es ruido: si lo necesitás en dev, envolvelo en
      // `if (process.env.NODE_ENV !== "production")`.
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // Curly quotes en strings del dict ("¿Qué", "—", etc.) son legítimas;
      // la regla de React produce ruido sin valor.
      "react/no-unescaped-entities": "off",

      // import/order: el preset de Next no lo activa. Lo dejamos en warn
      // para fomentar consistencia sin romper builds existentes. NO forzamos
      // posición de `import type` (lo dejamos donde el autor lo puso) — solo
      // pedimos que builtin/external/internal vengan en orden.
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
          ],
          "newlines-between": "ignore",
        },
      ],
    },
  },

  // global-error.tsx: este boundary se monta cuando el root layout crasheó —
  // <Link /> no funciona acá (el router no está montado), por eso usamos <a>
  // directo a "/". La regla de Next no entiende este caso especial.
  {
    files: ["app/global-error.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

export default config;

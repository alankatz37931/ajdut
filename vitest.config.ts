import { defineConfig } from "vitest/config";
import path from "node:path";

// Config mínima de Vitest para tests unitarios de funciones puras + algunas
// integraciones con prisma mockeado. No corre tests del directorio de Next
// (.next, node_modules, build artifacts).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@wenvy/contracts": fileURLToPath(new URL("./packages/contracts/src/contract-index.ts", import.meta.url)),
      "@wenvy/domain": fileURLToPath(new URL("./packages/domain/src/domain-index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    typecheck: {
      enabled: true,
      tsconfig: "tsconfig.test.json"
    }
  }
});

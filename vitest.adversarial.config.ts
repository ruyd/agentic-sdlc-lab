import { defineConfig } from "vitest/config";

// The adversarial agent's tests live in test/adversarial/ (gitignored) and are excluded from the main
// suite; this config runs only them: npm run test:adversarial
export default defineConfig({ test: { include: ["test/adversarial/**/*.test.ts"] } });

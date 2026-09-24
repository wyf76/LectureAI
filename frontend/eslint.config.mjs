import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  { files: ["**/*.{js,mjs,ts,tsx}"], extends: [js.configs.recommended], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ["**/*.{ts,tsx}"], extends: [tseslint.configs.recommended] },
  // API boundaries deliberately discard raw errors that may contain private request details.
  { files: ["lib/api.ts"], rules: { "preserve-caught-error": "off" } },
);

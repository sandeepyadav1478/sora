import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  { rules: { "no-console": "error" } },
  // Node CLI build scripts (sync-sources, adapters): console output is the
  // intended progress/error UX, not stray debugging — allow it here only.
  { files: ["scripts/**"], rules: { "no-console": "off" } },
  { ignores: ["dist/**", ".astro", "public/pagefind/**"] },
];

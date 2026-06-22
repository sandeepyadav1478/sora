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
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Astro frontmatter variables used in templates are invisible to ESLint's
    // scope analysis — disable unused-vars for .astro files entirely.
    files: ["**/*.astro"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  { ignores: ["dist/**", ".astro", "public/pagefind/**"] },
];

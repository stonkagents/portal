import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  /* ── Global ignores ── */
  {
    ignores: [
      ".next/",
      "out/",
      "node_modules/",
      "*.config.{js,mjs,ts}",
      "next-env.d.ts",
    ],
  },

  /* ── Base: ESLint recommended ── */
  js.configs.recommended,

  /* ── TypeScript: recommended type-aware rules ── */
  ...tseslint.configs.recommended,

  /* ── React ── */
  {
    plugins: { react },
    settings: { react: { version: "detect" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "warn",
      "react/jsx-no-target-blank": "error",
    },
  },

  /* ── React Hooks ── */
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  /* ── JSX Accessibility ── */
  {
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },

  /* ── Technical Standards rules ── */
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      /* From technical-standards.md */
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "no-eval": "error",
      "guard-for-in": "error",
      "prefer-destructuring": [
        "error",
        { object: true, array: false },
      ],

      /* Console — allow warn/error for now, structured logging comes later */
      "no-console": ["warn", { allow: ["warn", "error"] }],

      /* TypeScript extras */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],

      /* Naming conventions */
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],
    },
  },

  /* ── Prettier — must be last to override conflicting rules ── */
  prettier,
);

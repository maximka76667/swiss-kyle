import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui-generated code, copied in wholesale rather than hand-written
    // for this app. All of components.json's aliases (components, ui, lib/
    // utils, hooks) point under src/shadcn/, so every future `shadcn add`
    // run lands somewhere already covered here — no new override needed
    // per file/component the way we used to add one at a time. Only the
    // two rules known to fire on vendored output are turned off; everything
    // else (rules-of-hooks, etc.) still applies, since those catch real
    // bugs regardless of where the code came from.
    //
    // - only-export-components is a Fast Refresh/dev-ergonomics concern,
    //   not about correctness — irrelevant for code we don't hand-edit.
    // - set-state-in-effect flags a real cascading-render pattern, but
    //   fixing it means restructuring vendored source we don't want to
    //   permanently fork; `shadcn add --overwrite` would silently undo a
    //   per-file fix anyway.
    files: ["src/shadcn/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

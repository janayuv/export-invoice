import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Not linted: build output, Rust target dir, and generated assets.
  { ignores: ["dist", "src-tauri/target", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Classic, high-value Hooks rules only. eslint-plugin-react-hooks v6's
      // full "recommended" preset also enables experimental React-Compiler
      // rules (set-state-in-effect, refs, incompatible-library) that flag this
      // app's standard load-in-effect and react-hook-form patterns as errors.
      // This codebase does not use the React Compiler, so those rules are
      // false positives here — opt in to just the two stable rules instead.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Allow intentionally-unused args/vars when prefixed with underscore.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Node-context config files use Node globals, not browser.
  {
    files: ["*.config.{js,ts}", "vite.config.ts", "vitest.config.ts"],
    languageOptions: { globals: globals.node },
  },
  // Keep ESLint out of Prettier's lane: disable formatting rules.
  prettier,
);

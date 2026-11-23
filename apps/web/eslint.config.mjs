import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    parser: tsParser,
  },
  plugins: {
    "@typescript-eslint": tseslint,
  },
  rules: {
    "@typescript-eslint/no-empty-function": ["error", { allow: ["arrowFunctions"] }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    // React Compiler rules added in eslint-config-next 16.4; existing code predates them.
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/refs": "warn",
    "react-hooks/preserve-manual-memoization": "warn"
  }
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "tailwind.config.js"]
}];

export default eslintConfig;

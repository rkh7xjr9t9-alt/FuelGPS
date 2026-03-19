import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  },
];

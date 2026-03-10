import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/*.lock", "**/.*"]), {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    extends: compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"),

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            ...globals.jest,
        },

        parser: tsParser,
    },

    rules: {
        "padding-line-between-statements": [2, {
            blankLine: "always",
            prev: ["const", "let", "var"],
            next: "*",
        }, {
            blankLine: "any",
            prev: ["const", "let", "var"],
            next: ["const", "let", "var"],
        }, {
            blankLine: "always",
            prev: "*",
            next: "return",
        }, {
            blankLine: "always",
            prev: "*",
            next: "block-like",
        }, {
            blankLine: "always",
            prev: "block-like",
            next: "*",
        }, {
            blankLine: "never",
            prev: "case",
            next: "*",
        }, {
            blankLine: "never",
            prev: "*",
            next: "case",
        }, {
            blankLine: "always",
            prev: "function",
            next: "*",
        }, {
            blankLine: "always",
            prev: "import",
            next: "*",
        }, {
            blankLine: "any",
            prev: "import",
            next: "import",
        }],

        "@typescript-eslint/no-explicit-any": 0,

        "@typescript-eslint/no-unused-vars": [0, {
            args: "after-used",
            caughtErrors: "none",
        }],

        "@typescript-eslint/ban-ts-comment": 0,
        "@typescript-eslint/no-non-null-assertion": 0,
        "@typescript-eslint/no-empty-function": 0,
        "@typescript-eslint/no-unused-expressions": 0,

        "prefer-const": [0, {
            destructuring: "all",
        }],

        "no-console": "error",
        "no-sparse-arrays": 0,
    },
}]);
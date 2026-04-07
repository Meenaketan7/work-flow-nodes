// eslint.config.js (ESM, flat config)
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";
import importPlugin from "eslint-plugin-import";
import pluginRouter from "@tanstack/eslint-plugin-router";
import stylisticPlugin from "@stylistic/eslint-plugin";

const compat = new FlatCompat({
	baseDirectory: import.meta.dirname
});

/**
 * Goals:
 * - Enforce correctness & quality (types, no unused vars/imports).
 * - Keep React hooks rules.
 * - Keep import hygiene and import sorting.
 * - Do NOT enforce stylistic formatting rules here (Prettier handles formatting).
 */
export default tseslint.config(
	{ ignores: ["dist", "scripts/**", "src/components/ui/**", "coverage"] },
	{
		extends: [
			// tanstack plugin recommended helpers (file-based router checks)
			...pluginRouter.configs["flat/recommended"],
			// core JS recommended
			js.configs.recommended,
			tseslint.configs.recommended
		],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: globals.browser,
			parserOptions: {
				// required by typescript-eslint projectService usage
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
			"simple-import-sort": simpleImportSort,
			import: importPlugin
		},
		settings: {
			"import/resolver": {
				typescript: {
					project: ["./tsconfig.json"]
				}
			}
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": "off",
			"@typescript-eslint/only-throw-error": "off",
			"@typescript-eslint/no-empty-function": "off",
			quotes: "off",
			"comma-dangle": "off",
			"import/prefer-default-export": "off",
			"react-hooks/exhaustive-deps": "off",
			"@typescript-eslint/ban-ts-comment": "warn",
			// TODO: This rule will be switched ON after complete revamp of frontend
			"@typescript-eslint/no-explicit-any": "off",
			"import/no-extraneous-dependencies": "off",
			"import/no-duplicates": "off",
			"no-console": "off",
			"arrow-body-style": "off",
			"no-underscore-dangle": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"simple-import-sort/exports": "off",
			"simple-import-sort/imports": "off",
			"import/first": "off",
			"import/newline-after-import": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/incompatible-library": "off",
			"react-hooks/purity": "off",
			"react-hooks/preserve-manual-memoization": "off",

			// ===================================================================
			// UNUSED VARIABLES & IMPORTS RULES
			// ===================================================================

			// Detect unused variables (including function params, caught errors, etc.)
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					// Variables starting with _ are allowed to be unused
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					// Don't check function arguments by default (common in React props)
					args: "after-used",
					// Ignore rest siblings in destructuring (const {x, ...rest} = obj)
					ignoreRestSiblings: true
				}
			],

			// Disable the base ESLint rule as @typescript-eslint/no-unused-vars handles it better
			"no-unused-vars": "warn",

			// Prevent unused imports (catches imports that are never used)
			"no-unused-private-class-members": "error"
		}
	},
	...compat.extends("prettier"),
	{
		rules: Object.fromEntries(
			Object.keys(stylisticPlugin.configs["all"].rules ?? {}).map((key) => [key, "off"])
		)
	}
);
